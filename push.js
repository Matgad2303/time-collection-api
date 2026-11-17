// Avisos no celular (web push) — hoje usados para avisar que saiu a edição do NEWS FLEX.
// Liga com VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY (gerar com: npx web-push generate-vapid-keys).
// No iPhone o aviso só chega com o app instalado na tela de início (iOS 16.4 ou mais novo).
const router = require("express").Router();
const webpush = require("web-push");
const { query, one } = require("./db");
const { wrap, need, HttpError } = require("./http");
const { requireAuth } = require("./authlib");

const enabled = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
let configured = false;
function setup() {
  if (configured || !enabled()) return enabled();
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://time-collection-web-kn9s.onrender.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

// Chave pública que o app usa para se inscrever
router.get("/key", (_req, res) => res.json({ enabled: enabled(), key: process.env.VAPID_PUBLIC_KEY || null }));

// Este aparelho quer receber avisos
router.post("/subscribe", requireAuth, wrap(async (req, res) => {
  if (!enabled()) throw new HttpError(503, "Os avisos no celular ainda não estão ligados.");
  const s = req.body && req.body.subscription;
  need(s || {}, ["endpoint"]);
  if (!/^https:\/\//.test(s.endpoint) || !s.keys || !s.keys.p256dh || !s.keys.auth) throw new HttpError(400, "Inscrição inválida.");
  await query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     values ($1,$2,$3,$4,$5)
     on conflict (endpoint) do update set user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth, user_agent=excluded.user_agent`,
    [req.user.id, String(s.endpoint).slice(0, 1000), String(s.keys.p256dh).slice(0, 200), String(s.keys.auth).slice(0, 100),
      String(req.headers["user-agent"] || "").slice(0, 300)]);
  res.status(201).json({ ok: true });
}));

// Este aparelho não quer mais
router.post("/unsubscribe", requireAuth, wrap(async (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  if (endpoint) await query(`delete from push_subscriptions where endpoint=$1 and user_id=$2`, [endpoint, req.user.id]);
  res.json({ ok: true });
}));

// Quantos aparelhos meus recebem aviso (para o app mostrar "ligado")
router.get("/mine", requireAuth, wrap(async (req, res) => {
  const r = await one(`select count(*)::int n from push_subscriptions where user_id=$1`, [req.user.id]);
  res.json({ devices: r.n });
}));

// Aviso de teste só para os aparelhos da própria pessoa (botão "Testar aviso" no NEWS FLEX)
router.post("/test", requireAuth, require("./http").rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }), wrap(async (req, res) => {
  const r = await sendAll("news", { title: "NEWS FLEX", body: "Teste de aviso: é assim que a edição de segunda vai chegar.", url: "/#news", tag: "news-teste" }, req.user.id);
  res.json(r);
}));

// Envia para todos os inscritos num tópico. Endereços que o navegador já descartou (404/410) são apagados.
async function sendAll(topic, payload, userId = null) {
  if (!setup()) return { sent: 0, skipped: "sem chaves VAPID" };
  const subs = userId
    ? await query(`select id, endpoint, p256dh, auth from push_subscriptions where user_id=$1`, [userId])
    : await query(`select id, endpoint, p256dh, auth from push_subscriptions where $1 = any(topics)`, [topic]);
  let sent = 0, gone = 0, failed = 0;
  const body = JSON.stringify(payload);
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24, urgency: "normal" });
      sent++;
      await query(`update push_subscriptions set last_ok_at=now() where id=$1`, [s.id]);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { gone++; await query(`delete from push_subscriptions where id=$1`, [s.id]); }
      else { failed++; console.warn("[push] falhou", e.statusCode || "", String(e.message).slice(0, 120)); }
    }
  }
  return { sent, gone, failed };
}

module.exports = { router, sendAll, enabled };
