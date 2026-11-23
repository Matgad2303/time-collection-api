const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: 10,
  // Desempenho (23/11/2026): o banco fica em São Paulo e a API na Virgínia; abrir conexão custa caro.
  // Mantém a conexão aberta por 5 min sem uso (antes: 10 s) para a próxima tela não pagar a reconexão.
  idleTimeoutMillis: 5 * 60 * 1000,
  keepAlive: true,
});
// Uma conexão parada que cai (o banco reinicia, a rede pisca) não pode derrubar a API: só registra.
pool.on("error", (err) => console.error("Conexão com o banco caiu (vai reconectar sozinha):", err.message));

// Atalho: query(sql, params) -> rows
async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

module.exports = { pool, query, one };
