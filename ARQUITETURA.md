# Arquitetura

## Visão geral

```
[time-collection-web]  --HTTPS/JSON-->  [time-collection-api]  --SQL-->  [PostgreSQL]
   React (site/app PWA)                   Node.js + Express                Supabase (só como banco)
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
auth.js, users.js, watches.js, communities.js, market.js, hunts.js, news.js,
feedback.js, admin.js
                uma rota por área do app
ai.js           conexão com o Claude: pesquisa na web e entrega o resultado num formato fixo
agents.js       agentes de IA (Caçador, Radar, NEWS FLEX) e o agendador que roda dentro da API
cli.js          comandos de terminal (relatos, tornar-admin, nova-senha, agentes, testar-ia)
001_init.sql    estrutura do banco; migrações novas seguem a numeração (002_..., 003_...)
migrate.js      aplica as migrações .sql pendentes e registra em schema_migrations
render.yaml     descrição do serviço para o Render
smoke.js        teste de ponta a ponta das rotas (npm run smoke)
.env.example    modelo das variáveis de ambiente
```

## Tabelas

| Tabela | Para que serve |
|---|---|
| users | contas, @, cidade, WhatsApp e se o perfil é público |
| watches | relógios do usuário: coleção, a caminho, Wish Time, saiu; situação no Trades & Deals e preço médio de mercado |
| watch_history | linha do tempo de cada relógio |
| communities, community_members | comunidades (ex.: Relógios Fortaleza) e quem participa (membro/admin) |
| posts | mural de cada comunidade |
| promos | promoções de lojas compartilhadas (Trades & Deals) |
| hunts, hunt_results | pedidos do caçador sob pedido e os anúncios encontrados |
| radar_brands | marcas que o usuário acompanha e o preço máximo |
| news | notícias do NEWS FLEX, agrupadas por edição semanal |
| feedback | relatos enviados pelo app, com status e resposta da equipe |
| agent_runs | cada execução dos agentes de IA (sucesso/erro, tokens, pesquisas) |

## Agentes de IA

Rodam dentro da própria API (`agents.js`), sem serviço extra, e usam o Claude (Anthropic) com pesquisa na web. Ficam desligados enquanto `ANTHROPIC_API_KEY` não estiver configurada; o resto do app funciona normalmente.

| Agente | Quando roda | O que faz |
|---|---|---|
| Caçador sob pedido | na hora em que a pessoa pede, e a cada 2 min para pendentes | pesquisa anúncios reais no Brasil e grava em `hunt_results` |
| Radar de marcas | conferido a cada 6 h e quando a API acorda; 1 vez por semana por pessoa | cria um pedido do caçador (`source = radar`) com as marcas do radar |
| NEWS FLEX | conferido a cada 6 h e quando a API acorda; 1 vez por semana | monta a edição da semana (5 a 10 notícias) em `news` |
| Preço médio | na hora em que um relógio vai para à venda/recebendo propostas, ou quando a pessoa pede | pesquisa anúncios do mesmo modelo e grava o preço médio em `watches.market_*` (com 3+ anúncios, usa a média deles) |

Como cada agente funciona: o Claude pesquisa (`web_search`) e lê páginas (`web_fetch`), e termina chamando uma ferramenta "entregar" com esquema estrito. O código valida os links (só http/https) e grava. Se der erro, o pedido volta para a fila e tenta até 3 vezes; depois fica `failed` e a pessoa pode tentar de novo. Pedidos presos em `working` por mais de 20 min voltam para a fila sozinhos. Cada execução fica em `agent_runs`, visível no painel de administração.

Para desenvolver sem gastar: `AI_FAKE=true` faz os agentes devolverem dados fictícios.

No plano gratuito do Render a API "dorme" sem uso; os agentes rodam quando ela está acordada. Como pedir uma busca acorda a API, o caçador funciona normalmente; o NEWS FLEX sai na primeira vez que alguém abrir o app na semana.

## Relatos

Qualquer pessoa, com ou sem login, envia relatos pelo app (ícone de bandeira no topo, links "Relatar" nas mensagens de erro, "Esqueci minha senha" na tela de entrar). O app anexa a tela, o aparelho, a versão e o último erro, e a pessoa vê tudo antes de enviar. A equipe lê e responde no painel `/admin` (ou com `npm run relatos` no terminal), e a resposta aparece para a pessoa em "Meus relatos".
