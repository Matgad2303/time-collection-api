// Aplica, em ordem, os arquivos .sql desta pasta que ainda não rodaram
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("./db");

(async () => {
  await pool.query("create table if not exists schema_migrations (name text primary key, ran_at timestamptz default now())");
  const done = new Set((await pool.query("select name from schema_migrations")).rows.map(r => r.name));
  const dir = __dirname;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    console.log("Aplicando", f);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(fs.readFileSync(path.join(dir, f), "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [f]);
      await client.query("commit");
    } catch (e) { await client.query("rollback"); throw e; }
    finally { client.release(); }
  }
  console.log("Banco atualizado.");
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
