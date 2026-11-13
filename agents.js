// Agentes de IA do Time Collection
//   Caçador sob pedido  procura anúncios reais para cada pedido em hunts e grava em hunt_results
//   Radar de marcas     uma vez por semana, cria um pedido do caçador com as marcas do radar de cada pessoa
//   NEWS FLEX           uma vez por semana, monta a edição de notícias em news
//   Preço médio         calcula o preço médio de mercado de um relógio (Trades & Deals)
// Rodam dentro da própria API (startAgents), sem serviço extra. Também podem ser chamados pelo
// painel de administração ou pelo terminal (npm run agente:cacador / agente:news / agente:precos).
const { pool, query, one } = require("./db");
const { research, aiEnabled } = require("./ai");

const MAX_ATTEMPTS = 3;
const log = (...a) => console.log("[agentes]", ...a);

// ---------- utilidades ----------

const httpUrl = (u) => (typeof u === "string" && /^https?:\/\/\S+$/i.test(u.trim()) ? u.trim() : null);
const int = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.round(Number(v)) : null);
const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const isoDate = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const brl = (v) => `R$ ${Number(v).toLocaleString("pt-BR")}`;

// Semana ISO no fuso de São Paulo, ex.: 2026-W46
function currentEdition(date = new Date()) {
  const sp = new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const d = new Date(Date.UTC(sp.getFullYear(), sp.getMonth(), sp.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function recordRun(agent, ref, status, detail, usage = {}, startedAt) {
  await query(
    `insert into agent_runs (agent, ref, status, detail, input_tokens, output_tokens, searches, started_at, finished_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
    [agent, ref, status, detail ? String(detail).slice(0, 1000) : null,
      usage.input_tokens || 0, usage.output_tokens || 0, usage.searches || 0, startedAt || new Date()]);
}

// ---------- Caçador sob pedido (e Radar) ----------

const HUNT_TOOL = {
  name: "entregar_anuncios",
  description: "Entrega o resultado da busca: um resumo curto e a lista de anúncios encontrados. Chame uma única vez, no final.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "items"],
    properties: {
      summary: { type: "string", description: "Resumo de 1 a 3 frases em português para o colecionador." },
      items: {
        type: "array",
        description: "Até 8 anúncios reais encontrados, do melhor para o pior custo-benefício. Lista vazia se não achou nada confiável.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "store", "price", "was_price", "price_text", "condition", "shipping", "link", "note"],
          properties: {
            title: { type: "string", description: "Título do anúncio" },
            store: { type: ["string", "null"], description: "Loja ou site (ex.: Mercado Livre, OLX, loja oficial)" },
            price: { type: ["integer", "null"], description: "Preço em reais, número inteiro, sem centavos" },
            was_price: { type: ["integer", "null"], description: "Preço antigo, se o anúncio mostrar desconto" },
            price_text: { type: ["string", "null"], description: "Preço como texto quando não for um valor único (ex.: 'sob consulta', '10x R$ 300')" },
            condition: { type: ["string", "null"], description: "novo, usado, seminovo..." },
            shipping: { type: ["string", "null"], description: "Frete, se informado" },
            link: { type: "string", description: "Endereço https do anúncio, exatamente como encontrado na pesquisa" },
            note: { type: ["string", "null"], description: "Observação curta (ex.: 'sem caixa', 'vendedor bem avaliado')" },
          },
        },
      },
    },
  },
};

const HUNT_SYSTEM = `Você é o Caçador do Time Collection, um app brasileiro para colecionadores de relógios.
Sua tarefa é encontrar anúncios REAIS e atuais de relógios à venda no Brasil, usando a pesquisa na web.

Regras:
- Use só anúncios que você encontrou de fato na pesquisa. Nunca invente anúncio, preço ou link.
- Priorize lojas e marketplaces brasileiros (Mercado Livre, OLX, Enjoei, lojas oficiais e revendedores autorizados, Chrono24 com envio ao Brasil, grupos e fóruns de relógios com anúncios públicos).
- Preços em reais, números inteiros. Se o preço estiver em outra moeda, indique em price_text e deixe price nulo.
- Respeite o orçamento e o estado pedidos (novo/usado) quando informados; se não houver nada dentro do orçamento, diga isso no resumo e mostre as opções mais próximas.
- Desconfie de preços muito abaixo do mercado (possível réplica ou golpe) e avise na observação.
- Escreva em português do Brasil, de forma direta.
- Termine sempre chamando a ferramenta entregar_anuncios, mesmo que não tenha encontrado nada (lista vazia e um resumo explicando).`;

function huntPrompt(h, radar) {
  if (h.source === "radar") {
    const brands = radar.map((b) => (b.max_price ? `${b.brand} (até ${brl(b.max_price)})` : b.brand)).join("; ");
    return `Radar semanal de marcas. O colecionador acompanha: ${brands}.
Procure as melhores oportunidades desta semana (promoções, quedas de preço, anúncios usados em bom estado) para essas marcas, dentro dos preços máximos indicados.
Traga no máximo 2 anúncios por marca e até 8 no total.`;
  }
  return `Pedido do colecionador: "${h.query}".
Orçamento: ${h.budget ? `até ${brl(h.budget)}` : "não informado"}.
Estado: ${h.condition || "tanto faz"}.
Encontre os melhores anúncios disponíveis agora.`;
}

function fakeHunt(h) {
  return () => ({
    summary: `Encontrei 2 opções de exemplo para "${h.query}" (modo de teste, dados fictícios).`,
    items: [
      { title: `${h.query} - exemplo usado`, store: "Mercado Livre", price: h.budget ? Math.round(h.budget * 0.9) : 2500,
        was_price: null, price_text: null, condition: "usado", shipping: "Frete grátis", link: "https://example.com/anuncio-1", note: "Dado de teste" },
      { title: `${h.query} - exemplo novo`, store: "Loja exemplo", price: h.budget ? Math.round(h.budget * 1.1) : 3200,
        was_price: h.budget ? Math.round(h.budget * 1.3) : 3800, price_text: null, condition: "novo", shipping: null, link: "https://example.com/anuncio-2", note: null },
    ],
  });
}

// Processa um pedido: marca como "working", pesquisa, grava os anúncios
async function runHunt(huntId) {
  const h = await one(
    `update hunts set status='working', started_at=now(), attempts=attempts+1, error=null
      where id=$1 and status='pending' returning *`, [huntId]);
  if (!h) return null; // já está sendo processado por outro ciclo, ou não existe
  const startedAt = new Date();
  try {
    const radar = h.source === "radar"
      ? await query("select brand, max_price from radar_brands where user_id=$1 order by brand", [h.user_id]) : [];
    const { data, usage } = await research({
      system: HUNT_SYSTEM, prompt: huntPrompt(h, radar), tool: HUNT_TOOL, fake: fakeHunt(h),
    });
    const items = (Array.isArray(data.items) ? data.items : [])
      .map((i) => ({ ...i, link: httpUrl(i.link), title: text(i.title, 200) }))
      .filter((i) => i.link && i.title)
      .slice(0, 8);

    const db = await pool.connect();
    try {
      await db.query("begin");
      await db.query("delete from hunt_results where hunt_id=$1", [h.id]);
      for (const i of items) {
        await db.query(
          `insert into hunt_results (hunt_id, title, store, price, was_price, price_text, condition, shipping, link, note)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [h.id, i.title, text(i.store, 80), int(i.price), int(i.was_price), text(i.price_text, 80),
            text(i.condition, 40), text(i.shipping, 80), i.link, text(i.note, 200)]);
      }
      await db.query(`update hunts set status='done', summary=$2, done_at=now() where id=$1`,
        [h.id, text(data.summary, 600) || (items.length ? null : "Não encontrei anúncios confiáveis desta vez.")]);
      await db.query("commit");
    } catch (e) { await db.query("rollback"); throw e; } finally { db.release(); }

    await recordRun("hunt", h.id, "ok", `${items.length} anúncio(s)`, usage, startedAt);
    log(`caçador: pedido ${h.id} pronto com ${items.length} anúncio(s)`);
    return items.length;
  } catch (e) {
    const giveUp = h.attempts >= MAX_ATTEMPTS;
    await query(`update hunts set status=$2, error=$3 where id=$1`,
      [h.id, giveUp ? "failed" : "pending", String(e.message).slice(0, 500)]);
    await recordRun("hunt", h.id, "error", e.message, {}, startedAt);
    console.error("[agentes] caçador falhou", h.id, e.message);
    return null;
  }
}

