// Teste de fumaça: percorre a API de ponta a ponta com duas contas de teste e confere as regras de acesso.
// Uso: npm run smoke                                  (API local em http://localhost:3001)
//      npm run smoke -- https://sua-api.onrender.com
//      npm run smoke -- http://localhost:3001 --agentes   também espera o Caçador atender (gasta IA se não for AI_FAKE)
// Cria duas contas com e-mail aleatório e apaga as duas no final (ficam só 2 relatos de teste).
const args = process.argv.slice(2);
const WAIT_AGENTS = args.includes("--agentes");
const BASE = (args.find((a) => !a.startsWith("--")) || process.env.API_URL || "http://localhost:3001").replace(/\/$/, "");
const tag = Date.now().toString(36);
let token = null;
let failures = 0;
const fail = (m) => { failures++; console.log("FALHA " + m); };

async function call(method, path, body, expected) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  const ok = res.status === expected;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FALHA"} ${method} ${path.slice(0, 70)} -> ${res.status}${ok ? "" : ` (esperado ${expected}) ${JSON.stringify(data)}`}`);
  return data;
}
const q = (o) => new URLSearchParams(o).toString();

async function account(name) {
  const handle = `${name}_${tag}`;
  const r = await call("POST", "/auth/register", { email: `${handle}@exemplo.com`, password: "senha-forte-123", handle, name, city: "Fortaleza, CE" }, 201);
  return { handle, token: r?.token, id: r?.user?.id };
}

