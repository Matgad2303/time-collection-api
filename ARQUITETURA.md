# Arquitetura

## Visão geral

```
[time-collection-web]  --HTTPS/JSON-->  [time-collection-api]  --SQL-->  [PostgreSQL]
 app original do Claude                  Node.js + Express                Supabase (só como banco)
 + runtime.js (PWA)                      documentos, login, IA, robôs
 Render (site estático)                  Render (web service)
```

- **O front é o próprio app que nasceu no Claude** (mesmas telas, cores, fontes e organização). Ele guarda tudo em "coleções de documentos" JSON, como fazia no Claude. O `runtime.js` do front liga essas chamadas a esta API.
- **A API guarda os documentos, aplica as regras de acesso, faz o login, chama a IA e roda os robôs.** Nenhuma regra fica no banco: o Supabase é usado só como Postgres.
- **Login com JWT.** E-mail e senha, token válido por 30 dias, enviado em `Authorization: Bearer <token>`.

## Arquivos

Todos na raiz do repositório.

```
index.js        sobe o servidor, registra as rotas e o tratador de erros
db.js           conexão com o Postgres (pool) e atalhos query/one
http.js         HttpError, wrap, need, pick, rateLimit
authlib.js      token e requireAuth/optionalAuth
auth.js         criar conta, entrar, quem sou eu, trocar senha
users.js        editar e excluir a própria conta
docs.js         armazém de documentos do app, com as regras de acesso
ia.js           IA do app (o front manda o pedido e recebe o JSON)
ai.js           conexão com o Claude: pesquisa na web (robôs) e respostas em JSON (app)
agents.js       robôs: Caçador, Deixar avisado e NEWS FLEX
feedback.js     relatos de problemas e ideias
admin.js        painel de administração
cli.js          comandos de terminal (relatos, tornar-admin, nova-senha, robôs, testar-ia)
importar.js     importa a coleção exportada do protótipo para uma conta
migrate.js      aplica as migrações .sql pendentes
smoke.js        teste de ponta a ponta (npm run smoke)
001..004_*.sql  estrutura do banco
```

## Banco

| Tabela | Para que serve |
|---|---|
| users | contas: e-mail, senha (hash), @, nome, cidade, WhatsApp, admin |
| docs | todos os dados do app, em coleções de documentos JSON (ver abaixo) |
| feedback | relatos enviados pelo app, com status e resposta da equipe |
| agent_runs | cada uso da IA e dos robôs (sucesso/erro, tokens, pesquisas) |

As tabelas `watches`, `communities`, `posts`, `promos`, `hunts`, `news` e afins (migrações 001 a 003) eram da primeira versão do front e não são mais usadas. Podem ser apagadas numa migração futura.

### Coleções de documentos (`docs.path`)

| Coleção | Quem lê | Quem grava | Conteúdo |
|---|---|---|---|
| `data/users/{id}` | só a pessoa | só a pessoa | relógios (`w..`), pulseiras (`s..`), caixas (`c..`), desejos (`d..`), equipamentos (`k..`), perfil (`profile`) |
| `public/{id}` | todos | a pessoa | perfil público, vitrine e relógios à venda |
| `cm/{id}` | todos | a pessoa | comunidades que criou, convites e entradas |
| `cm/{id}/x/{doc}` | todos | a pessoa | posts e mensagens nas comunidades |
| `promo/{id}` | todos | a pessoa | promoções que divulgou |
| `hunts/{id}` | só a pessoa | a pessoa | pedidos ao Caçador e "Deixar avisado" |
| `hres/{pedido}` | dono do pedido | robôs | anúncios encontrados pelo Caçador |
| `news/{doc}` | todos | robôs | notícias e edições do NEWS FLEX |

O formato de cada documento é o do protótipo (ver `docs/DADOS.md` no pacote do projeto).

## IA e robôs

A IA é o Claude (Anthropic). Sem `ANTHROPIC_API_KEY` o app funciona e as funções de IA mostram "ainda não está ligada".

| Onde | Como |
|---|---|
| App: cadastro por foto, Ateliê, diagnóstico, plano de manutenção, bancada completa, How to do, What If Flexx, No pulso hoje, faixa de preço | o front chama `POST /ia/json` com o pedido (e fotos); limite de `AI_PER_DAY` usos por pessoa por dia (padrão 40) |
| Caçador | a pessoa pesquisa no ECONOMY Time; o pedido entra em `hunts` e o robô procura anúncios reais com link e grava em `hres` (na hora e a cada 2 min) |
| Deixar avisado | o robô confere de 12 em 12 h e avisa UMA vez quando aparece promoção de verdade; depois encerra |
| NEWS FLEX | uma edição por semana (segunda), 8 a 12 notícias; ficam as 8 edições mais recentes |

Regra do produto: nenhum robô procura promoção por conta própria, e nada é vendido dentro do app. Vendas e trocas são pelo WhatsApp; compras, pelos links das lojas.

Para desenvolver sem gastar: `AI_FAKE=true` faz a IA e os robôs devolverem dados de teste.
