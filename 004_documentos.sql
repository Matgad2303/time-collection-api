-- Armazém de documentos do app (mesmo modelo do protótipo no Claude: coleções de documentos JSON)
-- path = coleção (ex.: "data/users/<id>", "public", "cm", "cm/<id>/x", "news", "promo", "hunts", "hres")
-- As regras de quem lê e quem escreve ficam na API (docs.js), nunca no banco.
create table docs (
  path text not null,
  id text not null,
  owner_id uuid references users(id) on delete cascade,  -- quem gravou (nulo = robôs do servidor)
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (path, id)
);
create index docs_path_idx on docs(path, updated_at desc);
create index docs_owner_idx on docs(owner_id);
