// Trades & Deals: os meus relógios (inegociável, à venda, recebendo propostas), indicações para mim,
// vitrine de todos os colecionadores e promoções de lojas compartilhadas
const router = require("express").Router();
const { query, one } = require("./db");
const { wrap, need, HttpError } = require("./http");
const { requireAuth, optionalAuth } = require("./authlib");

const LISTING_COLS = `w.id, w.name, w.brand, w.model_ref, w.movement, w.image_url, w.sale_mode, w.sale_price, w.condition,
  w.accepts_trade, w.market_price, w.market_confidence, w.updated_at,
  u.id as owner_id, u.handle, u.name as owner_name, u.city, u.whatsapp`;
const LISTED = "w.sale_mode <> 'none' and w.status in ('collection','on_the_way') and u.is_public";

// O WhatsApp só aparece para quem está logado
const hideContact = (rows, req) => (req.user ? rows : rows.map((r) => ({ ...r, whatsapp: null })));

// Vitrine de todos: relógios à venda ou recebendo propostas
router.get("/listings", optionalAuth, wrap(async (req, res) => {
  const params = [];
  let where = LISTED;
  if (req.query.brand) {
    // Busca por parte da marca ou do nome (ex.: "seiko 5" acha "Seiko 5 Sports SRPD")
    params.push("%" + String(req.query.brand).trim().replace(/[%_\\]/g, "") + "%");
    where += ` and (w.brand ilike $${params.length} or w.name ilike $${params.length})`;
  }
  if (req.query.max) { params.push(Number(req.query.max)); where += ` and coalesce(w.sale_price, w.market_price) <= $${params.length}`; }
  if (["sale", "offers"].includes(req.query.mode)) { params.push(req.query.mode); where += ` and w.sale_mode = $${params.length}`; }
  if (req.query.trade === "1") where += " and w.accepts_trade";
  const rows = await query(
    `select ${LISTING_COLS} from watches w join users u on u.id=w.user_id
      where ${where} order by w.updated_at desc limit 200`, params);
  res.json({ listings: hideContact(rows, req) });
}));

// Meus relógios no Trades & Deals: tudo que está comigo ou a caminho, com status e preço médio
router.get("/mine", requireAuth, wrap(async (req, res) => {
  const watches = await query(
    `select id, name, brand, model_ref, image_url, status, sale_mode, sale_price, condition, accepts_trade, is_public,
            estimate, price_paid, market_status, market_price, market_min, market_max, market_confidence, market_note,
            market_sources, market_checked_at
       from watches where user_id=$1 and status in ('collection','on_the_way')
      order by (sale_mode <> 'none') desc, sort_order, created_at`, [req.user.id]);
  const me = await one("select is_public from users where id=$1", [req.user.id]);
  res.json({ watches, profile_public: me?.is_public ?? true });
}));

// Indicações para mim: relógios de outros colecionadores que combinam com meu Wish Time, meu radar,
// as marcas que coleciono e a minha cidade
router.get("/for-you", requireAuth, wrap(async (req, res) => {
  const me = await one("select city from users where id=$1", [req.user.id]);
  const mine = await query("select name, brand, status from watches where user_id=$1", [req.user.id]);
  const radar = await query("select brand, max_price from radar_brands where user_id=$1", [req.user.id]);
  const low = (s) => String(s || "").trim().toLowerCase();
  const wishNames = mine.filter((w) => w.status === "wish").map((w) => low(w.name)).filter((n) => n.length >= 4);
  const wishBrands = new Set(mine.filter((w) => w.status === "wish").map((w) => low(w.brand)).filter(Boolean));
  const ownBrands = new Set(mine.filter((w) => w.status === "collection").map((w) => low(w.brand)).filter(Boolean));
  const radarBy = new Map(radar.map((r) => [low(r.brand), r.max_price]));

  const rows = await query(
    `select ${LISTING_COLS} from watches w join users u on u.id=w.user_id
      where ${LISTED} and w.user_id <> $1 order by w.updated_at desc limit 400`, [req.user.id]);

  const scored = rows.map((l) => {
    const brand = low(l.brand);
    const name = low(l.name);
    const price = l.sale_price || l.market_price;
    const reasons = [];
    let score = 0;
    if (wishNames.some((n) => name.includes(n) || n.includes(name))) { score += 100; reasons.push("Está no seu Wish Time"); }
    else if (brand && wishBrands.has(brand)) { score += 50; reasons.push(`Marca do seu Wish Time: ${l.brand}`); }
    if (brand && radarBy.has(brand)) {
      const max = radarBy.get(brand);
      if (!max || !price || price <= max) { score += 40; reasons.push(max ? `No seu radar, dentro do seu preço` : `Marca do seu radar`); }
      else { score += 10; }
    }
    if (brand && ownBrands.has(brand)) { score += 15; if (!reasons.length) reasons.push(`Você coleciona ${l.brand}`); }
    if (me?.city && low(l.city) === low(me.city)) { score += 10; reasons.push(`Perto de você: ${l.city}`); }
    return { ...l, score, reason: reasons[0] || "Novidade em Trades & Deals" };
  });
  const matched = scored.filter((l) => l.score > 0).sort((a, b) => b.score - a.score);
  // Poucas combinações: completa com novidades, para a aba nunca ficar vazia
  const extra = matched.length < 6 ? scored.filter((l) => l.score === 0).slice(0, 12 - matched.length) : [];
  res.json({
    listings: [...matched.slice(0, 60), ...extra],
    has_signals: Boolean(wishNames.length || wishBrands.size || radarBy.size || ownBrands.size),
  });
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
  if (!/^https:\/\/\S+$/.test(String(req.body.link))) throw new HttpError(400, "O link precisa começar com https://");
  const p = await one(
    `insert into promos (user_id, title, store, price, link, valid_until) values ($1,$2,$3,$4,$5,$6) returning *`,
    [req.user.id, String(req.body.title).slice(0, 160), req.body.store || null, req.body.price || null, req.body.link, req.body.valid_until || null]);
  res.status(201).json({ promo: p });
}));

router.delete("/promos/:id", requireAuth, wrap(async (req, res) => {
  const r = await query("delete from promos where id=$1 and user_id=$2 returning id", [req.params.id, req.user.id]);
  if (!r.length) throw new HttpError(404, "Promoção não encontrada.");
  res.status(204).end();
}));

module.exports = router;
