const router = require("express").Router();
const { query, one } = require("./db");
const { wrap, need, HttpError, pick } = require("./http");
const { requireAuth } = require("./authlib");
const { aiEnabled } = require("./ai");
const { kickHunts } = require("./agents");

// Campos que o dono pode gravar num relógio (os market_* só o agente de preços grava)
const FIELDS = ["name", "brand", "model_ref", "movement", "shape", "case_material", "dial", "status", "wish_tier",
  "bought_on", "price_paid", "estimate", "notes", "image_url", "is_public", "sale_mode", "sale_price", "condition",
  "accepts_trade", "sort_order"];
const STATUS = ["collection", "on_the_way", "wish", "gone"];
// none = Inegociável, sale = À venda, offers = Recebendo propostas
const SALE = ["none", "sale", "offers"];
const SALE_NOTE = { none: "Marcado como inegociável", sale: "Colocado à venda", offers: "Recebendo propostas" };
const PRICE_CHECKS_PER_DAY = 10;
const PRICE_MAX_AGE_DAYS = 30;

function check(f) {
  if (f.status && !STATUS.includes(f.status)) throw new HttpError(400, "Status inválido.");
  if (f.sale_mode && !SALE.includes(f.sale_mode)) throw new HttpError(400, "Modo inválido. Use inegociável, à venda ou recebendo propostas.");
}

const addHistory = (watchId, note) => query(`insert into watch_history (watch_id, note) values ($1,$2)`, [watchId, note]);

// Pede o preço médio de mercado ao agente (se a IA estiver ligada e o preço não for recente)
async function requestPrice(w, { force = false } = {}) {
  if (!aiEnabled() || ["pending", "working"].includes(w.market_status)) return w;
  const fresh = w.market_checked_at && Date.now() - new Date(w.market_checked_at) < PRICE_MAX_AGE_DAYS * 86400000;
  if (fresh && !force) return w;
  const updated = await one(
    `update watches set market_status='pending', market_attempts=0, market_error=null where id=$1 returning *`, [w.id]);
  kickHunts();
  return updated;
}

const forSale = (w) => w.sale_mode !== "none" && ["collection", "on_the_way"].includes(w.status);

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
  let w = await one(`insert into watches (${cols}) values (${vals}) returning *`, [req.user.id, ...keys.map(k => f[k])]);
  await addHistory(w.id, w.status === "wish" ? "Entrou no Wish Time" : "Entrou na coleção");
  if (forSale(w)) { await addHistory(w.id, SALE_NOTE[w.sale_mode]); w = await requestPrice(w); }
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
  // Ao colocar à venda sem preço, já lança com o preço médio de mercado, se houver
  if (f.sale_mode === "sale" && old.sale_mode !== "sale" && f.sale_price === undefined && !old.sale_price && old.market_price) {
    f.sale_price = old.market_price;
  }
  const keys = Object.keys(f);
  if (!keys.length) return res.json({ watch: old });
  const set = keys.map((k, i) => `${k}=$${i + 3}`).join(", ");
  let w = await one(`update watches set ${set}, updated_at=now() where id=$1 and user_id=$2 returning *`,
    [old.id, req.user.id, ...keys.map(k => f[k])]);

  if (w.status === "gone" && old.status !== "gone" && old.sale_mode !== "none") {
    await addHistory(w.id, "Vendido / negociado");
    if (w.sale_mode !== "none") w = await one(`update watches set sale_mode='none' where id=$1 returning *`, [w.id]);
  } else {
    if (f.status && f.status !== old.status) await addHistory(w.id, `Status: ${old.status} → ${w.status}`);
    if (f.sale_mode && f.sale_mode !== old.sale_mode) await addHistory(w.id, SALE_NOTE[w.sale_mode]);
  }
  if (forSale(w) && !forSale(old)) w = await requestPrice(w);
  res.json({ watch: w });
}));

// Recalcular o preço médio de mercado (limite diário por pessoa, para controlar o custo)
router.post("/:id/price-check", wrap(async (req, res) => {
  const w = await one("select * from watches where id=$1 and user_id=$2", [req.params.id, req.user.id]);
  if (!w) throw new HttpError(404, "Relógio não encontrado.");
  if (!aiEnabled()) throw new HttpError(503, "O cálculo de preço médio ainda não está ligado.");
  const { n } = await one(
    `select count(*)::int n from agent_runs r join watches x on x.id::text = r.ref
      where r.agent='price' and x.user_id=$1 and r.started_at > now() - interval '24 hours'`, [req.user.id]);
  if (n >= PRICE_CHECKS_PER_DAY) throw new HttpError(429, `Limite de ${PRICE_CHECKS_PER_DAY} avaliações de preço por dia atingido.`);
  res.json({ watch: await requestPrice(w, { force: true }) });
}));

router.delete("/:id", wrap(async (req, res) => {
  const r = await query("delete from watches where id=$1 and user_id=$2 returning id", [req.params.id, req.user.id]);
  if (!r.length) throw new HttpError(404, "Relógio não encontrado.");
  res.status(204).end();
}));

module.exports = router;
