const router = require("express").Router();
const { query, one } = require("../db");
const { wrap, HttpError, pick } = require("../lib/http");
const { requireAuth } = require("../lib/auth");
const { publicUser } = require("./auth");

// Busca de pessoas por @ (por enquanto só por @)
router.get("/", wrap(async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase().replace(/^@/, "");
  if (q.length < 2) return res.json({ users: [] });
  const rows = await query(
    `select * from users where is_public and handle like $1 order by handle limit 20`, [q + "%"]
  );
  res.json({ users: rows.map(publicUser) });
}));

// Perfil público + vitrine (relógios públicos ou à venda)
router.get("/:handle", wrap(async (req, res) => {
  const u = await one("select * from users where handle=$1", [req.params.handle.toLowerCase()]);
  if (!u || !u.is_public) throw new HttpError(404, "Perfil não encontrado.");
  const watches = await query(
    `select id, name, brand, movement, shape, image_url, status, sale_mode, sale_price, condition
       from watches where user_id=$1 and status <> 'wish' and status <> 'gone' and (is_public or sale_mode <> 'none')
      order by (sale_mode <> 'none') desc, sort_order`, [u.id]
  );
  res.json({ user: publicUser(u), watches });
}));

// Editar o próprio perfil
router.patch("/me", requireAuth, wrap(async (req, res) => {
  const f = pick(req.body, ["name", "city", "bio", "avatar_url", "whatsapp", "is_public"]);
  const keys = Object.keys(f);
  if (!keys.length) throw new HttpError(400, "Nada para atualizar.");
  const set = keys.map((k, i) => `${k}=$${i + 2}`).join(", ");
  const u = await one(`update users set ${set}, updated_at=now() where id=$1 returning *`, [req.user.id, ...keys.map(k => f[k])]);
  res.json({ user: publicUser(u) });
}));

module.exports = router;
