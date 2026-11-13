// Relatos: qualquer pessoa (logada ou não) envia problemas, ideias e pedidos de ajuda com a conta.
// A equipe lê e responde pelo painel de administração (admin.js) ou pelo terminal (npm run relatos).
const router = require("express").Router();
const { query, one } = require("./db");
const { wrap, need, HttpError, rateLimit } = require("./http");
const { requireAuth, optionalAuth } = require("./authlib");

const KINDS = ["bug", "idea", "account", "other"];
const cut = (v, max) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim().slice(0, max));

// Enviar relato
router.post("/", rateLimit({ windowMs: 60 * 60 * 1000, max: 30 }), optionalAuth, wrap(async (req, res) => {
  need(req.body, ["message"]);
  const message = String(req.body.message).trim();
  if (message.length < 5) throw new HttpError(400, "Conte um pouco mais sobre o que aconteceu.");
  const contact = cut(req.body.contact, 160);
  if (!req.user && !contact) throw new HttpError(400, "Informe um e-mail ou WhatsApp para a gente responder.");
  const f = await one(
    `insert into feedback (user_id, kind, message, contact, page, device, app_version, last_error)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, kind, status, created_at`,
    [req.user?.id || null, KINDS.includes(req.body.kind) ? req.body.kind : "bug", message.slice(0, 5000), contact,
      cut(req.body.page, 300), cut(req.body.device || req.headers["user-agent"], 400), cut(req.body.app_version, 40),
      cut(req.body.last_error, 1000)]);
  console.log(`[relato] novo relato ${f.id} (${f.kind})`);
  res.status(201).json({ feedback: f });
}));

// Meus relatos, com status e resposta da equipe
router.get("/mine", requireAuth, wrap(async (req, res) => {
  const rows = await query(
    `select id, kind, message, page, status, reply, replied_at, created_at from feedback
      where user_id=$1 order by created_at desc limit 50`, [req.user.id]);
  res.json({ feedback: rows });
}));

module.exports = router;
