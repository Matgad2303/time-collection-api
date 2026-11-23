# Desempenho da API (time-collection-api)

Limpa interna de 23/11/2026, branch `perf/limpa-23-11`. Regra: mesmas rotas, mesmas respostas, mesmas regras de acesso, nada nos dados.

## Onde o tempo vai

- A API roda no Render grátis na **Virgínia (EUA)**; o banco está no Supabase em **São Paulo**. Cada ida ao banco atravessa o continente.
- Medido em 23/11 com a API acordada: `/health` seguido = **0,30 s**; `/health` depois de 10–15 s parada = **0,5 a 1,25 s**. A diferença é a reconexão com o banco: o `pg.Pool` fechava a conexão parada depois de 10 s (padrão).
- O banco em si é rápido: a consulta da coleção (`docs` por `path`, 134 linhas) leva **0,2 ms** (`EXPLAIN ANALYZE`). Os índices já cobrem as consultas (`docs_pkey (path, id)` e `docs_path_idx (path, updated_at desc)`). Nenhum índice novo foi criado.
- As respostas já saem comprimidas (brotli) pela borda do Render e já têm ETag (padrão do Express).

## O que foi feito

| Mudança | Arquivo | Efeito |
|---|---|---|
| Conexão parada vive 5 min (antes 10 s) e `keepAlive` ligado | `db.js` | Toque depois de uma pausa não paga mais a reconexão São Paulo ↔ Virgínia (esperado: ~0,3 s em vez de até 1,25 s; conferir depois do deploy). |
| Conexão aberta logo na partida | `index.js` | A primeira tela depois de a API acordar já encontra o banco conectado. |
| Queda de conexão parada não derruba a API | `db.js` (`pool.on("error")`) | Antes, sem esse tratador, uma conexão parada que caísse derrubava o processo. Agora só registra e reconecta. |

## O que não foi feito (e por quê)

- `compression` no Express: o Render já entrega com brotli. Seria trabalho dobrado.
- Cache em memória do News Flex e perfis públicos: o banco responde em 0,2 ms e o ETag já evita reenvio; o ganho seria pequeno e a notícia nova poderia aparecer com atraso.
- Carregar módulos pesados (IA, push) só quando usados: ganharia ~0,2–0,5 s em cima de 30–50 s de acordar a máquina grátis, com risco de quebrar rotas.
- Mudar a região: o Render não tem São Paulo. Juntar API e banco no mesmo lugar só com mudança de serviço.

## Manter a API acordada (proposta, NÃO ligada)

- Render grátis: 750 horas por mês por workspace; a API é o único serviço grátis que conta (o site estático não conta).
- 24 h por dia = 720–744 h/mês: cabe, mas no limite. Das 7h às 24h de Fortaleza = cerca de 527 h/mês: folga boa.
- Como: GitHub Actions (repositório público = minutos grátis) chamando `/health` a cada 10 min nesse horário.
- Ganho: some a espera de 30–50 s de "dando corda…" na primeira abertura depois de 15 min parado.
- Custo: R$ 0. Ligar só com o "ok" do Mateus.
