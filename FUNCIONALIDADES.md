# Funcionalidades (rotas da API)

Todas as respostas são JSON. Erros vêm como `{ "error": "mensagem em português" }`.
🔒 = precisa de login (`Authorization: Bearer <token>`).

As telas do app (Início, Coleção, Test Time, Wish Time, Bench Time, NEWS FLEX, Trades & Deals, ECONOMY Time, Explorar, Comunidades, Perfil) estão descritas no README do `time-collection-web`. Elas usam as rotas abaixo.

## Conta

| Método | Rota | O que faz |
|---|---|---|
| POST | /auth/register | cria conta (email, password, handle, name, city) e devolve token |
| POST | /auth/login | entra com email e senha e devolve token |
| GET | /auth/me 🔒 | dados da conta (inclui `is_admin`) |
| POST | /auth/password 🔒 | troca a senha (current_password, new_password) |
| PATCH | /users/me 🔒 | edita nome, cidade, bio, foto, WhatsApp |
| DELETE | /users/me 🔒 | exclui a conta e todos os documentos dela (pede `password`) |

Limites: login até 20 tentativas a cada 15 min por IP; cadastro até 10 por hora por IP (acima disso, 429).

## Documentos do app 🔒

| Método | Rota | O que faz |
|---|---|---|
| GET | /docs?path=&limit=&where=&eq= | lista uma coleção (opcional: filtro por um campo) |
| GET | /docs/item?path=&id= | lê um documento |
| PUT | /docs/item | grava um documento inteiro (`path`, `id`, `data`) |
| DELETE | /docs/item?path=&id= | apaga um documento |

Quem pode ler e gravar cada coleção está em `ARQUITETURA.md`. Gravar em `hunts` acorda o Caçador na hora.

## IA do app 🔒

| Método | Rota | O que faz |
|---|---|---|
| GET | /ia/limits | se a IA está ligada, se aceita fotos e o limite diário |
| POST | /ia/json | `prompt`, `images` (data URLs, até 8) e `tier` (quick, default, complex); devolve `{ data }` com o JSON da resposta |

## Relatos

| Método | Rota | O que faz |
|---|---|---|
| POST | /feedback | envia relato: kind (bug, idea, account, other), message, contact (obrigatório sem login), page, device, app_version, last_error |
| GET | /feedback/mine 🔒 | meus relatos, com status e resposta da equipe |

## Administração 🔒 (só contas admin)

| Método | Rota | O que faz |
|---|---|---|
| GET | /admin/overview | números do app, relatos, pedidos do Caçador, situação e custo da IA |
| GET | /admin/feedback | relatos (`?status=open` para os em aberto) |
| PATCH | /admin/feedback/:id | muda status e/ou responde |
| POST | /admin/reset-password | senha provisória para um e-mail |
| GET | /admin/agent-runs | últimas execuções da IA e dos robôs |
| POST | /admin/agents/hunts | atende agora os pedidos do Caçador |
| POST | /admin/agents/news | gera agora a edição da semana do NEWS FLEX |

## Saúde

`GET /health` → `{ ok, db, ai }`.
