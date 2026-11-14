// Robôs do Time Collection (rodam dentro da API, sem serviço extra)
//   Caçador          atende os pedidos que a pessoa faz no ECONOMY Time (hunts/{pessoa}, status "pending"):
//                    procura anúncios reais e grava o resultado em hres/{pedido}
//   Deixar avisado   pedidos com status "watch": confere de 12 em 12 h e avisa UMA vez quando aparece
//                    promoção de verdade; depois encerra
//   NEWS FLEX        uma vez por semana (segunda), monta a edição em news
//
// Regra do produto: nenhum robô procura promoção por conta própria. Tudo parte de um pedido da pessoa.
// Os documentos seguem o mesmo formato do protótipo no Claude (ver docs/DADOS do pacote do projeto).
const { query, one } = require("./db");
const { research, aiEnabled } = require("./ai");

const log = (...a) => console.log("[agentes]", ...a);

// ---------- utilidades ----------

const httpUrl = (u) => (typeof u === "string" && /^https?:\/\/\S+$/i.test(u.trim()) ? u.trim() : null);
const int = (v) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const brl = (v) => `R$ ${Number(v).toLocaleString("pt-BR")}`;
const nowIso = () => new Date().toISOString();

// Data de hoje e da segunda-feira da semana, no fuso de São Paulo (AAAA-MM-DD)
function spDate(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p; // en-CA já sai como AAAA-MM-DD
}
function currentEdition(d = new Date()) {
  const t = new Date(spDate(d) + "T12:00:00Z");
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() - (day - 1));
  return t.toISOString().slice(0, 10);
}

