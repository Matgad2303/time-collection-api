// Comandos de administração pelo terminal (usam a DATABASE_URL do .env)
//   npm run relatos                         lista os relatos em aberto (para ler e colar numa conversa com o Claude)
//   npm run relatos -- todos                lista todos os relatos
//   npm run tornar-admin -- email@ex.com    dá acesso ao painel de administração
//   npm run nova-senha -- email@ex.com      gera uma senha provisória para quem esqueceu
//   npm run agente:cacador                  processa agora os pedidos pendentes do caçador
//   npm run agente:news                     gera agora a edição da semana do NEWS FLEX (se ainda não existe)
//   npm run testar-ia                       faz uma busca real de teste (sem gravar nada) e mostra o custo
require("dotenv").config();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { pool, query, one } = require("./db");

const KIND = { bug: "Problema", idea: "Ideia", account: "Conta", other: "Outro" };
const [cmd, arg] = process.argv.slice(2);

const commands = {
  async relatos() {
    const where = arg === "todos" ? "" : "where f.status in ('new','seen','doing')";
    const rows = await query(
      `select f.*, u.handle from feedback f left join users u on u.id=f.user_id ${where} order by f.created_at`);
    if (!rows.length) return console.log("Nenhum relato em aberto.");
    for (const f of rows) {
      console.log(`\n## [${KIND[f.kind]}] ${f.status} · ${f.created_at.toISOString().slice(0, 16).replace("T", " ")} · ${f.handle ? "@" + f.handle : f.contact || "anônimo"}`);
      console.log(`id: ${f.id}`);
      console.log(f.message);
      if (f.page) console.log(`Tela: ${f.page}`);
      if (f.last_error) console.log(`Último erro: ${f.last_error}`);
      if (f.device) console.log(`Aparelho: ${f.device}`);
      if (f.app_version) console.log(`Versão: ${f.app_version}`);
      if (f.reply) console.log(`Resposta: ${f.reply}`);
    }
    console.log(`\n${rows.length} relato(s).`);
  },
  async "tornar-admin"() {
    if (!arg) throw new Error("Informe o e-mail: npm run tornar-admin -- email@exemplo.com");
    const u = await one("update users set is_admin=true where email=$1 returning handle", [arg.toLowerCase()]);
    console.log(u ? `@${u.handle} agora é administrador. Saia e entre de novo no app para ver o painel.` : "Nenhuma conta com esse e-mail.");
  },
  async "nova-senha"() {
    if (!arg) throw new Error("Informe o e-mail: npm run nova-senha -- email@exemplo.com");
    const temp = crypto.randomBytes(6).toString("base64url");
    const u = await one("update users set password_hash=$2, updated_at=now() where email=$1 returning handle",
      [arg.toLowerCase(), await bcrypt.hash(temp, 10)]);
    console.log(u ? `Senha provisória de @${u.handle}: ${temp}\nPeça para a pessoa trocar em Minha conta > Trocar senha.` : "Nenhuma conta com esse e-mail.");
  },
  async "agente:cacador"() {
    const n = await require("./agents").processPendingHunts(20);
    console.log(`${n} pedido(s) processado(s).`);
  },
  async "testar-ia"() {
    const { research, aiEnabled, MODEL, FAKE } = require("./ai");
    if (!aiEnabled()) throw new Error("Configure ANTHROPIC_API_KEY no .env para testar.");
    console.log(`Testando ${FAKE ? "em modo de teste (AI_FAKE)" : MODEL}... pode levar 1 a 3 minutos.`);
    const agents = require("./agents");
    const t = Date.now();
    const { data, usage } = await research({
      system: agents.HUNT_SYSTEM, tool: agents.HUNT_TOOL,
      prompt: agents.huntPrompt({ source: "user", query: arg || "Seiko 5 Sports SRPD", budget: 2500, condition: "tanto faz" }, []),
      fake: () => ({ summary: "modo de teste", items: [] }),
    });
    console.log(`\nResumo: ${data.summary}`);
    for (const i of data.items) console.log(`- ${i.title} | ${i.store || "?"} | ${i.price ? "R$ " + i.price : i.price_text || "?"} | ${i.link}`);
    const cost = (usage.input_tokens * 4 + usage.output_tokens * 20) / 1e6 + usage.searches * 0.01;
    console.log(`\n${data.items.length} anúncio(s) em ${Math.round((Date.now() - t) / 1000)} s · ${usage.searches} pesquisa(s) · ${usage.input_tokens} tokens de entrada, ${usage.output_tokens} de saída · custo aproximado US$ ${cost.toFixed(3)} (preços do Opus 5.5)`);
  },
  async "agente:news"() {
    console.log(await require("./agents").runNews({ force: arg === "forcar" }));
  },
};

(async () => {
  if (!commands[cmd]) throw new Error(`Comando desconhecido. Use: ${Object.keys(commands).join(", ")}`);
  await commands[cmd]();
})()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => pool.end());
