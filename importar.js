// Importa os dados exportados do protótipo (app no Claude) para uma conta do app novo.
// Uso:  npm run importar -- caminho/para/colecao.json email-da-conta@exemplo.com
// O arquivo tem { colecao: {...}, publico: {...}, comunidades: {...}, news: {...} }, no formato do protótipo.
// Pode rodar de novo: os documentos com o mesmo id são substituídos, nada é duplicado.
require("dotenv").config();
const fs = require("fs");
const { pool, one, query } = require("./db");

const [file, email] = process.argv.slice(2);

const put = (path, id, owner, data) => query(
  `insert into docs (path, id, owner_id, data) values ($1,$2,$3,$4)
   on conflict (path, id) do update set data=excluded.data, owner_id=excluded.owner_id, updated_at=now()`,
  [path, id, owner, data]);

(async () => {
  if (!file || !email) throw new Error("Uso: npm run importar -- arquivo.json email@da.conta");
  const src = JSON.parse(fs.readFileSync(file, "utf8"));
  const u = await one("select id, handle from users where email=$1", [email.toLowerCase()]);
  if (!u) throw new Error("Nenhuma conta com esse e-mail. Crie a conta pelo app antes de importar.");

  const items = Object.entries(src.colecao || {});
  for (const [id, data] of items) await put(`data/users/${u.id}`, id, u.id, data);
  if (src.publico) await put("public", u.id, u.id, src.publico);
  if (src.comunidades) await put("cm", u.id, u.id, src.comunidades);
  const news = Object.entries(src.news || {});
  for (const [id, data] of news) await put("news", id, null, data);

  const kinds = {};
  for (const [, d] of items) kinds[d.kind] = (kinds[d.kind] || 0) + 1;
  console.log(`Importado para @${u.handle}: ${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", ")}; ` +
    `${src.publico ? "perfil público, " : ""}${src.comunidades ? "comunidades, " : ""}${news.length} documentos do NEWS FLEX.`);
})()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => pool.end());
