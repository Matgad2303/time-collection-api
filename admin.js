// Painel de administração: relatos, visão geral, agentes e ajuda com contas.
// Só para contas com is_admin (definido com: npm run tornar-admin -- email@exemplo.com).
const router = require("express").Router();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { query, one } = require("./db");
const { wrap, need, HttpError, pick } = require("./http");
const { requireAuth } = require("./authlib");
const { aiEnabled, MODEL, FAKE } = require("./ai");
const agents = require("./agents");

// Confere no banco a cada chamada (tirar o admin vale na hora, sem esperar o token expirar)
router.use(requireAuth, wrap(async (req, _res, next) => {
  const u = await one("select is_admin from users where id=$1", [req.user.id]);
  if (!u || !u.is_admin) throw new HttpError(403, "Área só para administradores.");
  next();
}));

// Visão geral
router.get("/overview", wrap(async (_req, res) => {
  const count = async (sql) => (await one(sql)).n;
  const [users, users7, watches, communities, posts, promos] = await Promise.all([
    count("select count(*)::int n from users"),
    count("select count(*)::int n from users where created_at > now() - interval '7 days'"),
    count("select count(*)::int n from docs where path like 'data/users/%' and data->>'kind' = 'watch' and coalesce(data->>'status','') <> 'desejo'"),
    count("select coalesce(sum(jsonb_array_length(coalesce(data->'communities','[]'::jsonb))),0)::int n from docs where path='cm'"),
    count("select count(*)::int n from docs where path like 'cm/%/x'"),
    count("select coalesce(sum(jsonb_array_length(coalesce(data->'items','[]'::jsonb))),0)::int n from docs where path='promo'"),
  ]);
  const feedback = await query("select status, count(*)::int n from feedback group by status");
  const hunts = await query(`select r->>'status' status, count(*)::int n from docs, jsonb_array_elements(coalesce(data->'reqs','[]'::jsonb)) r
                              where path='hunts' group by 1`);
  const ai30 = await one(
    `select count(*)::int runs, count(*) filter (where status='error')::int errors,
            coalesce(sum(input_tokens),0)::bigint input_tokens, coalesce(sum(output_tokens),0)::bigint output_tokens,
            coalesce(sum(searches),0)::int searches
       from agent_runs where started_at > now() - interval '30 days'`);
  const lastNews = await one("select max(data->>'edition') edition from docs where path='news' and id like 'edition-%'");
  res.json({
    users, users_last_7_days: users7, watches, communities, posts, promos,
    feedback: Object.fromEntries(feedback.map((r) => [r.status, r.n])),
    hunts: Object.fromEntries(hunts.map((r) => [r.status, r.n])),
    ai: { enabled: aiEnabled(), fake: FAKE, model: MODEL, last_30_days: ai30,
      current_edition: agents.currentEdition(), last_news_edition: lastNews.edition },
  });
}));

// Relatos
router.get("/feedback", wrap(async (req, res) => {
  const params = [];
  let where = "";
  if (req.query.status === "open") where = "where f.status in ('new','seen','doing')";
  else if (req.query.status) { params.push(req.query.status); where = "where f.status=$1"; }
  const rows = await query(
    `select f.*, u.handle, u.name, u.email from feedback f left join users u on u.id=f.user_id
      ${where} order by (f.status='new') desc, f.created_at desc limit 300`, params);
  res.json({ feedback: rows });
}));

router.patch("/feedback/:id", wrap(async (req, res) => {
  const f = pick(req.body, ["status", "reply"]);
  if (f.status && !["new", "seen", "doing", "done", "wontfix"].includes(f.status)) throw new HttpError(400, "Status inválido.");
  if (!Object.keys(f).length) throw new HttpError(400, "Nada para atualizar.");
  const row = await one(
    `update feedback set status=coalesce($2,status),
            reply=case when $3::boolean then $4 else reply end,
            replied_at=case when $3::boolean then now() else replied_at end,
            updated_at=now()
      where id=$1 returning *`,
    [req.params.id, f.status || null, f.reply !== undefined, f.reply ? String(f.reply).trim().slice(0, 3000) : null]);
  if (!row) throw new HttpError(404, "Relato não encontrado.");
  res.json({ feedback: row });
}));

// Gera uma senha provisória para quem esqueceu a senha (a equipe envia para a pessoa)
router.post("/reset-password", wrap(async (req, res) => {
  need(req.body, ["email"]);
  const u = await one("select id, handle from users where email=$1", [String(req.body.email).trim().toLowerCase()]);
  if (!u) throw new HttpError(404, "Nenhuma conta com esse e-mail.");
  const temp = crypto.randomBytes(6).toString("base64url");
  await query("update users set password_hash=$2, updated_at=now() where id=$1", [u.id, await bcrypt.hash(temp, 10)]);
  res.json({ handle: u.handle, temporary_password: temp });
}));

// Agentes
router.get("/agent-runs", wrap(async (_req, res) => {
  res.json({ runs: await query("select * from agent_runs order by started_at desc limit 50") });
}));

router.post("/agents/news", wrap(async (req, res) => {
  if (!aiEnabled()) throw new HttpError(400, "Agentes desligados: configure ANTHROPIC_API_KEY.");
  res.json(await agents.runNews({ force: Boolean(req.body.force) }));
}));

router.post("/agents/hunts", wrap(async (_req, res) => {
  if (!aiEnabled()) throw new HttpError(400, "Agentes desligados: configure ANTHROPIC_API_KEY.");
  res.json({ processed: await agents.processHunts() });
}));



module.exports = router;