// Processa os pedidos pendentes, um de cada vez (e destrava os que ficaram presos)
async function processPendingHunts(limit = 5) {
  await query(`update hunts set status='pending' where status='working' and started_at < now() - interval '20 minutes'`);
  const pending = await query(`select id from hunts where status='pending' order by created_at limit $1`, [limit]);
  for (const p of pending) await runHunt(p.id);
  return pending.length;
}

// Radar: um pedido por semana para quem tem marcas no radar
async function scheduleRadarHunts() {
  const users = await query(
    `select distinct r.user_id from radar_brands r
      where not exists (select 1 from hunts h where h.user_id=r.user_id and h.source='radar'
                          and h.created_at > now() - interval '7 days')`);
  for (const u of users) {
    const brands = await query("select brand from radar_brands where user_id=$1 order by brand", [u.user_id]);
    await query(`insert into hunts (user_id, query, source) values ($1,$2,'radar')`,
      [u.user_id, `Radar da semana: ${brands.map((b) => b.brand).join(", ")}`.slice(0, 120)]);
  }
  if (users.length) log(`radar: ${users.length} pedido(s) criado(s)`);
  return users.length;
}

// ---------- NEWS FLEX ----------

const NEWS_TOOL = {
  name: "entregar_edicao",
  description: "Entrega a edição semanal do NEWS FLEX. Chame uma única vez, no final.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        description: "De 5 a 10 notícias, a principal primeiro.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "summary", "source", "link", "image_url", "published_on", "is_lead"],
          properties: {
            title: { type: "string", description: "Título em português" },
            summary: { type: "string", description: "Resumo de 2 a 3 frases em português, com suas próprias palavras" },
            source: { type: "string", description: "Nome do veículo (ex.: Hodinkee, Monochrome, Fratello)" },
            link: { type: "string", description: "Endereço https da matéria original" },
            image_url: { type: ["string", "null"], description: "Endereço https de imagem da matéria, se aparecer na pesquisa; senão nulo" },
            published_on: { type: ["string", "null"], description: "Data de publicação AAAA-MM-DD" },
            is_lead: { type: "boolean", description: "true só para a notícia principal da semana" },
          },
        },
      },
    },
  },
};