(async () => {
  console.log(`Testando ${BASE}\n`);
  const health = await call("GET", "/health", null, 200);
  console.log(`     IA e robôs: ${health?.ai ? "ligados" : "desligados"}`);

  // Contas
  const a = await account("ana");
  const b = await account("bruno");
  await call("POST", "/auth/register", { email: `${a.handle}@exemplo.com`, password: "senha-forte-123", handle: a.handle, name: "X" }, 409);
  await call("POST", "/auth/login", { email: `${a.handle}@exemplo.com`, password: "errada" }, 401);
  token = a.token;
  const me = await call("GET", "/auth/me", null, 200);
  if (me && me.user.is_admin !== false) fail("conta nova não deveria ser admin");
  await call("POST", "/auth/password", { current_password: "errada", new_password: "outra-senha-123" }, 401);

  // Coleção privada (data/users/{eu})
  const mine = `data/users/${a.id}`;
  await call("PUT", "/docs/item", { path: mine, id: "w01", data: { kind: "watch", name: "Seiko 5 Sports", brand: "Seiko · Japão", status: "colecao", sale: "disponivel" } }, 204);
  await call("PUT", "/docs/item", { path: mine, id: "profile", data: { kind: "profile", name: "Ana", handle: a.handle } }, 204);
  const list = await call("GET", "/docs?" + q({ path: mine, limit: 1000 }), null, 200);
  if (list && list.docs.length !== 2) fail("coleção deveria ter 2 documentos");
  const one = await call("GET", "/docs/item?" + q({ path: mine, id: "w01" }), null, 200);
  if (one && one.doc?.data?.name !== "Seiko 5 Sports") fail("documento lido diferente do gravado");
  await call("PUT", "/docs/item", { path: mine, id: "x y", data: {} }, 400);
  await call("PUT", "/docs/item", { path: mine, id: "w02", data: [1, 2] }, 400);

  // Perfil público, comunidades e promoções: todos leem, cada um grava só o seu
  await call("PUT", "/docs/item", { path: "public", id: a.id, data: { name: "Ana", handle: a.handle } }, 204);
  await call("PUT", "/docs/item", { path: "cm", id: a.id, data: { communities: [{ id: "fortaleza", name: "Relógios Fortaleza", city: "Fortaleza, CE" }], joins: {} } }, 204);
  await call("PUT", "/docs/item", { path: `cm/${a.id}/x`, id: "p1", data: { comm: `${a.id}__fortaleza`, text: "Olá!" } }, 204);
  await call("PUT", "/docs/item", { path: "promo", id: a.id, data: { items: [] } }, 204);
  await call("PUT", "/docs/item", { path: "hunts", id: a.id, data: { uid: a.id, reqs: [{ id: `h${tag}`, q: "Seiko Alpinist", budget: 3000, cond: "usado", at: new Date().toISOString(), status: "pending" }], brands: [] } }, 204);

  // Regras de acesso, vistas pela outra conta
  token = b.token;
  await call("GET", "/docs?" + q({ path: mine }), null, 403);
  await call("GET", "/docs/item?" + q({ path: mine, id: "w01" }), null, 403);
  await call("PUT", "/docs/item", { path: mine, id: "w99", data: { kind: "watch" } }, 403);
  await call("PUT", "/docs/item", { path: "public", id: a.id, data: { name: "invasor" } }, 403);
  await call("PUT", "/docs/item", { path: `cm/${a.id}/x`, id: "p2", data: { text: "invasor" } }, 403);
  await call("PUT", "/docs/item", { path: "news", id: "n-x", data: { title: "falsa" } }, 403);
  const pub = await call("GET", "/docs?" + q({ path: "public" }), null, 200);
  if (pub && !pub.docs.some((d) => d.id === a.id)) fail("perfil público deveria aparecer para outra conta");
  await call("GET", "/docs?" + q({ path: `cm/${a.id}/x`, where: "comm", eq: `${a.id}__fortaleza` }), null, 200);
  const hb = await call("GET", "/docs/item?" + q({ path: "hunts", id: a.id }), null, 403);
  await call("GET", "/docs?" + q({ path: "news", limit: 400 }), null, 200);
  await call("GET", "/docs?" + q({ path: "segredo" }), null, 403);

  // Caçador: o robô atende o pedido e grava em hres
  token = a.token;
  if (WAIT_AGENTS) {
    let done = false;
    for (let i = 0; i < 60 && !done; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const h = await call("GET", "/docs/item?" + q({ path: "hunts", id: a.id }), null, 200);
      done = h?.doc?.data?.reqs?.[0]?.status === "done";
    }
    const res = await call("GET", "/docs?" + q({ path: "hres", where: "uid", eq: a.id }), null, 200);
    if (!done || !res?.docs.length) fail("o Caçador não atendeu o pedido");
    else console.log(`     caçador: ${res.docs[0].data.items.length} anúncio(s) · ${res.docs[0].data.note}`);
  }

  // IA do app
  const lim = await call("GET", "/ia/limits", null, 200);
  if (lim?.enabled) {
    const r = await call("POST", "/ia/json", { prompt: 'Responda SOMENTE com JSON: {"ok": true}', tier: "quick" }, 200);
    if (r && typeof r.data !== "object") fail("IA deveria devolver JSON");
  }
  await call("POST", "/ia/json", { prompt: "teste", images: ["data:text/plain;base64,AAAA"] }, lim?.enabled ? 400 : 503);

  // Relatos
  await call("POST", "/feedback", { message: "oi" }, 400);
  await call("POST", "/feedback", { kind: "bug", message: "Teste automático: botão não respondeu", page: "economy", app_version: "smoke" }, 201);
  const fm = await call("GET", "/feedback/mine", null, 200);
  if (fm && fm.feedback.length !== 1) fail("deveria ter 1 relato meu");
  await call("GET", "/admin/overview", null, 403);
  token = null;
  await call("GET", "/docs?" + q({ path: "public" }), null, 401);
  await call("POST", "/feedback", { kind: "account", message: "Esqueci minha senha (teste)" }, 400);
  await call("POST", "/feedback", { kind: "account", message: "Esqueci minha senha (teste)", contact: `${a.handle}@exemplo.com` }, 201);

  // Excluir as contas de teste (apaga também todos os documentos delas)
  for (const acc of [a, b]) {
    token = acc.token;
    await call("DELETE", "/users/me", { password: "senha-forte-123" }, 204);
  }
  token = b.token;
  await call("GET", "/auth/me", null, 404);
  token = null;
  await call("GET", "/rota-que-nao-existe", null, 404);

  console.log(failures ? `\n${failures} falha(s).` : "\nTudo certo.");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("Não consegui falar com a API:", e.message); process.exit(1); });
