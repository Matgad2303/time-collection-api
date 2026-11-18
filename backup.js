// Cópia de segurança diária do banco (o plano grátis do Supabase não faz backup).
// Todas as tabelas viram um JSON, que é comprimido e criptografado (AES-256-GCM) com a
// senha BACKUP_PASSPHRASE. O arquivo vai para um repositório PRIVADO do GitHub
// (BACKUP_REPO = "dono/repositorio", BACKUP_GITHUB_TOKEN com permissão de escrita só nele).
// Fica uma cópia por dia, guardando as últimas BACKUP_KEEP (padrão 30).
// Sem essas três variáveis, nada acontece. Restaurar: npm run backup:restaurar -- arquivo.tcbk
const crypto = require("crypto");
const zlib = require("zlib");
const { pool, query, one } = require("./db");

const MAGIC = Buffer.from("TCBK1");
const KEEP = Math.max(3, Number(process.env.BACKUP_KEEP) || 30);
const configured = () => !!(process.env.BACKUP_PASSPHRASE && process.env.BACKUP_REPO && process.env.BACKUP_GITHUB_TOKEN);

const keyFrom = (pass, salt) => crypto.scryptSync(String(pass), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

function encrypt(plain, pass) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyFrom(pass, salt), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}

function decrypt(buf, pass) {
  if (!buf.subarray(0, 5).equals(MAGIC)) throw new Error("Este arquivo não é uma cópia do Time Collection.");
  const salt = buf.subarray(5, 21), iv = buf.subarray(21, 33), tag = buf.subarray(33, 49);
  const d = crypto.createDecipheriv("aes-256-gcm", keyFrom(pass, salt), iv);
  d.setAuthTag(tag);
  try { return Buffer.concat([d.update(buf.subarray(49)), d.final()]); }
  catch (e) { throw new Error("Senha da cópia errada (ou arquivo danificado)."); }
}

async function tables() {
  return (await query(`select table_name t from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE' order by 1`)).map((r) => r.t);
}

// Monta o arquivo criptografado com todas as tabelas
async function makeBackup() {
  const out = { app: "time-collection", version: 1, created_at: new Date().toISOString(), tables: {} };
  for (const t of await tables()) out.tables[t] = await query(`select * from "${t}"`);
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(out)), { level: 9 });
  const counts = Object.fromEntries(Object.entries(out.tables).map(([k, v]) => [k, v.length]));
  return { file: encrypt(gz, process.env.BACKUP_PASSPHRASE), counts };
}

function openBackup(buf, pass) {
  return JSON.parse(zlib.gunzipSync(decrypt(buf, pass)).toString("utf8"));
}

async function gh(method, path, body) {
  const r = await fetch("https://api.github.com/repos/" + process.env.BACKUP_REPO + path, {
    method,
    headers: { Authorization: "Bearer " + process.env.BACKUP_GITHUB_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "time-collection-backup" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 404 && method === "GET") return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? {} : r.json();
}

// Faz a cópia, envia ao GitHub e apaga as antigas
async function runBackup() {
  const startedAt = new Date();
  try {
    const { file, counts } = await makeBackup();
    const day = new Date().toISOString().slice(0, 10);
    const path = `/contents/copias/${day}.tcbk`;
    const old = await gh("GET", path);
    await gh("PUT", path, { message: `Cópia de ${day}`, content: file.toString("base64"), sha: old && old.sha });
    const list = ((await gh("GET", "/contents/copias")) || []).filter((f) => /\.tcbk$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    for (const f of list.slice(0, Math.max(0, list.length - KEEP))) await gh("DELETE", "/contents/copias/" + f.name, { message: "Apaga cópia antiga", sha: f.sha });
    const detail = `${day} · ${(file.length / 1024).toFixed(0)} KB · ` + Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(" ");
    await query(`insert into agent_runs (agent, ref, status, detail, started_at, finished_at) values ('backup',$1,'ok',$2,$3,now())`, [day, detail.slice(0, 500), startedAt]);
    return { ok: true, day, size: file.length, counts };
  } catch (e) {
    await query(`insert into agent_runs (agent, ref, status, detail, started_at, finished_at) values ('backup',null,'error',$1,$2,now())`, [String(e.message).slice(0, 500), startedAt]);
    console.error("[backup] falhou", e.message);
    throw e;
  }
}

// Confere de hora em hora; faz uma cópia por dia (depois das 3h no horário de Fortaleza)
function startBackups() {
  if (!configured()) { console.log("[backup] desligado (faltam BACKUP_PASSPHRASE, BACKUP_REPO ou BACKUP_GITHUB_TOKEN)"); return; }
  const tick = async () => {
    try {
      const hourBr = (new Date().getUTCHours() + 21) % 24;
      if (hourBr < 3) return;
      const done = await one(`select 1 from agent_runs where agent='backup' and status='ok' and started_at > now() - interval '20 hours'`);
      if (!done) await runBackup();
    } catch (e) { /* já registrado; tenta de novo na próxima hora */ }
  };
  setTimeout(tick, 60 * 1000).unref();
  setInterval(tick, 60 * 60 * 1000).unref();
}

// Restaura uma cópia num banco (apaga o que existe nas tabelas da cópia e regrava tudo)
async function restore(data) {
  const names = Object.keys(data.tables);
  const deps = await query(`select tc.relname child, tp.relname parent from pg_constraint c
    join pg_class tc on tc.oid=c.conrelid join pg_class tp on tp.oid=c.confrelid
    join pg_namespace n on n.oid=tc.relnamespace where c.contype='f' and n.nspname='public'`);
  const order = [], seen = new Set();
  const visit = (t) => { if (seen.has(t)) return; seen.add(t); deps.filter((d) => d.child === t && d.parent !== t).forEach((d) => visit(d.parent)); order.push(t); };
  names.forEach(visit);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`truncate ${names.map((t) => `"${t}"`).join(", ")} cascade`);
    for (const t of order.filter((x) => names.includes(x))) {
      const rows = data.tables[t];
      for (let i = 0; i < rows.length; i += 200) {
        await client.query(`insert into "${t}" select * from json_populate_recordset(null::"${t}", $1::json)`, [JSON.stringify(rows.slice(i, i + 200))]);
      }
    }
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; }
  finally { client.release(); }
}

module.exports = { configured, makeBackup, openBackup, runBackup, startBackups, restore, encrypt, decrypt };
