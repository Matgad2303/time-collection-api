# Funcionalidades

Todas as respostas são JSON. Erros vêm como `{ "error": "mensagem em português" }`.
🔒 = precisa de login (`Authorization: Bearer <token>`).

## Conta

| Método | Rota | O que faz |
|---|---|---|
| POST | /auth/register | cria conta (email, password, handle, name, city) e devolve token |
| POST | /auth/login | entra com email e senha e devolve token |
| GET | /auth/me 🔒 | dados da conta logada |

## Perfis e busca de pessoas

| Método | Rota | O que faz |
|---|---|---|
| GET | /users?q=mat | busca pessoas pelo @ (só perfis públicos) |
| GET | /users/:handle | perfil público e vitrine (relógios públicos ou à venda) |
| PATCH | /users/me 🔒 | edita nome, cidade, bio, foto, WhatsApp, perfil público |

O contato entre colecionadores é pelo botão de WhatsApp, montado no front com o campo `whatsapp`.

## Coleção e Wish Time 🔒

| Método | Rota | O que faz |
|---|---|---|
| GET | /watches | meus relógios (`?status=wish` para o Wish Time) |
| POST | /watches | adiciona relógio |
| GET | /watches/:id | detalhes e linha do tempo |
| PATCH | /watches/:id | edita; mudança de status entra na linha do tempo |
| DELETE | /watches/:id | remove |

Status: `collection` (na coleção), `on_the_way` (a caminho), `wish` (Wish Time), `gone` (saiu).
Venda: `sale_mode` = `none`, `sale`, `trade` ou `sale_or_trade`, com `sale_price` e `condition`.

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
| GET | /market/listings | relógios à venda/troca de perfis públicos (`?brand=`, `?max=`) |
| GET | /market/promos | promoções válidas compartilhadas |
| POST | /market/promos 🔒 | compartilha promoção (title, link https, store, price, valid_until) |
| DELETE | /market/promos/:id 🔒 | remove a própria promoção |

## ECONOMY Time 🔒

| Método | Rota | O que faz |
|---|---|---|
| GET | /hunts | meus pedidos de busca, com os anúncios encontrados |
| POST | /hunts | novo pedido (query, budget, condition: novo/usado/tanto faz) |
| DELETE | /hunts/:id | apaga pedido |
| GET | /hunts/radar | marcas do radar |
| PUT | /hunts/radar | substitui as marcas do radar (`brands: [{brand, max_price}]`) |

## NEWS FLEX

| Método | Rota | O que faz |
|---|---|---|
| GET | /news | notícias da edição mais recente (`?edition=2026-W46` para outra) e lista de edições |

## Limites

Login: até 20 tentativas a cada 15 minutos por IP. Cadastro: até 10 por hora por IP. Acima disso a API responde 429.

## Saúde

`GET /health` responde `{ ok: true, db: true }` quando a API e o banco estão no ar.
