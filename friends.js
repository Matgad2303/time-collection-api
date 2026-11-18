// Amigos: pedido de amizade entre colecionadores (um pede, o outro aceita).
// Rotas usam o id do usuário (o mesmo id do perfil público no app).
const router = require("express").Router();
const { query, one } = require("./db");
const { wrap, HttpError } = require("./http");
const { requireAuth } = require("./authlib");

const uuidOk = (s) => /^[0-9a-f-]{36}$/i.test(String(s || ""));
const pairOf = async (a, b) => one(
  `select * from friendships where (requester=$1 and addressee=$2) or (requester=$2 and addressee=$1)`, [a, b]);

// Meus amigos e pedidos: { friends:[id], incoming:[{id,handle,name}], outgoing:[id] }
router.get("/", requireAuth, wrap(async (req, res) => {
  const me = req.user.id;
  const rows = await query(
    `select f.requester, f.addressee, f.status, u.id as other, u.handle, u.name
       from friendships f join users u on u.id = case when f.requester=$1 then f.addressee else f.requester end
      where f.requester=$1 or f.addressee=$1`, [me]);
  res.json({
    friends: rows.filter((r) => r.status === "accepted").map((r) => r.other),
    incoming: rows.filter((r) => r.status === "pending" && r.addressee === me).map((r) => ({ id: r.other, handle: r.handle, name: r.name })),
    outgoing: rows.filter((r) => r.status === "pending" && r.requester === me).map((r) => r.other),
  });
}));

// Pedir amizade (se a outra pessoa já tinha pedido, vira amizade na hora)
router.post("/:id", requireAuth, wrap(async (req, res) => {
  const me = req.user.id, other = req.params.id;
  if (!uuidOk(other) || other === me) throw new HttpError(400, "Pedido inválido.");
  const u = await one(`select id from users where id=$1`, [other]);
  if (!u) throw new HttpError(404, "Colecionador não encontrado.");
  const cur = await pairOf(me, other);
  if (cur && cur.status === "accepted") return res.json({ status: "friends" });
  if (cur && cur.requester === other) {
    await query(`update friendships set status='accepted', accepted_at=now() where requester=$1 and addressee=$2`, [other, me]);
    return res.json({ status: "friends" });
  }
  if (!cur) {
    const n = await one(`select count(*)::int n from friendships where requester=$1 and status='pending' and created_at > now() - interval '1 day'`, [me]);
    if (n.n >= 50) throw new HttpError(429, "Muitos pedidos hoje. Tente amanhã.");
    await query(`insert into friendships (requester, addressee) values ($1,$2) on conflict do nothing`, [me, other]);
  }
  res.status(201).json({ status: "sent" });
}));

// Aceitar um pedido recebido
router.post("/:id/accept", requireAuth, wrap(async (req, res) => {
  if (!uuidOk(req.params.id)) throw new HttpError(400, "Pedido inválido.");
  const r = await query(`update friendships set status='accepted', accepted_at=now()
                          where requester=$1 and addressee=$2 and status='pending' returning requester`, [req.params.id, req.user.id]);
  if (!r.length) throw new HttpError(404, "Pedido não encontrado.");
  res.json({ status: "friends" });
}));

// Recusar, cancelar ou desfazer amizade
router.delete("/:id", requireAuth, wrap(async (req, res) => {
  if (!uuidOk(req.params.id)) throw new HttpError(400, "Pedido inválido.");
  await query(`delete from friendships where (requester=$1 and addressee=$2) or (requester=$2 and addressee=$1)`, [req.user.id, req.params.id]);
  res.json({ status: "none" });
}));

module.exports = router;