const NEWS_SYSTEM = `Você é o editor do NEWS FLEX, o resumo semanal de notícias de relojoaria do app Time Collection (Brasil).
Use a pesquisa na web para encontrar as notícias mais relevantes dos últimos 7 dias: lançamentos, leilões, mercado de usados, marcas, eventos e, quando houver, novidades no Brasil.

Regras:
- Só notícias reais, com link para a matéria original que você encontrou. Nunca invente.
- Resuma com suas próprias palavras, em português do Brasil. Não copie trechos longos.
- Varie as fontes e as marcas; inclua relógios acessíveis, não só alto luxo.
- Marque exatamente uma notícia como principal (is_lead).
- Termine chamando a ferramenta entregar_edicao.`;

async function runNews({ force = false } = {}) {
  const edition = currentEdition();
  if (!force && (await one("select 1 from news where edition=$1 limit 1", [edition]))) return { edition, skipped: true };
  const startedAt = new Date();
  try {
    const { data, usage } = await research({
      system: NEWS_SYSTEM,
      prompt: `Monte a edição ${edition} do NEWS FLEX. Hoje é ${new Date().toISOString().slice(0, 10)}.`,
      tool: NEWS_TOOL, maxSearches: 10, maxFetches: 6,
      fake: () => ({ items: [
        { title: `Edição de teste ${edition}`, summary: "Notícia fictícia gerada no modo de teste.", source: "Teste",
          link: `https://example.com/news-${edition}-1`, image_url: null, published_on: new Date().toISOString().slice(0, 10), is_lead: true },
        { title: "Segunda notícia de teste", summary: "Outra notícia fictícia.", source: "Teste",
          link: `https://example.com/news-${edition}-2`, image_url: null, published_on: null, is_lead: false },
      ] }),
    });
    let leadSeen = false;
    const items = (Array.isArray(data.items) ? data.items : [])
      .map((n) => ({ ...n, link: httpUrl(n.link), title: text(n.title, 200) }))
      .filter((n) => n.link && n.title)
      .slice(0, 10);
    for (const n of items) {
      const isLead = Boolean(n.is_lead) && !leadSeen;
      leadSeen ||= isLead;
      await query(
        `insert into news (edition, title, summary, source, link, image_url, is_lead, published_on)
         values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (edition, link) do nothing`,
        [edition, n.title, text(n.summary, 800), text(n.source, 80), n.link, httpUrl(n.image_url), isLead, isoDate(n.published_on)]);
    }
    await recordRun("news", edition, "ok", `${items.length} notícia(s)`, usage, startedAt);
    log(`news: edição ${edition} com ${items.length} notícia(s)`);
    return { edition, count: items.length };
  } catch (e) {
    await recordRun("news", edition, "error", e.message, {}, startedAt);
    console.error("[agentes] news falhou", e.message);
    return { edition, error: e.message };
  }
}

