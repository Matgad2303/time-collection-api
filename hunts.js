// ECONOMY Time: pedidos de busca ("caçador sob pedido") e radar de marcas
const router = require("express").Router();
const { query, one } = require("./db");
const { wrap, need, HttpError } = require("./http");
const { requireAuth } = require("./authlib");

router.use(requireAuth);

// Meus pedidos com resultados
router.get("/", wrap(async (req, res) => {
  const hunts = await query("select * from hunts where user_id=$1 order by created_at desc limit 50", [req.user.id]);
  const ids = hunts.map(h => h.id);
  const items = ids.length ? await query("select * from hunt_results where hunt_id = any($1) order by price nulls last", [ids]) : [];
  res.json({ hunts: hunts.map(h => ({ ...h, items: items.filter(i => i.hunt_id === h.id) })) });
}));

// Novo pedido (status pending; um processo externo preenche os resultados)
router.post("/", wrap(async (req, res) => {
  need(req.body, ["query"]);
  const cond = ["novo", "usado", "tanto faz"].includes(req.body.condition) ? req.body.condition : "tanto faz";
  const h = await one(`insert into hunts (user_id, query, budget, condition) values ($1,$2,$3,$4) returning *`,
    [req.user.id, String(req.body.query).slice(0, 120), req.body.budget || null, cond]);
  res.status(201).json({ hunt: h });
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
