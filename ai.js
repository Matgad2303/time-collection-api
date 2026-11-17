// IA do Time Collection, com provedores grátis primeiro.
//
// Ordem de tentativa (usa o primeiro que tiver chave e responder):
//   1. Gemini (Google AI Studio)  — grátis com limite diário; lê fotos e pesquisa no Google
//   2. Groq                       — grátis com limite diário; texto, e pesquisa web no modelo "groq/compound"
//   3. Mistral                    — grátis (plano Experiment); texto e fotos, sem pesquisa na web
//   4. Claude (Anthropic)         — pago; só entra se ANTHROPIC_API_KEY existir
//
// Variáveis de ambiente:
//   GEMINI_API_KEY      liga o Gemini (aistudio.google.com > Get API key; sem cartão)
//   GEMINI_MODEL        modelo principal (padrão gemini-flash-latest)
//   GEMINI_MODEL_QUICK  modelo das respostas rápidas (padrão gemini-flash-lite-latest)
//   GROQ_API_KEY        liga o Groq (console.groq.com > API Keys; sem cartão)
//   GROQ_MODEL          modelo de texto (padrão openai/gpt-oss-120b)
//   GROQ_SEARCH_MODEL   modelo que pesquisa na web com a ferramenta browser_search (padrão openai/gpt-oss-120b)
//   MISTRAL_API_KEY     liga o Mistral (console.mistral.ai > API Keys; plano grátis, sem cartão)
//   MISTRAL_MODEL       modelo do Mistral (padrão mistral-small-latest, lê fotos)
//   ANTHROPIC_API_KEY   liga o Claude (pago), usado só se os grátis falharem
//   AI_MODEL / AI_MODEL_QUICK / AI_EFFORT   modelos e esforço do Claude
//   AI_FAKE=true        modo de teste: devolve dados de exemplo sem chamar nenhuma IA
//
// Privacidade: no plano grátis o Google pode usar o conteúdo enviado para melhorar os produtos dele.
// A API nunca manda nome, e-mail, WhatsApp ou senha para a IA; só o pedido do app e as fotos que a
// própria pessoa escolheu analisar.
const Anthropic = require("@anthropic-ai/sdk");

const MODEL = process.env.AI_MODEL || "claude-opus-5-5";
const QUICK_MODEL = process.env.AI_MODEL_QUICK || "claude-haiku-5-5";
const EFFORT = process.env.AI_EFFORT || "medium";
const FAKE = process.env.AI_FAKE === "true";

const GEMINI_MODEL = () => process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_QUICK = () => process.env.GEMINI_MODEL_QUICK || "gemini-flash-lite-latest";
const GROQ_MODEL = () => process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const MISTRAL_MODEL = () => process.env.MISTRAL_MODEL || "mistral-small-latest";
const GROQ_SEARCH = () => process.env.GROQ_SEARCH_MODEL || "openai/gpt-oss-120b";

const has = {
  gemini: () => Boolean(process.env.GEMINI_API_KEY),
  groq: () => Boolean(process.env.GROQ_API_KEY),
  mistral: () => Boolean(process.env.MISTRAL_API_KEY),
  claude: () => Boolean(process.env.ANTHROPIC_API_KEY),
};
const aiEnabled = () => FAKE || has.gemini() || has.groq() || has.mistral() || has.claude();
const providers = () => ["gemini", "groq", "mistral", "claude"].filter((p) => has[p]());

let client = null;
const getClient = () => (client ||= new Anthropic({ maxRetries: 3, timeout: 10 * 60 * 1000 }));

class AiError extends Error {}

const BASE_SYSTEM = "Você é a IA do Time Collection, um app brasileiro para colecionadores de relógios. Responda em português do Brasil. Quando o pedido disser para responder só com JSON, responda apenas com o JSON pedido, sem texto antes ou depois.";

function parseJson(text) {
  const t = String(text || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  const c = t.indexOf("["), d = t.lastIndexOf("]");
  if (c >= 0 && d > c) { try { return JSON.parse(t.slice(c, d + 1)); } catch {} }
  throw new AiError("A IA não respondeu no formato esperado");
}

async function postJson(url, body, headers = {}, timeoutMs = 120000) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const txt = await r.text();
  if (!r.ok) {
    const err = new AiError(`${new URL(url).hostname} ${r.status}: ${txt.slice(0, 300)}`);
    err.status = r.status;
    throw err;
  }
  try { return JSON.parse(txt); } catch { throw new AiError("Resposta inválida do provedor de IA"); }
}

