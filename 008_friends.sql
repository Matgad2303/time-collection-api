-- Amizade entre colecionadores: um manda o pedido, o outro aceita.
-- Um registro por par (quem pediu → quem recebeu); status 'pending' ou 'accepted'. Recusar/desfazer apaga o registro.
create table if not exists friendships (
  requester uuid not null references users(id) on delete cascade,
  addressee uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index if not exists idx_friendships_addressee on friendships(addressee);
alter table friendships enable row level security;
