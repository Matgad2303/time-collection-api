-- Liga a proteção de linhas (RLS) nas tabelas que ficaram sem ela.
-- A API entra como dona das tabelas e continua acessando normalmente;
-- isso só fecha o acesso pela chave pública do Supabase.
alter table feedback   enable row level security;
alter table agent_runs enable row level security;
alter table docs       enable row level security;