// ---------- Gemini ----------
// O Google às vezes fica sobrecarregado (503) ou corta um modelo por minuto (429). Por isso cada pedido
// tenta uma lista de modelos, um depois do outro, antes de passar para o próximo provedor.
const uniq = (a) => [...new Set(a.filter(Boolean))];
const GEMINI_CHAIN = () => uniq([GEMINI_MODEL(), "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"]);
const GEMINI_QUICK_CHAIN = () => uniq([GEMINI_QUICK(), "gemini-3.5-flash-lite", GEMINI_MODEL()]);

// A pesquisa no Google (grounding) pode não estar liberada no plano grátis da conta. Quando o Google
// recusa por cota, a API para de tentar por 6 horas e vai direto para o Groq, sem gastar tempo.
let searchBlockedUntil = 0;
const geminiSearchOk = () => Date.now() > searchBlockedUntil;

async function gemini({ system, prompt, images = [], models, search = false, json = false, maxTokens = 8192 }) {
  const parts = [
    ...images.slice(0, 8).map((im) => ({ inline_data: { mime_type: im.media_type, data: im.data } })),
    { text: prompt },
  ];
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4, ...(json && !search ? { responseMimeType: "application/json" } : {}) },
    ...(search ? { tools: [{ google_search: {} }] } : {}),
  };
  let last;
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const d = await postJson(url, body, { "x-goog-api-key": process.env.GEMINI_API_KEY }, search ? 90000 : 60000);
      const cand = (d.candidates || [])[0];
      if (!cand) throw new AiError("Gemini não respondeu" + (d.promptFeedback?.blockReason ? ` (${d.promptFeedback.blockReason})` : ""));
      const text = (cand.content?.parts || []).map((p) => p.text || "").join("");
      if (!text.trim()) throw new AiError(`Gemini respondeu vazio (${cand.finishReason || "?"})`);
      const u = d.usageMetadata || {};
      return { text, usage: { input_tokens: u.promptTokenCount || 0, output_tokens: u.candidatesTokenCount || 0, searches: search ? 1 : 0, model } };
    } catch (e) {
      last = e;
      if (search && e.status === 429 && /quota/i.test(e.message)) {
        searchBlockedUntil = Date.now() + 6 * 60 * 60 * 1000;
        throw new AiError("Pesquisa do Gemini sem cota no plano grátis");
      }
      if (e.status === 400 || e.status === 401 || e.status === 403) throw e; // chave ou pedido errado: trocar de modelo não resolve
      console.warn(`[ia] gemini ${model} falhou: ${e.message.slice(0, 120)}`);
    }
  }
  throw last || new AiError("Gemini não respondeu");
}

