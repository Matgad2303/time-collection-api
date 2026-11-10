require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { pool } = require("./db");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: (process.env.CORS_ORIGIN || "*").split(",").map(s => s.trim()) }));

// Saúde (usado pelo Render para saber se a API está no ar)
app.get("/health", async (_req, res) => {
  try { await pool.query("select 1"); res.json({ ok: true, db: true }); }
  catch { res.status(503).json({ ok: false, db: false }); }
});

app.use("/auth", require("./auth").router);
app.use("/users", require("./users"));
app.use("/watches", require("./watches"));
app.use("/communities", require("./communities"));
app.use("/market", require("./market"));
app.use("/hunts", require("./hunts"));
app.use("/news", require("./news"));

app.use((_req, res) => res.status(404).json({ error: "Rota não encontrada." }));

// Tratador central de erros: mensagens em português para o front
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Erro interno. Tente de novo em instantes." : err.message });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Time Collection API na porta ${port}`));
