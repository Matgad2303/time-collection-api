-- Índices de chaves estrangeiras criados direto no banco em 17/11/2026 (outra sessão do Claude,
-- migração "indices_chaves_estrangeiras" no Supabase). Ficam aqui para um banco novo nascer igual.
-- "if not exists": no banco atual, que já tem esses índices, nada muda.
create index if not exists idx_communities_created_by     on communities(created_by);
create index if not exists idx_community_members_user_id  on community_members(user_id);
create index if not exists idx_docs_path                  on docs(path);
create index if not exists idx_hunt_results_hunt_id       on hunt_results(hunt_id);
create index if not exists idx_hunts_user_id              on hunts(user_id);
create index if not exists idx_posts_user_id              on posts(user_id);
create index if not exists idx_promos_user_id             on promos(user_id);
create index if not exists idx_watch_history_watch_id     on watch_history(watch_id);
