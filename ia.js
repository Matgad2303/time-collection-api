// IA dentro do app: o front manda o pedido (texto + fotos opcionais) e recebe o JSON pronto.
// Usada no cadastro por foto, Ateliê, diagnóstico, plano de manutenção, What If Flexx,
// "No pulso hoje" (combinar com a roupa), faixa de preço e How to do.
const router = require("express").Router();
const { one, query } = require("./db");
const { wrap, need, HttpError } = require("./http");
const { requireAuth } = require("./authlib");
const { askJson, aiEnabled } = require("./ai");

const PER_DAY = Number(process.env.AI_PER_DAY || 40);

router.use(requireAuth);

// O app pergunta se a IA está ligada e se aceita fotos
router.get("/limits", (_req, res) => res.json({ enabled: aiEnabled(), images: true, perDay: PER_DAY }));

router.post("/json", wrap(async (req, res) => {
  if (!aiEnabled()) throw new HttpError(503, "A IA do app ainda não está ligada.");
  need(req.body, ["prompt"]);
  const { n } = await one(
    `select count(*)::int n from agent_runs where agent='app' and ref=$1 and started_at > now() - interval '24 hours'`, [req.user.id]);
  if (n >= PER_DAY) throw new HttpError(429, `Você usou a IA ${PER_DAY} vezes hoje. Ela volta amanhã.`);

  // Fotos chegam como "data:image/jpeg;base64,..."
  const images = (Array.isArray(req.body.images) ? req.body.images : []).slice(0, 8).map((s) => {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(s));
    if (!m) throw new HttpError(400, "Foto em formato não suportado.");
    return { media_type: m[1], data: m[2] };
  });
  const tier = ["quick", "default", "complex"].includes(req.body.tier) ? req.body.tier : "default";
  const startedAt = new Date();
  try {
    const { data, usage } = await askJson({ prompt: String(req.body.prompt).slice(0, 60000), images, tier });
    await query(`insert into agent_runs (agent, ref, status, detail, input_tokens, output_tokens, started_at, finished_at)
                 values ('app',$1,'ok',$2,$3,$4,$5,now())`, [req.user.id, tier, usage.input_tokens, usage.output_tokens, startedAt]);
    res.json({ data });
  } catch (e) {
    if (e.status && e.status < 500 && e instanceof HttpError) throw e;
    await query(`insert into agent_runs (agent, ref, status, detail, started_at, finished_at) values ('app',$1,'error',$2,$3,now())`,
      [req.user.id, String(e.message).slice(0, 500), startedAt]);
    console.error("[ia] falhou", e.message);
    throw new HttpError(502, "A IA não respondeu agora. Tente de novo em instantes.");
  }
}));

module.exports = router;
