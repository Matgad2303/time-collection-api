// NEWS FLEX: edições semanais de notícias (gravadas por um processo automático)
const router = require("express").Router();
const { query } = require("./db");
const { wrap } = require("./http");

router.get("/", wrap(async (req, res) => {
  const edition = req.query.edition || null;
  const rows = edition
    ? await query("select * from news where edition=$1 order by is_lead desc, published_on desc", [edition])
    : await query("select * from news where edition = (select max(edition) from news) order by is_lead desc, published_on desc");
  const editions = await query("select distinct edition from news order by edition desc limit 20");
  res.json({ news: rows, editions: editions.map(e => e.edition) });
}));

module.exports = router;
