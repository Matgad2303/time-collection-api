# Revisão antes do lançamento

Atualizada em 14/11/2026.

## O que mudou nesta versão

O front voltou a ser **o próprio app do Claude**, igual às fotos aprovadas pelo Mateus: Início com o relógio verde e o "No pulso hoje", Coleção (relógios, pulseiras e caixas), Test Time, Wish Time (S, A, B), Bench Time (Bancada com How to do, Ateliê IA e Equipamentos), NEWS FLEX em papel bege, Trades & Deals verde com os selos, ECONOMY Time azul com Caçador e What If Flexx, Explorar por @, Comunidades e Perfil com PDF.

O que era do Claude foi trocado pelo servidor próprio, sem mexer nas telas:
- **Login** com e-mail e senha (antes era a conta do Claude).
- **Banco**: os mesmos documentos do protótipo, agora no PostgreSQL, com as mesmas regras de acesso.
- **IA**: o Claude chamado pelo servidor, com limite diário por pessoa.
- **Robôs**: o Caçador (com "Deixar avisado") e o NEWS FLEX rodam dentro da API.

Ficaram de fora a planilha (o compartilhamento é em PDF, como o Mateus pediu) e o botão de liberar permissões do Claude. Entraram no menu: **Relatar problema ou ideia**, **Administração** (só para admin) e **Sair da conta**.

## Testado

- No navegador (iPhone): criar conta, importar a coleção do Mateus e abrir todas as abas (Início, Coleção, Test, Wish, Bench e as 3 sub-abas, NEWS FLEX, Trades, Economy com What If, Explorar, Comunidades, Perfil, menu e relatos), sem nenhum erro.
- Conta nova começa vazia (ninguém herda a coleção que vinha embutida no protótipo).
- API (`npm run smoke`): contas, troca de senha, documentos, regras de acesso entre duas contas (uma não lê nem altera a coleção da outra), Caçador atendendo um pedido, IA do app, relatos e exclusão de conta. Tudo passou.

**Não testado de verdade:** as respostas da IA, porque ainda não existe a chave da Anthropic. O caminho todo foi testado em modo de teste e a API da Anthropic foi alcançada. Na segunda, com a chave: `npm run testar-ia` e `npm run smoke -- <url> --agentes`.

## Área por área

| Área | Situação |
|---|---|
| Entrar, criar conta, esqueci a senha | ✅ (esqueci a senha vira relato; o admin gera senha provisória) |
| Início (relógio ao vivo, No pulso hoje, atalhos News/Trades/Economy, resumo, chegando) | ✅ (combinar com a roupa precisa da IA) |
| Coleção, pulseiras, caixas, cadastro e edição | ✅ (cadastro por foto precisa da IA) |
| Test Time, Wish Time | ✅ |
| Bench Time: bancada, serviços, How to do, Ateliê, equipamentos | ✅ (Ateliê e passo a passo precisam da IA; os vídeos do How to do funcionam sem ela) |
| NEWS FLEX | ✅ edições importadas; novas edições toda segunda (precisa da IA) |
| Trades & Deals: selos, faixa estimada, WhatsApp | ✅ (faixa estimada automática precisa da IA) |
| ECONOMY Time: Caçador, Deixar avisado, What If Flexx, Promoções da galera | ✅ (Caçador e What If precisam da IA) |
| Explorar, Comunidades (mural, chat, convites), Perfil, PDF | ✅ |
| Relatos e Administração | ✅ |
| App no celular (PWA) | ✅ |

## Para depois

- Separar o `app.js` em componentes (React), com calma, quando o app estiver no ar.
- Fotos hoje ficam dentro dos documentos (até ~200 KB cada, como no protótipo); com muita gente, vale um armazenamento de arquivos.
- Notificação no celular quando o Caçador achar promoção (hoje aparece ao abrir o ECONOMY Time).
- Apagar as tabelas antigas da primeira versão (`watches`, `communities` etc.).