// ---------- Groq (compatível com a API da OpenAI) ----------
async function groq({ system, prompt, model, json = false, search = false, maxTokens = 8192 }) {
  const body = {
    model,
    max_tokens: maxTokens,
    temperature: 0.4,
    messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    ...(json && !search ? { response_format: { type: "json_object" } } : {}),
    // Pesquisa na web feita pelo próprio Groq (ferramenta browser_search dos modelos gpt-oss).
    ...(search ? { tools: [{ type: "browser_search" }], tool_choice: "required" } : {}),
  };
  const d = await postJson("https://api.groq.com/openai/v1/chat/completions", body, { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, 120000);
  // Tira as marcas de citação do tipo 【3†L8-L12】 que o modelo coloca no texto.
  const text = (d.choices?.[0]?.message?.content || "").replace(/【[^】]*】/g, "");
  if (!text.trim()) throw new AiError("Groq respondeu vazio");
  return { text, usage: { input_tokens: d.usage?.prompt_tokens || 0, output_tokens: d.usage?.completion_tokens || 0, searches: 0 } };
}

// ---------- Mistral (reserva grátis; lê fotos, não pesquisa na web) ----------
async function mistral({ system, prompt, images = [], model, json = false, maxTokens = 8192 }) {
  const content = [
    ...images.slice(0, 8).map((im) => ({ type: "image_url", image_url: `data:${im.media_type};base64,${im.data}` })),
    { type: "text", text: prompt },
  ];
  const body = {
    model,
    max_tokens: maxTokens,
    temperature: 0.4,
    messages: [{ role: "system", content: system }, { role: "user", content }],
    ...(json ? { response_format: { type: "json_object" } } : {}),
  };
  const d = await postJson("https://api.mistral.ai/v1/chat/completions", body, { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` }, 90000);
  const text = d.choices?.[0]?.message?.content || "";
  if (!String(text).trim()) throw new AiError("Mistral respondeu vazio");
  return { text, usage: { input_tokens: d.usage?.prompt_tokens || 0, output_tokens: d.usage?.completion_tokens || 0, searches: 0, model } };
}

// ---------- Links: só fica o que abre de verdade ----------
// IA grátis pode errar o endereço de um anúncio ou notícia. Antes de mostrar, a API confere se o link abre.
async function linkOk(u) {
  if (!/^https?:\/\//i.test(String(u || ""))) return false;
  if (/example\.com|vertexaisearch\.cloud\.google\.com/i.test(u)) return false;
  for (const method of ["HEAD", "GET"]) {
    try {
      const r = await fetch(u, { method, redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 (TimeCollection link check)" } });
      if (r.status < 400) return true;
      if (r.status === 403 || r.status === 429) return true; // loja que bloqueia robôs: o link existe
    } catch {}
  }
  return false;
}
async function keepWorkingLinks(data) {
  if (!data || !Array.isArray(data.items)) return data;
  const checks = await Promise.all(data.items.map((it) => {
    const u = it && (it.link || it.url);
    return u ? linkOk(u) : Promise.resolve(true);
  }));
  return { ...data, items: data.items.filter((_, i) => checks[i]) };
}

// ---------- Pesquisa na web com resultado em formato fixo (Caçador, Deixar avisado, NEWS FLEX) ----------
function schemaPrompt(prompt, tool) {
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
  return `${prompt}

Hoje é ${hoje}. Pesquise na internet antes de responder e prefira o que foi publicado nos últimos dias; descarte o que for antigo. Use somente informações e links que você realmente encontrou na pesquisa; nunca invente links, preços ou datas.
Responda SOMENTE com um JSON (sem texto antes ou depois) que siga exatamente este esquema JSON Schema:
${JSON.stringify(tool.input_schema)}`;
}

async function research({ system, prompt, tool, maxSearches = 8, maxFetches = 4, fake }) {
  if (FAKE) return { data: fake(), usage: { input_tokens: 0, output_tokens: 0, searches: 0 } };
  const list = providers();
  if (!list.length) throw new AiError("Nenhuma chave de IA configurada (GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY ou ANTHROPIC_API_KEY)");
  const sys = system.replace(/chamando a ferramenta \w+/gi, "respondendo com o JSON pedido").replace(/a ferramenta \w+/gi, "o JSON pedido");
  let last;
  for (const p of list) {
    try {
      if (p === "gemini") {
        if (!geminiSearchOk()) continue;
        const r = await gemini({ system: sys, prompt: schemaPrompt(prompt, tool), models: GEMINI_CHAIN(), search: true, maxTokens: 16000 });
        return { data: await keepWorkingLinks(parseJson(r.text)), usage: { ...r.usage, provider: "gemini" } };
      }
      if (p === "groq") {
        const r = await groq({ system: sys, prompt: schemaPrompt(prompt, tool), model: GROQ_SEARCH(), search: true, maxTokens: 8000 });
        return { data: await keepWorkingLinks(parseJson(r.text)), usage: { ...r.usage, provider: "groq" } };
      }
      if (p === "mistral") continue; // sem pesquisa na web: inventaria preços e links
      return await researchClaude({ system, prompt, tool, maxSearches, maxFetches });
    } catch (e) {
      last = e;
      console.warn(`[ia] pesquisa: ${p} falhou: ${e.message}`);
    }
  }
  throw last || new AiError(has.gemini() && !geminiSearchOk()
    ? "A pesquisa na internet está sem cota no Gemini grátis; ligue o Groq (GROQ_API_KEY) para o Caçador e o NEWS FLEX"
    : "A IA não respondeu");
}

async function researchClaude({ system, prompt, tool, maxSearches, maxFetches }) {
  const usage = { input_tokens: 0, output_tokens: 0, searches: 0, provider: "claude" };
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: maxSearches,
      user_location: { type: "approximate", country: "BR", timezone: "America/Sao_Paulo" } },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: maxFetches },
    { ...tool, strict: true },
  ];
  const messages = [{ role: "user", content: prompt }];
  let nudged = false;
  for (let turn = 0; turn < 8; turn++) {
    const res = await getClient().beta.messages.create({
      model: MODEL, max_tokens: 16000, output_config: { effort: EFFORT },
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      system, tools, messages,
    });
    usage.input_tokens += res.usage.input_tokens || 0;
    usage.output_tokens += res.usage.output_tokens || 0;
    usage.searches += res.usage.server_tool_use?.web_search_requests || 0;
    if (res.stop_reason === "refusal") throw new AiError("O modelo recusou o pedido");
    const delivered = res.content.find((b) => b.type === "tool_use" && b.name === tool.name);
    if (delivered) return { data: delivered.input, usage };
    if (res.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: res.content }); continue; }
    if (res.stop_reason === "max_tokens") throw new AiError("Resposta longa demais (max_tokens)");
    if (nudged) break;
    nudged = true;
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: `Agora entregue o resultado chamando a ferramenta ${tool.name}.` });
  }
  throw new AiError("O agente terminou sem entregar o resultado");
}

// ---------- IA dentro do app (Ateliê, What If Flexx, cadastro por foto, No pulso hoje, faixa de preço...) ----------
// images: [{ media_type: "image/jpeg", data: "<base64>" }]
async function askJson({ prompt, images = [], tier = "default", fake }) {
  if (FAKE) return { data: fake ? fake() : { ok: true, note: "Resposta de teste (AI_FAKE)." }, usage: { input_tokens: 0, output_tokens: 0 } };
  const list = providers();
  if (!list.length) throw new AiError("Nenhuma chave de IA configurada (GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY ou ANTHROPIC_API_KEY)");
  const quick = tier === "quick";
  let last;
  for (const p of list) {
    if (p === "groq" && images.length) continue; // o modelo de texto do Groq não lê fotos
    try {
      if (p === "gemini") {
        const r = await gemini({ system: BASE_SYSTEM, prompt, images, models: quick ? GEMINI_QUICK_CHAIN() : GEMINI_CHAIN(), json: true });
        return { data: parseJson(r.text), usage: { ...r.usage, provider: "gemini" } };
      }
      if (p === "groq") {
        const r = await groq({ system: BASE_SYSTEM, prompt, model: GROQ_MODEL(), json: true });
        return { data: parseJson(r.text), usage: { ...r.usage, provider: "groq" } };
      }
      if (p === "mistral") {
        const r = await mistral({ system: BASE_SYSTEM, prompt, images, model: MISTRAL_MODEL(), json: true });
        return { data: parseJson(r.text), usage: { ...r.usage, provider: "mistral" } };
      }
      return await askClaude({ prompt, images, tier });
    } catch (e) {
      last = e;
      console.warn(`[ia] app: ${p} falhou: ${e.message}`);
    }
  }
  throw last || new AiError(images.length ? "Nenhuma IA disponível lê fotos agora" : "A IA não respondeu");
}

async function askClaude({ prompt, images, tier }) {
  const quick = tier === "quick";
  const content = [
    ...images.slice(0, 8).map((im) => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } })),
    { type: "text", text: prompt },
  ];
  const res = await getClient().beta.messages.create({
    model: quick ? QUICK_MODEL : MODEL,
    max_tokens: 16000,
    output_config: { effort: quick ? "low" : tier === "complex" ? "high" : EFFORT },
    ...(quick ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }),
    system: BASE_SYSTEM,
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") throw new AiError("O modelo recusou o pedido");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { data: parseJson(text), usage: { input_tokens: res.usage.input_tokens || 0, output_tokens: res.usage.output_tokens || 0, provider: "claude" } };
}

module.exports = { research, askJson, aiEnabled, providers, AiError, MODEL, FAKE, parseJson, linkOk };