// ---------- Preço médio de mercado (Trades & Deals) ----------

const PRICE_TOOL = {
  name: "entregar_preco",
  description: "Entrega a avaliação de preço de mercado do relógio. Chame uma única vez, no final.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["average", "min", "max", "confidence", "note", "sources"],
    properties: {
      average: { type: ["integer", "null"], description: "Preço médio de mercado no Brasil, em reais inteiros. Nulo se não houver base para estimar." },
      min: { type: ["integer", "null"], description: "Menor preço razoável encontrado (ignore valores absurdos)" },
      max: { type: ["integer", "null"], description: "Maior preço razoável encontrado" },
      confidence: { type: "string", enum: ["alta", "media", "baixa"], description: "alta: 5 ou mais anúncios comparáveis; media: 2 a 4; baixa: poucos dados ou só referências indiretas" },
      note: { type: "string", description: "Uma frase em português explicando a base da estimativa (ex.: 'média de 6 anúncios de usados com caixa')." },
      sources: {
        type: "array",
        description: "Até 6 anúncios usados como base, com links reais encontrados na pesquisa.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "store", "price", "link"],
          properties: {
            title: { type: "string" },
            store: { type: ["string", "null"] },
            price: { type: ["integer", "null"], description: "Preço em reais inteiros" },
            link: { type: "string", description: "Endereço https do anúncio" },
          },
        },
      },
    },
  },
};

const PRICE_SYSTEM = `Você é o avaliador de preços do Time Collection, um app brasileiro para colecionadores de relógios.
Sua tarefa é estimar o preço médio de mercado, no Brasil e hoje, de um relógio específico, para o dono anunciar com um preço justo.

Regras:
- Pesquise anúncios atuais do mesmo modelo (mesma referência quando informada) em marketplaces e lojas brasileiras (Mercado Livre, OLX, Enjoei, lojas e revendedores, Chrono24 com preço em reais ou envio ao Brasil).
- Compare com o estado informado: um usado deve ser comparado com usados; se só houver novos, desconte e explique na nota.
- Ignore réplicas, anúncios de peças/pulseiras e preços absurdos.
- Nunca invente anúncio, preço ou link. Se não achar base, devolva average nulo e explique.
- Preços em reais, números inteiros.
- Termine sempre chamando a ferramenta entregar_preco.`;

const describeWatch = (w) => [
  `Relógio: ${w.name}`,
  w.brand && `Marca: ${w.brand}`,
  w.model_ref && `Referência: ${w.model_ref}`,
  w.movement && `Movimento: ${w.movement}`,
  w.case_material && `Caixa: ${w.case_material}`,
  w.dial && `Mostrador: ${w.dial}`,
  `Estado: ${w.condition || "usado (não informado)"}`,
].filter(Boolean).join("\n");

// Preço médio: com 3+ anúncios usa a média deles (tirando o mais caro e o mais barato se houver 5+);
// com menos, usa a estimativa do agente
function averageFrom(data) {
  const prices = (data.sources || []).map((s) => int(s.price)).filter((v) => v && v > 0).sort((a, b) => a - b);
  if (prices.length >= 3) {
    const trimmed = prices.length >= 5 ? prices.slice(1, -1) : prices;
    return Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
  }
  return int(data.average);
}

