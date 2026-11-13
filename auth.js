const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { query, one } = require("./db");
const { wrap, need, HttpError } = require("./http");
const { signToken, requireAuth } = require("./authlib");

const HANDLE = /^[a-z0-9_.]{3,30}$/;
const publicUser = (u) => ({
  id: u.id, handle: u.handle, name: u.name, city: u.city, bio: u.bio,
  avatar_url: u.avatar_url, whatsapp: u.whatsapp, is_public: u.is_public, created_at: u.created_at,
});

// Dados da própria conta: os públicos + se é administrador
const ownUser = (u) => ({ ...publicUser(u), is_admin: Boolean(u.is_admin) });

// Cadastro
router.post("/register", wrap(async (req, res) => {
  need(req.body, ["email", "password", "handle", "name"]);
  const email = String(req.body.email).trim().toLowerCase();
  const handle = String(req.body.handle).trim().toLowerCase().replace(/^@/, "");
  if (!HANDLE.test(handle)) throw new HttpError(400, "O @ deve ter de 3 a 30 letras minúsculas, números, ponto ou _.");
  if (String(req.body.password).length < 8) throw new HttpError(400, "A senha precisa ter pelo menos 8 caracteres.");
  if (await one("select 1 from users where email=$1", [email])) throw new HttpError(409, "Este e-mail já tem conta.");
  if (await one("select 1 from users where handle=$1", [handle])) throw new HttpError(409, "Este @ já está em uso.");
  const hash = await bcrypt.hash(String(req.body.password), 10);
  const u = await one(
    `insert into users (email, password_hash, handle, name, city) values ($1,$2,$3,$4,$5) returning *`,
    [email, hash, handle, String(req.body.name).trim(), req.body.city || null]
  );
  res.status(201).json({ token: signToken(u), user: ownUser(u) });
}));

// Login
router.post("/login", wrap(async (req, res) => {
  need(req.body, ["email", "password"]);
  const u = await one("select * from users where email=$1", [String(req.body.email).trim().toLowerCase()]);
  if (!u || !(await bcrypt.compare(String(req.body.password), u.password_hash))) {
    throw new HttpError(401, "E-mail ou senha incorretos.");
  }
  res.json({ token: signToken(u), user: ownUser(u) });
}));

// Quem sou eu
router.get("/me", requireAuth, wrap(async (req, res) => {
  const u = await one("select * from users where id=$1", [req.user.id]);
  if (!u) throw new HttpError(404, "Conta não encontrada.");
  res.json({ user: ownUser(u) });
}));

// Trocar a senha (pede a atual)
router.post("/password", requireAuth, wrap(async (req, res) => {
  need(req.body, ["current_password", "new_password"]);
  if (String(req.body.new_password).length < 8) throw new HttpError(400, "A nova senha precisa ter pelo menos 8 caracteres.");
  const u = await one("select * from users where id=$1", [req.user.id]);
  if (!u || !(await bcrypt.compare(String(req.body.current_password), u.password_hash))) {
    throw new HttpError(401, "Senha atual incorreta.");
  }
  await query("update users set password_hash=$2, updated_at=now() where id=$1", [u.id, await bcrypt.hash(String(req.body.new_password), 10)]);
  res.status(204).end();
}));

module.exports = { router, publicUser, ownUser };
