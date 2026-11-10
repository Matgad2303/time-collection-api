// Trades & Deals: anúncios de venda/troca vindos da coleção + promoções publicadas pelos usuários
const router = require("express").Router();
const { query, one } = require("./db");
const { wrap, need, HttpError } = require("./http");
const { requireAuth } = require("./authlib");

// Vitrine pública de relógios à venda ou troca
router.get("/listings", wrap(async (req, res) => {
  const params = [];
  let where = "w.sale_mode <> 'none' and u.is_public";
  if (req.query.brand) { params.push(req.query.brand); where += ` and lower(w.brand)=lower($${params.length})`; }
  if (req.query.max) { params.push(Number(req.query.max)); where += ` and w.sale_price <= $${params.length}`; }
  const rows = await query(
    `select w.id, w.name, w.brand, w.movement, w.image_url, w.sale_mode, w.sale_price, w.condition,
            u.handle, u.name as owner_name, u.city, u.whatsapp
       from watches w join users u on u.id=w.user_id
      where ${where} order by w.updated_at desc limit 200`, params);
  res.json({ listings: rows });
}));

// Promoções (links de lojas) compartilhadas pela comunidade
router.get("/promos", wrap(async (_req, res) => {
  const rows = await query(
    `select p.*, u.handle from promos p join users u on u.id=p.user_id
      where p.valid_until is null or p.valid_until >= current_date order by p.created_at desc limit 300`);
  res.json({ promos: rows });
}));

router.post("/promos", requireAuth, wrap(async (req, res) => {
  need(req.body, ["title", "link"]);
  if (!/^https:\/\//.test(req.body.link)) throw new HttpError(400, "O link precisa começar com https://");
  const p = await one(
    `insert into promos (user_id, title, store, price, link, valid_until) values ($1,$2,$3,$4,$5,$6) returning *`,
    [req.user.id, req.body.title, req.body.store || null, req.body.price || null, req.body.link, req.body.valid_until || null]);
  res.status(201).json({ promo: p });
}));

router.delete("/promos/:id", requireAuth, wrap(async (req, res) => {
  const r = await query("delete from promos where id=$1 and user_id=$2 returning id", [req.params.id, req.user.id]);
  if (!r.length) throw new HttpError(404, "Promoção não encontrada.");
  res.status(204).end();
}));

module.exports = router;
