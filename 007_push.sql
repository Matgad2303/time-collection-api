-- Avisos no celular (web push): cada aparelho que aceitou receber o aviso do NEWS FLEX.
-- Guarda só o endereço de entrega do navegador e as chaves dele; nada de conteúdo pessoal.
create table if not exists push_subscriptions (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  topics text[] not null default '{news}',
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists idx_push_subscriptions_user_id on push_subscriptions(user_id);
alter table push_subscriptions enable row level security;
