# Time Collection — API

Back-end do Time Collection, o app para o universo da relojoaria: coleção, Wish Time, comunidades por cidade, Trades & Deals, ECONOMY Time (caçador sob pedido e radar de marcas) e NEWS FLEX.

Stack: Node.js 20+, Express, PostgreSQL puro (sem lógica no banco), login com JWT, agentes de IA com o Claude (Anthropic).

## Rodar no computador

1. Instale o Node.js 20 ou mais novo.
2. Copie `.env.example` para `.env` e preencha `DATABASE_URL` e `JWT_SECRET`.
3. Rode:

```
npm install
npm run migrate
npm run dev
```

A API sobe em `http://localhost:3001`. Teste em `http://localhost:3001/health`.

Para testar todas as rotas de uma vez: `npm run smoke` (ou `npm run smoke -- https://endereco-da-api`). O teste cria um usuário com e-mail aleatório.

## Publicar

Passo a passo completo (banco, API, site e app): [DEPLOY.md](DEPLOY.md).

## Documentação

- [ARQUITETURA.md](ARQUITETURA.md): como o sistema é organizado
- [FUNCIONALIDADES.md](FUNCIONALIDADES.md): o que o app faz e quais rotas atendem cada parte
- [PADROES.md](PADROES.md): regras de código para quem for mexer
- [DEPLOY.md](DEPLOY.md): como colocar tudo no ar
- [REVISAO.md](REVISAO.md): revisão área por área antes do lançamento e o que fica para depois

## Comandos úteis

| Comando | Para quê |
|---|---|
| `npm run relatos` | lista os relatos em aberto (para ler ou colar numa conversa com o Claude) |
| `npm run tornar-admin -- email` | dá acesso ao painel de administração |
| `npm run nova-senha -- email` | senha provisória para quem esqueceu |
| `npm run testar-ia` | uma busca real do caçador, sem gravar, mostrando o custo |
| `npm run agente:cacador` / `npm run agente:news` | roda os agentes na hora |
