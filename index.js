require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { pool } = require("./db");

const { rateLimit } = require("./http");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // o Render fica na frente da API; assim req.ip é o IP real do usuário
app.use(express.json({ limit: "2mb" }));
const origins = (process.env.CORS_ORIGIN || "*").split(",").map(s => s.trim().replace(/\/$/, ""));
app.use(cors({ origin: origins.includes("*") ? "*" : origins }));

// Saúde (usado pelo Render para saber se a API está no ar)
app.get("/health", async (_req, res) => {
  try { await pool.query("select 1"); res.json({ ok: true, db: true }); }
  catch { res.status(503).json({ ok: false, db: false }); }
});

// Limita tentativas de login/cadastro por IP (protege contra força bruta)
app.use("/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use("/auth/register", rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }));
app.use("/auth", require("./auth").router);
app.use("/users", require("./users"));
app.use("/watches", require("./watches"));
app.use("/communities", require("./communities"));
app.use("/market", require("./market"));
app.use("/hunts", require("./hunts"));
app.use("/news", require("./news"));

app.use((_req, res) => res.status(404).json({ error: "Rota não encontrada." }));

// Tratador central de erros: mensagens em português para o front
// Erros do Postgres que são culpa do dado enviado, não do servidor
const PG_ERRORS = {
  "22P02": [400, "Algum dado está em formato inválido."],     // ex.: id que não é uuid, texto em campo numérico
  "22007": [400, "Data inválida. Use o formato AAAA-MM-DD."],
  "22008": [400, "Data inválida. Use o formato AAAA-MM-DD."],
  "22003": [400, "Número fora do limite permitido."],
  "23505": [409, "Este registro já existe."],
  "23503": [404, "Registro relacionado não encontrado."],
  "23514": [400, "Valor não permitido."],
};

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido no corpo da requisição." });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Requisição grande demais." });
  if (err.code && PG_ERRORS[err.code]) {
    const [status, error] = PG_ERRORS[err.code];
    return res.status(status).json({ error });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Erro interno. Tente de novo em instantes." : err.message });
});

if (require.main === module) {
  const port = process.env.PORT || 3001;
  const server = app.listen(port, () => console.log(`Time Collection API na porta ${port}`));
  // Desligamento limpo quando o Render reinicia o serviço
  process.on("SIGTERM", () => server.close(() => pool.end().then(() => process.exit(0))));
}

module.exports = app;
