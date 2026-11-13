# Funcionalidades

Todas as respostas são JSON. Erros vêm como `{ "error": "mensagem em português" }`.
🔒 = precisa de login (`Authorization: Bearer <token>`).

## Conta

| Método | Rota | O que faz |
|---|---|---|
| POST | /auth/register | cria conta (email, password, handle, name, city) e devolve token |
| POST | /auth/login | entra com email e senha e devolve token |
| GET | /auth/me 🔒 | dados da conta logada (inclui `is_admin`) |
| POST | /auth/password 🔒 | troca a senha (current_password, new_password) |

## Perfis e busca de pessoas

| Método | Rota | O que faz |
|---|---|---|
| GET | /users?q=mat | busca pessoas pelo @ ou pelo nome (só perfis públicos) |
| GET | /users/:handle | perfil público e vitrine (relógios públicos ou à venda) |
| PATCH | /users/me 🔒 | edita nome, cidade, bio, foto, WhatsApp, perfil público |
| DELETE | /users/me 🔒 | exclui a conta e todos os dados (pede `password`) |

O contato entre colecionadores é pelo botão de WhatsApp, montado no front com o campo `whatsapp`. O WhatsApp só vem preenchido para quem está logado (em perfis, busca e Trades); para visitantes vem `null`.

## Coleção e Wish Time 🔒

| Método | Rota | O que faz |
|---|---|---|
| GET | /watches | meus relógios (`?status=wish` para o Wish Time) |
| POST | /watches | adiciona relógio (se já entrar à venda ou recebendo propostas, pede o preço médio) |
| GET | /watches/:id | detalhes e linha do tempo |
| PATCH | /watches/:id | edita; mudanças de status e de situação no Trades & Deals entram na linha do tempo |
| POST | /watches/:id/price-check | recalcula o preço médio de mercado (até 10 por dia) |
| DELETE | /watches/:id | remove |

Status: `collection` (na coleção), `on_the_way` (a caminho), `wish` (Wish Time), `gone` (saiu).
Trades & Deals: `sale_mode` = `none` (inegociável), `sale` (à venda) ou `offers` (recebendo propostas), mais `accepts_trade` (aceita troca), `sale_price` e `condition`.
Ao colocar à venda ou recebendo propostas, o agente calcula o preço médio de mercado (`market_status`, `market_price`, `market_min`, `market_max`, `market_confidence`, `market_note`, `market_sources`). Se estiver à venda sem preço, o anúncio já sai com o preço médio. Marcar como `gone` (saiu) um relógio que estava à venda registra "Vendido / negociado" e volta para inegociável.

## Comunidades 🔒

| Método | Rota | O que faz |
|---|---|---|
| GET | /communities | lista (`?city=Fortaleza`), com nº de membros e se participo |
| POST | /communities | cria; quem cria vira admin |
| GET | /communities/:id | detalhe, nº de membros e meu papel (`my_role`: member, admin ou null) |
| POST | /communities/:id/join | entra |
| POST | /communities/:id/leave | sai |
| GET | /communities/:id/posts | mural (só membros) |
| POST | /communities/:id/posts | posta no mural |
| DELETE | /communities/:id/posts/:postId | apaga (autor ou admin) |

## Trades & Deals

| Método | Rota | O que faz |
|---|---|---|
| GET | /market/mine 🔒 | meus relógios (comigo ou a caminho) com situação e preço médio |
| GET | /market/for-you 🔒 | indicações de outros colecionadores: Wish Time, radar, marcas que coleciono e minha cidade, com o motivo (`reason`) |
| GET | /market/listings | anúncios de perfis públicos (`?brand=` marca ou modelo, `?max=`, `?mode=sale|offers`, `?trade=1`) |
| GET | /market/promos | promoções válidas compartilhadas |
| POST | /market/promos 🔒 | compartilha promoção (title, link https, store, price, valid_until) |
| DELETE | /market/promos/:id 🔒 | remove a própria promoção |

## ECONOMY Time 🔒

| Método | Rota | O que faz |
|---|---|---|
| GET | /hunts | meus pedidos com os anúncios encontrados, `ai_enabled` e `limit_per_day` |
| POST | /hunts | novo pedido (query, budget, condition: novo/usado/tanto faz); o caçador começa na hora |
| POST | /hunts/:id/retry | tenta de novo um pedido que falhou |
| DELETE | /hunts/:id | apaga pedido |
| GET | /hunts/radar | marcas do radar |
| PUT | /hunts/radar | substitui as marcas do radar (`brands: [{brand, max_price}]`) |

Status do pedido: `pending` (na fila), `working` (buscando), `done` (pronto), `failed` (falhou 3 vezes).
Origem: `user` (pedido da pessoa) ou `radar` (criado toda semana a partir do radar de marcas).
Limites: até `HUNTS_PER_DAY` pedidos por pessoa por dia (padrão 5) e no máximo 3 em andamento.

## NEWS FLEX

| Método | Rota | O que faz |
|---|---|---|
| GET | /news | notícias da edição mais recente (`?edition=2026-W46` para outra) e lista de edições |

## Relatos (problemas, ideias, ajuda com a conta)

| Método | Rota | O que faz |
|---|---|---|
| POST | /feedback | envia relato: kind (bug, idea, account, other), message, contact (obrigatório sem login), page, device, app_version, last_error |
| GET | /feedback/mine 🔒 | meus relatos, com status e resposta da equipe |

Status: `new` (recebido), `seen` (visto), `doing` (em andamento), `done` (resolvido), `wontfix` (não vamos fazer agora).

## Administração 🔒 (só contas com is_admin)

| Método | Rota | O que faz |
|---|---|---|
| GET | /admin/overview | números do app, relatos por status, buscas por status, situação e custo dos agentes |
| GET | /admin/feedback | relatos (`?status=open` para os em aberto, ou um status) |
| PATCH | /admin/feedback/:id | muda status e/ou responde (status, reply) |
| POST | /admin/reset-password | gera senha provisória para um e-mail |
| GET | /admin/agent-runs | últimas execuções dos agentes |
| POST | /admin/agents/hunts | processa agora as buscas pendentes |
| POST | /admin/agents/news | gera agora a edição da semana (`force: true` gera mesmo se já existir) |
| POST | /admin/hunts/:id/retry | recoloca na fila uma busca que falhou |

## Limites

Login: até 20 tentativas a cada 15 minutos por IP. Cadastro: até 10 por hora por IP. Acima disso a API responde 429.

## Saúde

`GET /health` responde `{ ok: true, db: true, ai: true|false }` quando a API e o banco estão no ar (`ai` diz se os agentes estão ligados).
