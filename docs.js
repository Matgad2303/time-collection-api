// Armazém de documentos do app. O front (o app do protótipo) lê e grava coleções de documentos JSON,
// como fazia no Claude. Aqui ficam as regras de acesso, iguais às do protótipo:
//   data/users/{eu}   minha coleção (relógios, pulseiras, caixas, desejos, equipamentos, perfil): só eu
//   public/{eu}       meu perfil público e vitrine: todos leem, só eu gravo
//   cm/{eu}           minhas comunidades, convites e entradas: todos leem, só eu gravo
//   cm/{eu}/x/{id}    meus posts e mensagens nas comunidades: todos leem, só eu gravo
//   promo/{eu}        promoções que compartilhei: todos leem, só eu gravo
//   hunts/{eu}        meus pedidos ao Caçador e "Deixar avisado": só eu
//   hres/{id}         resultados do Caçador (gravados pelo robô): cada um lê os seus
//   news, deals       NEWS FLEX e radar antigo (gravados pelo robô): todos leem
const router = require("express").Router();
const { query, one } = require("./db");
const { wrap, HttpError } = require("./http");
const { requireAuth } = require("./authlib");
const { kickHunts } = require("./agents");

router.use(requireAuth);

// Diz se "eu" posso ler a coleção e gravar o documento id
function rules(path, me, id) {
  const p = String(path || "");
  let m;
  if ((m = /^data\/users\/([\w-]+)$/.exec(p))) return { read: m[1] === me, write: m[1] === me };
  if (["public", "cm", "promo"].includes(p)) return { read: true, write: id === undefined || id === me };
  if ((m = /^cm\/([\w-]+)\/x$/.exec(p))) return { read: true, write: m[1] === me };
  if (p === "hunts") return { read: id === me, write: id === me, own: true };
  if (p === "hres") return { read: true, write: false, mineOnly: true };
  if (p === "news" || p === "deals") return { read: true, write: false };
  return { read: false, write: false };
}

const ID = /^[\w.\-]{1,120}$/;
const out = (r) => ({ id: r.id, data: r.data });

// Lista uma coleção (opcional: ?where=campo&eq=valor e ?limit=)
router.get("/", wrap(async (req, res) => {
  const { path } = req.query;
  const me = req.user.id;
  const r = rules(path, me);
  if (r.own) {
    const d = await one("select id, data from docs where path=$1 and id=$2", [path, me]);
    return res.json({ docs: d ? [out(d)] : [] });
  }
  if (!r.read) throw new HttpError(403, "Sem acesso a esta área.");
  const limit = Math.min(Number(req.query.limit) || 500, 1000);
  const params = [path];
  let where = "path=$1";
  if (r.mineOnly) { params.push(me); where += ` and data->>'uid' = $${params.length}`; }
  if (req.query.where) {
    if (!/^\w{1,40}$/.test(req.query.where)) throw new HttpError(400, "Filtro inválido.");
    params.push(String(req.query.eq ?? ""));
    where += ` and data->>'${req.query.where}' = $${params.length}`;
  }
  params.push(limit);
  const rows = await query(`select id, data from docs where ${where} order by updated_at desc limit $${params.length}`, params);
  res.json({ docs: rows.map(out) });
}));

// Um documento
router.get("/item", wrap(async (req, res) => {
  const { path, id } = req.query;
  const r = rules(path, req.user.id, id);
  if (!r.read) throw new HttpError(403, "Sem acesso a este documento.");
  const d = await one("select id, data from docs where path=$1 and id=$2", [path, id]);
  if (d && r.mineOnly && d.data.uid !== req.user.id) throw new HttpError(403, "Sem acesso a este documento.");
  res.json({ doc: d ? out(d) : null });
}));

// Gravar (substitui o documento inteiro, como o set() do protótipo)
router.put("/item", wrap(async (req, res) => {
  const { path, id, data } = req.body || {};
  if (!ID.test(String(id || ""))) throw new HttpError(400, "Documento inválido.");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new HttpError(400, "Conteúdo inválido.");
  if (!rules(path, req.user.id, id).write) throw new HttpError(403, "Você não pode alterar este documento.");
  await query(
    `insert into docs (path, id, owner_id, data) values ($1,$2,$3,$4)
     on conflict (path, id) do update set data=excluded.data, owner_id=excluded.owner_id, updated_at=now()`,
    [path, id, req.user.id, data]);
  // Pedido novo ao Caçador ou "Deixar avisado": o robô começa na hora
  if (path === "hunts") kickHunts();
  res.status(204).end();
}));

router.delete("/item", wrap(async (req, res) => {
  const { path, id } = req.query;
  if (!rules(path, req.user.id, id).write) throw new HttpError(403, "Você não pode apagar este documento.");
  await query("delete from docs where path=$1 and id=$2", [path, id]);
  res.status(204).end();
}));

module.exports = { router, rules };
