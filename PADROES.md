# Padrões de código

- **Linguagem:** JavaScript (CommonJS), Node 20+. Sem TypeScript por enquanto.
- **Uma rota por área**, num arquivo próprio na raiz (ex.: `watches.js`). Rotas novas são registradas em `index.js`.
- **Rotas async sempre com `wrap(...)`**, para que qualquer erro chegue ao tratador central.
- **Erros esperados com `HttpError(status, mensagem)`.** A mensagem vai para o usuário, então escreva em português claro. Erros 500 nunca mostram detalhes ao usuário; eles vão para o log.
- **Nunca grave campos vindos direto do corpo da requisição.** Use `pick(req.body, CAMPOS_PERMITIDOS)`.
- **SQL sempre com parâmetros (`$1, $2...`)**, nunca concatenando valores do usuário. Os únicos nomes de coluna montados dinamicamente vêm de listas fixas de campos permitidos.
- **Dados do usuário sempre filtrados por `user_id = req.user.id`** nas rotas de escrita.
- **Banco:** nada de triggers, funções ou políticas no banco. Mudanças de estrutura só por um novo arquivo .sql na raiz com o número seguinte (`002_...sql`). Nunca edite uma migração que já rodou.
- **Nomes:** tabelas e colunas em inglês, `snake_case`; textos para o usuário em português.
- **Segredos** só em variáveis de ambiente (`.env` local, painel do Render em produção). O `.env` nunca vai para o GitHub.
- **Documentação:** toda rota nova ou alterada entra em `FUNCIONALIDADES.md` no mesmo commit.
