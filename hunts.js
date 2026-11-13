// ECONOMY Time: pedidos de busca ("caçador sob pedido") e radar de marcas
const router = require("express").Router();
const { query, one } = require("./db");
const { wrap, need, HttpError } = require("./http");
const { requireAuth } = require("./authlib");
const { aiEnabled } = require("./ai");
const { kickHunts } = require("./agents");

// Limites para controlar o custo dos agentes
const HUNTS_PER_DAY = Number(process.env.HUNTS_PER_DAY || 5);
const MAX_OPEN_HUNTS = 3;

router.use(requireAuth);

// Meus pedidos com resultados
router.get("/", wrap(async (req, res) => {
  const hunts = await query("select * from hunts where user_id=$1 order by created_at desc limit 50", [req.user.id]);
  const ids = hunts.map(h => h.id);
  const items = ids.length ? await query("select * from hunt_results where hunt_id = any($1) order by price nulls last", [ids]) : [];
  res.json({
    // O erro técnico fica só no painel de administração
    hunts: hunts.map(({ error, ...h }) => ({ ...h, items: items.filter(i => i.hunt_id === h.id) })),
    ai_enabled: aiEnabled(),
    limit_per_day: HUNTS_PER_DAY,
  });
}));

// Novo pedido (status pending; um processo externo preenche os resultados)
router.post("/", wrap(async (req, res) => {
  need(req.body, ["query"]);
  const cond = ["novo", "usado", "tanto faz"].includes(req.body.condition) ? req.body.condition : "tanto faz";
  const { today, open } = await one(
    `select count(*) filter (where created_at > now() - interval '24 hours')::int as today,
            count(*) filter (where status in ('pending','working'))::int as open
       from hunts where user_id=$1 and source='user'`, [req.user.id]);
  if (open >= MAX_OPEN_HUNTS) throw new HttpError(429, `Você já tem ${open} buscas em andamento. Espere uma terminar.`);
  if (today >= HUNTS_PER_DAY) throw new HttpError(429, `Limite de ${HUNTS_PER_DAY} buscas por dia atingido. Tente amanhã.`);
  const h = await one(`insert into hunts (user_id, query, budget, condition) values ($1,$2,$3,$4) returning *`,
    [req.user.id, String(req.body.query).trim().slice(0, 120), req.body.budget || null, cond]);
  kickHunts();
  res.status(201).json({ hunt: { ...h, items: [] } });
}));

// Tentar de novo um pedido que falhou
router.post("/:id/retry", wrap(async (req, res) => {
  const h = await one(`update hunts set status='pending', attempts=0, error=null
                        where id=$1 and user_id=$2 and status='failed' returning *`, [req.params.id, req.user.id]);
  if (!h) throw new HttpError(404, "Pedido não encontrado ou não falhou.");
  kickHunts();
  res.json({ hunt: h });
}));

router.delete("/:id", wrap(async (req, res) => {
  const r = await query("delete from hunts where id=$1 and user_id=$2 returning id", [req.params.id, req.user.id]);
  if (!r.length) throw new HttpError(404, "Pedido não encontrado.");
  res.status(204).end();
}));

// Radar de marcas
router.get("/radar", wrap(async (req, res) => {
  res.json({ brands: await query("select brand, max_price from radar_brands where user_id=$1 order by brand", [req.user.id]) });
}));

router.put("/radar", wrap(async (req, res) => {
  const list = Array.isArray(req.body.brands) ? req.body.brands.slice(0, 30) : [];
  await query("delete from radar_brands where user_id=$1", [req.user.id]);
  for (const b of list) {
    if (b && b.brand) await query("insert into radar_brands (user_id, brand, max_price) values ($1,$2,$3) on conflict do nothing",
      [req.user.id, String(b.brand).slice(0, 60), b.max_price || null]);
  }
  res.json({ brands: await query("select brand, max_price from radar_brands where user_id=$1 order by brand", [req.user.id]) });
}));

module.exports = router;
