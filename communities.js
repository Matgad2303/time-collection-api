const router = require("express").Router();
const { query, one } = require("../db");
const { wrap, need, HttpError } = require("../lib/http");
const { requireAuth } = require("../lib/auth");

router.use(requireAuth);

const isMember = (cid, uid) => one("select role from community_members where community_id=$1 and user_id=$2", [cid, uid]);

// Lista: comunidades (filtro ?city=) com contagem de membros e se eu participo
router.get("/", wrap(async (req, res) => {
  const params = [req.user.id];
  let where = "";
  if (req.query.city) { params.push(req.query.city); where = "where lower(c.city)=lower($2)"; }
  const rows = await query(
    `select c.*, (select count(*) from community_members m where m.community_id=c.id)::int as members,
            exists(select 1 from community_members m where m.community_id=c.id and m.user_id=$1) as joined
       from communities c ${where} order by members desc, c.name limit 100`, params);
  res.json({ communities: rows });
}));

// Criar (quem cria vira admin)
router.post("/", wrap(async (req, res) => {
  need(req.body, ["name"]);
  const c = await one(`insert into communities (name, city, description, created_by) values ($1,$2,$3,$4) returning *`,
    [req.body.name.trim(), req.body.city || null, req.body.description || null, req.user.id]);
  await query(`insert into community_members (community_id, user_id, role) values ($1,$2,'admin')`, [c.id, req.user.id]);
  res.status(201).json({ community: c });
}));

router.post("/:id/join", wrap(async (req, res) => {
  await query(`insert into community_members (community_id, user_id) values ($1,$2) on conflict do nothing`, [req.params.id, req.user.id]);
  res.status(204).end();
}));

router.post("/:id/leave", wrap(async (req, res) => {
  await query(`delete from community_members where community_id=$1 and user_id=$2`, [req.params.id, req.user.id]);
  res.status(204).end();
}));

// Mural da comunidade (só membros)
router.get("/:id/posts", wrap(async (req, res) => {
  if (!(await isMember(req.params.id, req.user.id))) throw new HttpError(403, "Entre na comunidade para ver o mural.");
  const posts = await query(
    `select p.*, u.handle, u.name, u.avatar_url from posts p join users u on u.id=p.user_id
      where p.community_id=$1 order by p.created_at desc limit 200`, [req.params.id]);
  res.json({ posts });
}));

router.post("/:id/posts", wrap(async (req, res) => {
  need(req.body, ["body"]);
  if (!(await isMember(req.params.id, req.user.id))) throw new HttpError(403, "Entre na comunidade para postar.");
  const p = await one(`insert into posts (community_id, user_id, body, image_url) values ($1,$2,$3,$4) returning *`,
    [req.params.id, req.user.id, String(req.body.body).slice(0, 4000), req.body.image_url || null]);
  res.status(201).json({ post: p });
}));

router.delete("/:id/posts/:postId", wrap(async (req, res) => {
  const m = await isMember(req.params.id, req.user.id);
  const r = await query(
    `delete from posts where id=$1 and community_id=$2 and (user_id=$3 or $4) returning id`,
    [req.params.postId, req.params.id, req.user.id, m && m.role === "admin"]);
  if (!r.length) throw new HttpError(404, "Post não encontrado.");
  res.status(204).end();
}));

module.exports = router;
