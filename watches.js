const router = require("express").Router();
const { query, one } = require("../db");
const { wrap, need, HttpError, pick } = require("../lib/http");
const { requireAuth } = require("../lib/auth");

// Campos que o dono pode gravar num relógio
const FIELDS = ["name", "brand", "model_ref", "movement", "shape", "case_material", "dial", "status", "wish_tier",
  "bought_on", "price_paid", "estimate", "notes", "image_url", "is_public", "sale_mode", "sale_price", "condition", "sort_order"];
const STATUS = ["collection", "on_the_way", "wish", "gone"];
const SALE = ["none", "sale", "trade", "sale_or_trade"];

function check(f) {
  if (f.status && !STATUS.includes(f.status)) throw new HttpError(400, "Status inválido.");
  if (f.sale_mode && !SALE.includes(f.sale_mode)) throw new HttpError(400, "Modo de venda inválido.");
}

router.use(requireAuth);

// Minha coleção (filtro opcional ?status=wish)
router.get("/", wrap(async (req, res) => {
  const params = [req.user.id];
  let sql = "select * from watches where user_id=$1";
  if (req.query.status) { params.push(req.query.status); sql += " and status=$2"; }
  res.json({ watches: await query(sql + " order by sort_order, created_at", params) });
}));

router.post("/", wrap(async (req, res) => {
  need(req.body, ["name"]);
  const f = pick(req.body, FIELDS); check(f);
  const keys = Object.keys(f);
  const cols = ["user_id", ...keys].join(", ");
  const vals = ["$1", ...keys.map((_, i) => `$${i + 2}`)].join(", ");
  const w = await one(`insert into watches (${cols}) values (${vals}) returning *`, [req.user.id, ...keys.map(k => f[k])]);
  await query(`insert into watch_history (watch_id, note) values ($1,$2)`,
    [w.id, w.status === "wish" ? "Entrou no Wish Time" : "Entrou na coleção"]);
  res.status(201).json({ watch: w });
}));

router.get("/:id", wrap(async (req, res) => {
  const w = await one("select * from watches where id=$1 and user_id=$2", [req.params.id, req.user.id]);
  if (!w) throw new HttpError(404, "Relógio não encontrado.");
  const history = await query("select * from watch_history where watch_id=$1 order by created_at", [w.id]);
  res.json({ watch: w, history });
}));

router.patch("/:id", wrap(async (req, res) => {
  const old = await one("select * from watches where id=$1 and user_id=$2", [req.params.id, req.user.id]);
  if (!old) throw new HttpError(404, "Relógio não encontrado.");
  const f = pick(req.body, FIELDS); check(f);
  const keys = Object.keys(f);
  if (!keys.length) return res.json({ watch: old });
  const set = keys.map((k, i) => `${k}=$${i + 3}`).join(", ");
  const w = await one(`update watches set ${set}, updated_at=now() where id=$1 and user_id=$2 returning *`,
    [old.id, req.user.id, ...keys.map(k => f[k])]);
  if (f.status && f.status !== old.status) {
    await query(`insert into watch_history (watch_id, note) values ($1,$2)`, [w.id, `Status: ${old.status} → ${w.status}`]);
  }
  res.json({ watch: w });
}));

router.delete("/:id", wrap(async (req, res) => {
  const r = await query("delete from watches where id=$1 and user_id=$2 returning id", [req.params.id, req.user.id]);
  if (!r.length) throw new HttpError(404, "Relógio não encontrado.");
  res.status(204).end();
}));

module.exports = router;
