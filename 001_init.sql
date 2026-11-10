-- Time Collection: estrutura inicial do banco (PostgreSQL puro, sem lógica no banco)
create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  handle text not null unique,           -- o @ da pessoa
  name text not null,
  city text,
  bio text,
  avatar_url text,
  whatsapp text,                          -- contato só por mensagem
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  brand text,
  model_ref text,
  movement text,                          -- automático, quartzo, manual...
  shape text,
  case_material text,
  dial text,
  status text not null default 'collection' check (status in ('collection','on_the_way','wish','gone')),
  wish_tier text,                         -- prioridade no Wish Time
  bought_on date,
  price_paid integer,
  estimate integer,                       -- valor estimado de mercado (R$)
  notes text,
  image_url text,
  is_public boolean not null default true,
  sale_mode text not null default 'none' check (sale_mode in ('none','sale','trade','sale_or_trade')),
  sale_price integer,
  condition text,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index watches_user_idx on watches(user_id);
create index watches_sale_idx on watches(sale_mode) where sale_mode <> 'none';

create table watch_history (
  id bigserial primary key,
  watch_id uuid not null references watches(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create table communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  description text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table community_members (
  community_id uuid not null references communities(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('member','admin')),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  body text not null,
  image_url text,
  created_at timestamptz not null default now()
);
create index posts_comm_idx on posts(community_id, created_at desc);

create table promos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  store text,
  price integer,
  link text not null,
  valid_until date,
  created_at timestamptz not null default now()
);

create table hunts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  query text not null,
  budget integer,
  condition text not null default 'tanto faz',
  status text not null default 'pending' check (status in ('pending','done')),
  summary text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create table hunt_results (
  id bigserial primary key,
  hunt_id uuid not null references hunts(id) on delete cascade,
  title text not null,
  store text,
  price integer,
  was_price integer,
  price_text text,
  condition text,
  shipping text,
  link text not null,
  note text
);

create table radar_brands (
  user_id uuid not null references users(id) on delete cascade,
  brand text not null,
  max_price integer,
  primary key (user_id, brand)
);

create table news (
  id uuid primary key default gen_random_uuid(),
  edition text not null,                  -- ex.: 2026-W46
  title text not null,
  summary text,
  source text,
  link text,
  image_url text,
  is_lead boolean not null default false,
  published_on date,
  created_at timestamptz not null default now()
);
create index news_edition_idx on news(edition);
