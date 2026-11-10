# Time Collection — API

Back-end do Time Collection, o app para o universo da relojoaria: coleção, Wish Time, comunidades por cidade, Trades & Deals, ECONOMY Time (caçador sob pedido e radar de marcas) e NEWS FLEX.

Stack: Node.js 20+, Express, PostgreSQL puro (sem lógica no banco), login com JWT.

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

## Publicar no Render

O arquivo `render.yaml` já descreve o serviço. No Render: New > Blueprint > escolha este repositório. Preencha `DATABASE_URL` (do Supabase) e `CORS_ORIGIN` (endereço do site). O `JWT_SECRET` é gerado sozinho, e as migrações rodam a cada deploy.

## Documentação

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md): como o sistema é organizado
- [docs/FUNCIONALIDADES.md](docs/FUNCIONALIDADES.md): o que o app faz e quais rotas atendem cada parte
- [docs/PADROES.md](docs/PADROES.md): regras de código para quem for mexer
