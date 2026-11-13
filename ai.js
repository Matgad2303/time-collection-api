// Conexão com o Claude (Anthropic) usada pelos agentes: pesquisa na web e entrega o resultado
// num formato fixo, através de uma ferramenta "entregar" com esquema estrito.
//
// Variáveis de ambiente:
//   ANTHROPIC_API_KEY  liga os agentes (sem ela, o app funciona e os agentes ficam desligados)
//   AI_MODEL           modelo (padrão claude-opus-5-5)
//   AI_EFFORT          esforço de raciocínio: low, medium, high (padrão medium)
//   AI_FAKE=true       modo de teste: devolve dados de exemplo sem chamar a API (não gasta nada)
const Anthropic = require("@anthropic-ai/sdk");

const MODEL = process.env.AI_MODEL || "claude-opus-5-5";
const EFFORT = process.env.AI_EFFORT || "medium";
const FAKE = process.env.AI_FAKE === "true";

const aiEnabled = () => FAKE || Boolean(process.env.ANTHROPIC_API_KEY);

let client = null;
const getClient = () => (client ||= new Anthropic({ maxRetries: 3, timeout: 10 * 60 * 1000 }));

class AiError extends Error {}

// Pesquisa na web e termina chamando a ferramenta `tool` (esquema estrito) com o resultado.
// Devolve { data, usage: { input_tokens, output_tokens, searches } }.
async function research({ system, prompt, tool, maxSearches = 8, maxFetches = 4, fake }) {
  if (FAKE) return { data: fake(), usage: { input_tokens: 0, output_tokens: 0, searches: 0 } };
  if (!process.env.ANTHROPIC_API_KEY) throw new AiError("ANTHROPIC_API_KEY não configurada");

  const usage = { input_tokens: 0, output_tokens: 0, searches: 0 };
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
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: EFFORT },
      // Se o modelo recusar por política, a API tenta de novo num modelo alternativo
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      tools,
      messages,
    });
    usage.input_tokens += res.usage.input_tokens || 0;
    usage.output_tokens += res.usage.output_tokens || 0;
    usage.searches += res.usage.server_tool_use?.web_search_requests || 0;

    if (res.stop_reason === "refusal") throw new AiError("O modelo recusou o pedido");

    const delivered = res.content.find((b) => b.type === "tool_use" && b.name === tool.name);
    if (delivered) return { data: delivered.input, usage };

    if (res.stop_reason === "pause_turn") {
      // A pesquisa no servidor parou no limite de passos: reenviar para continuar de onde parou
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    if (res.stop_reason === "max_tokens") throw new AiError("Resposta longa demais (max_tokens)");
    if (nudged) break;
    // Terminou sem entregar: pede uma vez para entregar pela ferramenta
    nudged = true;
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: `Agora entregue o resultado chamando a ferramenta ${tool.name}.` });
  }
  throw new AiError("O agente terminou sem entregar o resultado");
}

module.exports = { research, aiEnabled, AiError, MODEL, FAKE };
