-- Relatos de problemas, administradores e controle dos agentes de IA

-- Quem pode ver os relatos e o painel de administração (definido pelo comando npm run tornar-admin)
alter table users add column is_admin boolean not null default false;

-- Relatos enviados pelo app: problemas, ideias, pedidos de ajuda com a conta
create table feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  kind text not null default 'bug' check (kind in ('bug','idea','account','other')),
  message text not null,
  contact text,                           -- e-mail ou WhatsApp de quem não está logado
  page text,                              -- tela onde a pessoa estava
  device text,                            -- navegador/aparelho
  app_version text,
  last_error text,                        -- último erro que o app mostrou
  status text not null default 'new' check (status in ('new','seen','doing','done','wontfix')),
  reply text,                             -- resposta da equipe, aparece para a pessoa
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index feedback_status_idx on feedback(status, created_at desc);
create index feedback_user_idx on feedback(user_id, created_at desc);

-- Caçador: novos estados, origem do pedido e controle de tentativas
alter table hunts drop constraint hunts_status_check;
alter table hunts add constraint hunts_status_check check (status in ('pending','working','done','failed'));
alter table hunts add column source text not null default 'user' check (source in ('user','radar'));
alter table hunts add column attempts integer not null default 0;
alter table hunts add column started_at timestamptz;
alter table hunts add column error text;
create index hunts_pending_idx on hunts(status, created_at) where status in ('pending','working');

-- NEWS FLEX: não gravar a mesma notícia duas vezes na mesma edição
create unique index news_edition_link_idx on news(edition, link);

-- Registro de cada execução de agente (para acompanhar falhas e custo)
create table agent_runs (
  id bigserial primary key,
  agent text not null,                    -- hunt, news
  ref text,                               -- id do pedido ou edição
  status text not null,                   -- ok, error
  detail text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  searches integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index agent_runs_started_idx on agent_runs(started_at desc);
