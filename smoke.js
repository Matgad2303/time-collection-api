// Teste de fumaça: percorre as principais rotas da API de ponta a ponta.
// Uso: npm run smoke                      (API local em http://localhost:3001)
//      npm run smoke -- https://sua-api.onrender.com
// Cria um usuário de teste com e-mail aleatório; rode em produção só se aceitar esse registro extra.
const BASE = (process.argv[2] || process.env.API_URL || "http://localhost:3001").replace(/\/$/, "");
const tag = Date.now().toString(36);
let token = null;
let failures = 0;

async function call(method, path, body, expected) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  const ok = res.status === expected;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FALHA"} ${method} ${path} -> ${res.status}${ok ? "" : ` (esperado ${expected}) ${JSON.stringify(data)}`}`);
  return data;
}

(async () => {
  console.log(`Testando ${BASE}\n`);
  await call("GET", "/health", null, 200);

  const handle = `teste_${tag}`;
  const reg = await call("POST", "/auth/register",
    { email: `${handle}@exemplo.com`, password: "senha-forte-123", handle, name: "Teste", city: "Fortaleza" }, 201);
  await call("POST", "/auth/register", { email: `${handle}@exemplo.com`, password: "senha-forte-123", handle, name: "X" }, 409);
  await call("POST", "/auth/login", { email: `${handle}@exemplo.com`, password: "errada" }, 401);
  const login = await call("POST", "/auth/login", { email: `${handle}@exemplo.com`, password: "senha-forte-123" }, 200);
  token = login?.token || reg?.token;

  await call("GET", "/auth/me", null, 200);
  await call("PATCH", "/users/me", { bio: "Colecionador de teste", whatsapp: "5585999999999" }, 200);

  const w = await call("POST", "/watches", { name: "Seiko SKX007", brand: "Seiko", movement: "automático" }, 201);
  await call("POST", "/watches", { name: "Inválido", status: "xyz" }, 400);
  await call("POST", "/watches", { name: "Preço ruim", price_paid: "abc" }, 400);
  await call("POST", "/watches", { name: "Tudor BB58", brand: "Tudor", status: "wish" }, 201);
  await call("GET", "/watches", null, 200);
  await call("GET", "/watches?status=wish", null, 200);
  await call("PATCH", `/watches/${w.watch.id}`, { sale_mode: "sale", sale_price: 2500, condition: "usado" }, 200);
  await call("PATCH", `/watches/${w.watch.id}`, { status: "on_the_way" }, 200);
  const detail = await call("GET", `/watches/${w.watch.id}`, null, 200);
  if (detail && detail.history.length !== 2) { failures++; console.log("FALHA linha do tempo deveria ter 2 itens"); }
  await call("GET", "/watches/nao-e-uuid", null, 400);

  await call("GET", `/users?q=${handle.slice(0, 6)}`, null, 200);
  await call("GET", `/users/${handle}`, null, 200);
  await call("GET", "/users/ninguem_existe_aqui", null, 404);

  const c = await call("POST", "/communities", { name: `Relógios Teste ${tag}`, city: "Fortaleza" }, 201);
  await call("GET", "/communities?city=Fortaleza", null, 200);
  const cd = await call("GET", `/communities/${c.community.id}`, null, 200);
  if (cd && cd.community.my_role !== "admin") { failures++; console.log("FALHA quem cria deveria ser admin"); }
  const p = await call("POST", `/communities/${c.community.id}/posts`, { body: "Primeiro post!" }, 201);
  await call("GET", `/communities/${c.community.id}/posts`, null, 200);
  await call("DELETE", `/communities/${c.community.id}/posts/${p.post.id}`, null, 204);
  await call("POST", `/communities/${c.community.id}/leave`, null, 204);
  await call("GET", `/communities/${c.community.id}/posts`, null, 403);
  await call("POST", `/communities/${c.community.id}/join`, null, 204);

  const listings = await call("GET", "/market/listings?brand=seiko", null, 200);
  if (listings && !listings.listings.some(l => l.id === w.watch.id)) { failures++; console.log("FALHA relógio à venda não apareceu na vitrine"); }
  await call("POST", "/market/promos", { title: "Promo", link: "http://inseguro.com" }, 400);
  const promo = await call("POST", "/market/promos", { title: "Seiko 5 em promoção", link: "https://exemplo.com/p", price: 1200 }, 201);
  await call("GET", "/market/promos", null, 200);
  await call("DELETE", `/market/promos/${promo.promo.id}`, null, 204);

  const h = await call("POST", "/hunts", { query: "Seiko Alpinist", budget: 3000, condition: "usado" }, 201);
  await call("GET", "/hunts", null, 200);
  await call("PUT", "/hunts/radar", { brands: [{ brand: "Seiko", max_price: 3000 }, { brand: "Orient" }] }, 200);
  await call("GET", "/hunts/radar", null, 200);
  await call("DELETE", `/hunts/${h.hunt.id}`, null, 204);

  await call("GET", "/news", null, 200);
  await call("DELETE", `/watches/${w.watch.id}`, null, 204);

  token = null;
  await call("GET", "/watches", null, 401);
  await call("GET", "/rota-que-nao-existe", null, 404);

  console.log(failures ? `\n${failures} falha(s).` : "\nTudo certo.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("Não consegui falar com a API:", e.message); process.exit(1); });