async function recordRun(agent, ref, status, detail, usage = {}, startedAt) {
  await query(
    `insert into agent_runs (agent, ref, status, detail, input_tokens, output_tokens, searches, started_at, finished_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
    [agent, ref, status, detail ? String(detail).slice(0, 1000) : null,
      usage.input_tokens || 0, usage.output_tokens || 0, usage.searches || 0, startedAt || new Date()]);
}

const putDoc = (path, id, data) => query(
  `insert into docs (path, id, data) values ($1,$2,$3)
   on conflict (path, id) do update set data=excluded.data, updated_at=now()`, [path, id, data]);

// ---------- Caçador ----------

const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "store", "price", "was", "priceText", "cond", "ship", "link", "note"],
  properties: {
    title: { type: "string", description: "Título do anúncio" },
    store: { type: ["string", "null"], description: "Loja ou site (ex.: Mercado Livre, Amazon, loja oficial)" },
    price: { type: ["integer", "null"], description: "Preço em reais, inteiro" },
    was: { type: ["integer", "null"], description: "Preço antigo, se o anúncio mostrar desconto" },
    priceText: { type: ["string", "null"], description: "Preço como texto quando não for um valor único (ex.: '10x R$ 300')" },
    cond: { type: ["string", "null"], description: "novo, usado, seminovo..." },
    ship: { type: ["string", "null"], description: "Frete, se informado" },
    link: { type: "string", description: "Endereço https do anúncio, exatamente como encontrado" },
    note: { type: ["string", "null"], description: "Observação curta (ex.: 'sem caixa', 'loja oficial')" },
  },
};

const HUNT_TOOL = {
  name: "entregar_anuncios",
  description: "Entrega o resultado da busca. Chame uma única vez, no final.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["note", "items"],
    properties: {
      note: { type: "string", description: "Resumo de 1 a 2 frases em português para o colecionador" },
      items: { type: "array", description: "Até 8 anúncios reais, do melhor custo-benefício para o pior. Vazio se não achou nada confiável.", items: ITEM_SCHEMA },
    },
  },
};

const HUNT_SYSTEM = `Você é o Caçador do Time Collection, um app brasileiro para colecionadores de relógios.
A pessoa pesquisou um relógio e quer saber onde comprar agora, com link direto.

Regras:
- Procure anúncios REAIS à venda agora no Brasil (Mercado Livre, Amazon, lojas oficiais e revendedores, Chrono24 com preço em reais ou envio ao Brasil, Enjoei, OLX).
- Abra os candidatos e confirme produto, disponibilidade e preço. Nunca invente anúncio, preço ou link.
- Respeite o orçamento e a condição pedidos (novo/usado) quando informados.
- Descarte réplicas e anúncios suspeitos (preço muito abaixo do mercado); se mostrar algo duvidoso, avise na observação.
- Preços em reais, inteiros.
- O Time Collection não vende nada: só mostra onde comprar, com o link da loja.
- Termine sempre chamando a ferramenta entregar_anuncios, mesmo sem resultado (lista vazia e uma nota explicando).`;

const PROMO_TOOL = {
  name: "entregar_promocao",
  description: "Entrega o resultado da conferência de promoção. Chame uma única vez, no final.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["found", "note", "items"],
    properties: {
      found: { type: "boolean", description: "true só se encontrou PROMOÇÃO DE VERDADE, confirmada abrindo a página" },
      note: { type: "string", description: "Uma frase: qual a promoção, ou por que não há nenhuma agora" },
      items: { type: "array", items: ITEM_SCHEMA },
    },
  },
};

const PROMO_SYSTEM = `Você é o robô de avisos do Time Collection. A pessoa apertou "Deixar avisado" para um relógio.

Regras:
- Poucas buscas rápidas, só desse relógio (promoção, oferta, cupom, Promobit, Pelando, loja oficial, Mercado Livre, Amazon).
- Só conta PROMOÇÃO DE VERDADE: desconto real, cupom, oferta relâmpago ou menor preço visto, dentro do orçamento, em loja confiável, confirmada abrindo a página.
- Descarte réplica e vendedor sem reputação. Nunca invente.
- Se não achar, found = false e items vazio.
- Termine sempre chamando a ferramenta entregar_promocao.`;

const cleanItems = (items, max) => (Array.isArray(items) ? items : [])
  .map((i) => ({
    title: text(i.title, 200), store: text(i.store, 80), price: int(i.price), was: int(i.was), priceText: text(i.priceText, 80),
    cond: text(i.cond, 40), ship: text(i.ship, 80), link: httpUrl(i.link), note: text(i.note, 200),
  }))
  .filter((i) => i.title && i.link)
  .slice(0, max);

const reqLine = (r) => `Relógio: "${r.q}". Orçamento: ${r.budget ? `até ${brl(r.budget)}` : "não informado"}. Condição: ${r.cond || "tanto faz"}.`;

// Troca o status de um pedido dentro do documento hunts/{uid}, relendo o documento na hora
async function updateReq(uid, reqId, patch) {
  const d = await one(`select data from docs where path='hunts' and id=$1`, [uid]);
  if (!d) return;
  const data = d.data;
  data.reqs = (data.reqs || []).map((r) => (r.id === reqId ? { ...r, ...patch } : r));
  data.upd = nowIso();
  await query(`update docs set data=$2, updated_at=now() where path='hunts' and id=$1`, [uid, data]);
}

async function runHuntReq(uid, r) {
  const startedAt = new Date();
  await updateReq(uid, r.id, { status: "working" });
  try {
    const { data, usage } = await research({
      system: HUNT_SYSTEM, prompt: reqLine(r), tool: HUNT_TOOL,
      fake: () => ({ note: `Opções de exemplo para "${r.q}" (modo de teste).`, items: [
        { title: `${r.q} (exemplo)`, store: "Loja exemplo", price: r.budget ? Math.round(r.budget * 0.9) : 2500, was: null, priceText: null, cond: "novo", ship: "Frete grátis", link: "https://example.com/anuncio-1", note: "Dado de teste" },
      ] }),
    });
    const items = cleanItems(data.items, 8);
    await putDoc("hres", r.id, { uid, q: r.q, at: nowIso(), items, note: text(data.note, 400) || "" });
    await updateReq(uid, r.id, { status: "done" });
    await recordRun("hunt", r.id, "ok", `${items.length} anúncio(s)`, usage, startedAt);
    log(`caçador: "${r.q}" com ${items.length} anúncio(s)`);
  } catch (e) {
    const tries = (r.tries || 0) + 1;
    await updateReq(uid, r.id, { status: tries >= 3 ? "done" : "pending", tries });
    if (tries >= 3) await putDoc("hres", r.id, { uid, q: r.q, at: nowIso(), items: [], note: "Não consegui buscar agora. Tente de novo mais tarde." });
    await recordRun("hunt", r.id, "error", e.message, {}, startedAt);
    console.error("[agentes] caçador falhou", r.id, e.message);
  }
}

async function runWatchReq(uid, r) {
  const startedAt = new Date();
  await updateReq(uid, r.id, { checked: nowIso() });
  try {
    const { data, usage } = await research({
      system: PROMO_SYSTEM, prompt: reqLine(r), tool: PROMO_TOOL, maxSearches: 4, maxFetches: 3,
      fake: () => ({ found: false, note: "Sem promoção por enquanto (modo de teste).", items: [] }),
    });
    const items = cleanItems(data.items, 4);
    if (data.found && items.length) {
      await putDoc("hres", r.id, { uid, q: r.q, at: nowIso(), items, note: text(data.note, 400) || "Promoção encontrada", promo: true });
      await updateReq(uid, r.id, { status: "done", watch: false, promoAt: nowIso() });
      await recordRun("watch", r.id, "ok", "promoção encontrada", usage, startedAt);
      log(`aviso: promoção encontrada para "${r.q}"`);
    } else {
      await recordRun("watch", r.id, "ok", "sem promoção por enquanto", usage, startedAt);
    }
  } catch (e) {
    await recordRun("watch", r.id, "error", e.message, {}, startedAt);
    console.error("[agentes] aviso falhou", r.id, e.message);
  }
}

// Atende os pedidos: primeiro os novos (até 5), depois os "Deixar avisado" vencidos (até 5)
async function processHunts({ watches = true } = {}) {
  const docs = await query(`select id, data from docs where path='hunts'`);
  const pending = [], due = [];
  const cutoff = Date.now() - 12 * 3600 * 1000;
  const stuck = Date.now() - 20 * 60 * 1000;
  for (const d of docs) {
    for (const r of d.data.reqs || []) {
      const working = r.status === "working" && new Date(d.data.upd || 0).getTime() < stuck;
      if (r.status === "pending" || working) pending.push([d.id, r]);
      else if (r.status === "watch" && (!r.checked || new Date(r.checked).getTime() < cutoff)) due.push([d.id, r]);
    }
  }
  pending.sort((a, b) => String(a[1].at).localeCompare(String(b[1].at)));
  for (const [uid, r] of pending.slice(0, 5)) await runHuntReq(uid, r);
  if (watches) for (const [uid, r] of due.slice(0, 5)) await runWatchReq(uid, r);
  return { hunts: Math.min(pending.length, 5), watches: watches ? Math.min(due.length, 5) : 0 };
}

// ---------- NEWS FLEX ----------

const NEWS_ITEM = {
  type: "object",
  additionalProperties: false,
  required: ["cat", "brands", "title", "dek", "body", "facts", "source", "url", "date", "lead"],
  properties: {
    cat: { type: "string", enum: ["lancamento", "limitada", "leilao", "mercado", "industria"] },
    brands: { type: "array", items: { type: "string" }, description: "Marcas citadas" },
    title: { type: "string", description: "Título em português" },
    dek: { type: "string", description: "Linha fina: 1 frase que complementa o título" },
    body: { type: "string", description: "2 parágrafos curtos em português, com suas próprias palavras, separados por \\n" },
    facts: { type: "array", items: { type: "string" }, description: "Até 5 fatos curtos (referência, tamanho, movimento, preço, tiragem)" },
    source: { type: "string", description: "Veículo de origem (ex.: Hodinkee, Monochrome, Fratello)" },
    url: { type: "string", description: "Endereço https da matéria original" },
    date: { type: "string", description: "Data da notícia AAAA-MM-DD" },
    lead: { type: "boolean", description: "true só na notícia principal da semana" },
  },
};
const NEWS_TOOL = {
  name: "entregar_edicao",
  description: "Entrega a edição semanal do NEWS FLEX. Chame uma única vez, no final.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "items"],
    properties: {
      summary: { type: "string", description: "A semana em 30 segundos: 2 a 3 frases que resumem a edição" },
      items: { type: "array", description: "De 8 a 12 notícias, a principal primeiro", items: NEWS_ITEM },
    },
  },
};
const NEWS_SYSTEM = `Você é o editor do NEWS FLEX, o jornal semanal de relojoaria do app Time Collection (Brasil).
Pesquise notícias de relógios dos últimos 7 a 10 dias em fontes especializadas (Hodinkee, Monochrome, Fratello, WatchTime, Time+Tide, aBlogtoWatch, Revolution etc.): lançamentos, edições limitadas, leilões, mercado e indústria.
Dê prioridade às marcas que os colecionadores do app mais têm: Tissot, Omega, Seiko, Citizen, Orient, Swatch/MoonSwatch, Tudor, Mido, Bulova, Casio, Cuervo y Sobrinos, Carl F. Bucherer, Victorinox, Apple, F.P. Journe e D1 Milano, sem deixar de fora o que for grande na semana.

Regras:
- Só notícias reais, com link da matéria original que você encontrou. Nunca invente.
- Escreva em português do Brasil com suas próprias palavras. Não copie trechos.
- Exatamente uma notícia principal (lead).
- Termine chamando a ferramenta entregar_edicao.`;

async function runNews({ force = false } = {}) {
  const edition = currentEdition();
  if (!force && (await one(`select 1 from docs where path='news' and id=$1`, ["edition-" + edition]))) return { edition, skipped: true };
  const startedAt = new Date();
  try {
    const { data, usage } = await research({
      system: NEWS_SYSTEM, tool: NEWS_TOOL, maxSearches: 12, maxFetches: 8,
      prompt: `Monte a edição de ${edition} do NEWS FLEX. Hoje é ${spDate()}.`,
      fake: () => ({ summary: "Edição de teste do NEWS FLEX.", items: [
        { cat: "lancamento", brands: ["Seiko"], title: "Notícia de teste", dek: "Linha fina de teste.", body: "Texto de teste.\nSegundo parágrafo.", facts: ["Teste"], source: "Teste", url: `https://example.com/${edition}`, date: spDate(), lead: true },
      ] }),
    });
    let leadSeen = false;
    const items = (Array.isArray(data.items) ? data.items : []).filter((n) => text(n.title, 200) && httpUrl(n.url)).slice(0, 12);
    const prev = await query(`select data->>'edition' e from docs where path='news' and id like 'edition-%' order by id`);
    const number = prev.filter((p) => p.e !== edition).length + 1;
    let ord = 0;
    for (const n of items) {
      ord++;
      const lead = Boolean(n.lead) && !leadSeen; leadSeen ||= lead;
      await putDoc("news", `n-${edition}-${String(ord).padStart(2, "0")}`, {
        edition, ord, lead, cat: n.cat, brands: (n.brands || []).slice(0, 6), title: text(n.title, 200), dek: text(n.dek, 400) || "",
        body: text(n.body, 3000) || "", facts: (n.facts || []).slice(0, 5).map((f) => String(f).slice(0, 80)),
        source: text(n.source, 80) || "", url: httpUrl(n.url), date: /^\d{4}-\d{2}-\d{2}$/.test(n.date) ? n.date : edition,
      });
    }
    await putDoc("news", "edition-" + edition, { type: "edition", edition, number, summary: text(data.summary, 800) || "" });
    // Mantém só as 8 edições mais recentes
    const eds = await query(`select data->>'edition' e from docs where path='news' and id like 'edition-%' order by id desc offset 8`);
    for (const e of eds) await query(`delete from docs where path='news' and data->>'edition' = $1`, [e.e]);
    await recordRun("news", edition, "ok", `${items.length} notícia(s)`, usage, startedAt);
    log(`news: edição ${edition} com ${items.length} notícia(s)`);
    return { edition, count: items.length };
  } catch (e) {
    await recordRun("news", edition, "error", e.message, {}, startedAt);
    console.error("[agentes] news falhou", e.message);
    return { edition, error: e.message };
  }
}

// ---------- Agendador ----------

let busy = false, again = false;
async function tick({ weekly = false } = {}) {
  if (busy) { again = true; return; }
  busy = true;
  try {
    do {
      again = false;
      if (weekly) { weekly = false; await runNews(); }
      await processHunts();
    } while (again);
  } catch (e) {
    console.error("[agentes] erro no ciclo", e.message);
  } finally { busy = false; }
}

const enabled = () => aiEnabled() && process.env.AGENTS_DISABLED !== "true";

// Pedidos: na hora e a cada 2 min; NEWS FLEX conferido na partida e a cada 6 h
function startAgents() {
  if (!enabled()) { log("desligados (configure ANTHROPIC_API_KEY para ligar)"); return; }
  log("ligados");
  setTimeout(() => tick({ weekly: true }), 10_000).unref();
  setInterval(() => tick(), 2 * 60 * 1000).unref();
  setInterval(() => tick({ weekly: true }), 6 * 60 * 60 * 1000).unref();
}

const kickHunts = () => { if (enabled()) setImmediate(() => tick()); };

module.exports = { startAgents, kickHunts, processHunts, runNews, currentEdition, HUNT_SYSTEM, HUNT_TOOL };
