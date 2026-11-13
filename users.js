const router = require("express").Router();
const { query, one } = require("./db");
const bcrypt = require("bcryptjs");
const { wrap, need, HttpError, pick } = require("./http");
const { requireAuth, optionalAuth } = require("./authlib");
const { publicUser } = require("./auth");

// O WhatsApp só aparece para quem está logado (evita robôs coletando números)
const visible = (u, req) => ({ ...publicUser(u), whatsapp: req.user ? u.whatsapp : null });

// Busca de pessoas pelo @ ou pelo nome
router.get("/", optionalAuth, wrap(async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase().replace(/^@/, "").replace(/[%\\]/g, "");
  if (q.length < 2) return res.json({ users: [] });
  const rows = await query(
    `select * from users where is_public and (handle like $1 or lower(name) like $2)
      order by (handle like $1) desc, handle limit 20`, [q + "%", "%" + q + "%"]
  );
  res.json({ users: rows.map((u) => visible(u, req)) });
}));

// Perfil público + vitrine (relógios públicos ou à venda)
router.get("/:handle", optionalAuth, wrap(async (req, res) => {
  const u = await one("select * from users where handle=$1", [req.params.handle.toLowerCase()]);
  if (!u || !u.is_public) throw new HttpError(404, "Perfil não encontrado.");
  const watches = await query(
    `select id, name, brand, movement, shape, image_url, status, sale_mode, sale_price, condition
       from watches where user_id=$1 and status <> 'wish' and status <> 'gone' and (is_public or sale_mode <> 'none')
      order by (sale_mode <> 'none') desc, sort_order`, [u.id]
  );
  res.json({ user: visible(u, req), watches });
}));

// Editar o próprio perfil
router.patch("/me", requireAuth, wrap(async (req, res) => {
  const f = pick(req.body, ["name", "city", "bio", "avatar_url", "whatsapp", "is_public"]);
  const keys = Object.keys(f);
  if (!keys.length) throw new HttpError(400, "Nada para atualizar.");
  const set = keys.map((k, i) => `${k}=$${i + 2}`).join(", ");
  const u = await one(`update users set ${set}, updated_at=now() where id=$1 returning *`, [req.user.id, ...keys.map(k => f[k])]);
  res.json({ user: { ...publicUser(u), is_admin: Boolean(u.is_admin) } });
}));

// Excluir a própria conta e todos os dados (pede a senha para confirmar)
router.delete("/me", requireAuth, wrap(async (req, res) => {
  need(req.body || {}, ["password"]);
  const u = await one("select password_hash from users where id=$1", [req.user.id]);
  if (!u || !(await bcrypt.compare(String(req.body.password), u.password_hash))) throw new HttpError(401, "Senha incorreta.");
  await query("delete from users where id=$1", [req.user.id]);
  res.status(204).end();
}));

module.exports = router;