async function runPriceCheck(watchId) {
  const w = await one(
    `update watches set market_status='working', market_started_at=now(), market_attempts=market_attempts+1, market_error=null
      where id=$1 and market_status='pending' returning *`, [watchId]);
  if (!w) return null;
  const startedAt = new Date();
  try {
    const { data, usage } = await research({
      system: PRICE_SYSTEM, tool: PRICE_TOOL, maxSearches: 6, maxFetches: 3,
      prompt: `Avalie o preço de mercado deste relógio:\n${describeWatch(w)}`,
      fake: () => {
        const base = w.estimate || w.price_paid || 3000;
        return {
          average: base, min: Math.round(base * 0.85), max: Math.round(base * 1.15), confidence: "media",
          note: "Estimativa de teste (modo AI_FAKE).",
          sources: [0.9, 1, 1.1].map((f, i) => ({ title: `${w.name} (exemplo ${i + 1})`, store: "Exemplo", price: Math.round(base * f), link: `https://example.com/preco-${i + 1}` })),
        };
      },
    });
    const sources = (Array.isArray(data.sources) ? data.sources : [])
      .map((s) => ({ title: text(s.title, 160), store: text(s.store, 60), price: int(s.price), link: httpUrl(s.link) }))
      .filter((s) => s.title && s.link).slice(0, 6);
    const avg = averageFrom({ ...data, sources });
    const confidence = ["alta", "media", "baixa"].includes(data.confidence) ? data.confidence : "baixa";
    // Se o relógio está à venda sem preço, já lança com o preço médio
    await query(
      `update watches set market_status='done', market_price=$2, market_min=$3, market_max=$4, market_confidence=$5,
              market_note=$6, market_sources=$7, market_checked_at=now(),
              sale_price=case when sale_mode='sale' and sale_price is null then $2 else sale_price end
        where id=$1`,
      [w.id, avg, int(data.min), int(data.max), confidence, text(data.note, 300), JSON.stringify(sources)]);
    await recordRun("price", w.id, "ok", avg ? `preço médio ${brl(avg)}` : "sem base para estimar", usage, startedAt);
    log(`preço: ${w.name} → ${avg ? brl(avg) : "sem estimativa"}`);
    return avg;
  } catch (e) {
    const giveUp = w.market_attempts >= MAX_ATTEMPTS;
    await query(`update watches set market_status=$2, market_error=$3 where id=$1`,
      [w.id, giveUp ? "failed" : "pending", String(e.message).slice(0, 500)]);
    await recordRun("price", w.id, "error", e.message, {}, startedAt);
    console.error("[agentes] preço falhou", w.id, e.message);
    return null;
  }
}

async function processPendingPrices(limit = 5) {
  await query(`update watches set market_status='pending' where market_status='working' and market_started_at < now() - interval '20 minutes'`);
  const pending = await query(`select id from watches where market_status='pending' order by updated_at limit $1`, [limit]);
  for (const p of pending) await runPriceCheck(p.id);
  return pending.length;
}

// ---------- Agendador ----------

let busy = false;
async function tick({ weekly = false } = {}) {
  if (busy) return;
  busy = true;
  try {
    if (weekly) { await scheduleRadarHunts(); await runNews(); }
    await processPendingPrices();
    await processPendingHunts();
  } catch (e) {
    console.error("[agentes] erro no ciclo", e.message);
  } finally { busy = false; }
}

// Liga os agentes: pedidos a cada 2 min; radar e notícias conferidos a cada 6 h (e na partida)
function startAgents() {
  if (!aiEnabled() || process.env.AGENTS_DISABLED === "true") {
    log("desligados (configure ANTHROPIC_API_KEY para ligar)");
    return;
  }
  log("ligados");
  setTimeout(() => tick({ weekly: true }), 10_000).unref();
  setInterval(() => tick(), 2 * 60 * 1000).unref();
  setInterval(() => tick({ weekly: true }), 6 * 60 * 60 * 1000).unref();
}

// Chamado logo depois de um pedido novo (busca ou preço), para não esperar o próximo ciclo.
// Se um ciclo já estiver rodando, marca para rodar de novo assim que ele terminar.
let again = false;
const kickHunts = () => {
  if (!aiEnabled() || process.env.AGENTS_DISABLED === "true") return;
  if (busy) { again = true; return; }
  setImmediate(async () => { do { again = false; await tick(); } while (again); });
};

module.exports = {
  startAgents, kickHunts, runHunt, processPendingHunts, scheduleRadarHunts, runNews, currentEdition,
  runPriceCheck, processPendingPrices,
  HUNT_SYSTEM, HUNT_TOOL, huntPrompt,
};
