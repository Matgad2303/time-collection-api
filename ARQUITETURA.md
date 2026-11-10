# Arquitetura

## Visão geral

```
[time-collection-web]  --HTTPS/JSON-->  [time-collection-api]  --SQL-->  [PostgreSQL]
   React (site/app)                       Node.js + Express                Supabase (só como banco)
   hospedado no Render                    hospedado no Render
```

- **Front e back separados**, em repositórios diferentes. O front só conversa com o banco através da API.
- **Banco PostgreSQL puro.** Nenhuma regra de negócio fica no banco (sem triggers, funções ou políticas do Supabase). O Supabase é usado só como um Postgres gerenciado, então o banco pode ser trocado por qualquer outro Postgres mudando a `DATABASE_URL`.
- **Login com JWT.** O usuário entra com e-mail e senha, recebe um token válido por 30 dias e o envia no cabeçalho `Authorization: Bearer <token>`.

## Arquivos

Todos os arquivos ficam na raiz do repositório (para facilitar o envio pelo site do GitHub).

```
index.js        sobe o servidor, registra as rotas e o tratador de erros
db.js           conexão com o Postgres (pool) e atalhos query/one
http.js         HttpError, wrap (rotas async), need (obrigatórios), pick (campos permitidos)
authlib.js      criação e verificação do token, requireAuth/optionalAuth
auth.js, users.js, watches.js, communities.js, market.js, hunts.js, news.js
                uma rota por área do app
001_init.sql    estrutura do banco; migrações novas seguem a numeração (002_..., 003_...)
migrate.js      aplica as migrações .sql pendentes e registra em schema_migrations
render.yaml     descrição do serviço para o Render
```

## Tabelas

| Tabela | Para que serve |
|---|---|
| users | contas, @, cidade, WhatsApp e se o perfil é público |
| watches | relógios do usuário: coleção, a caminho, Wish Time, saiu; venda/troca |
| watch_history | linha do tempo de cada relógio |
| communities, community_members | comunidades (ex.: Relógios Fortaleza) e quem participa (membro/admin) |
| posts | mural de cada comunidade |
| promos | promoções de lojas compartilhadas (Trades & Deals) |
| hunts, hunt_results | pedidos do caçador sob pedido e os anúncios encontrados |
| radar_brands | marcas que o usuário acompanha e o preço máximo |
| news | notícias do NEWS FLEX, agrupadas por edição semanal |

## Processos automáticos

O caçador sob pedido e o NEWS FLEX são alimentados por processos externos (rotinas agendadas) que gravam direto nas tabelas `hunt_results`/`hunts` e `news`. A API só lê esses dados e registra os pedidos.
