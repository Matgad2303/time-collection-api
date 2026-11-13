# Revisão antes do lançamento

Revisão completa feita em 13/11/2026, área por área, com a API rodando num Postgres e o site aberto num navegador simulando um iPhone. Os testes automáticos (`npm run smoke` na API e o roteiro no navegador) passaram em tudo, sem nenhum erro no console.

**O que não deu para testar aqui:** a busca real dos agentes de IA, porque ainda não existe uma chave da Anthropic. O caminho completo foi testado em modo de teste (`AI_FAKE`), e a chamada real chegou até a API da Anthropic (respondeu "chave inválida", como esperado com uma chave falsa). Na segunda, com a chave, rodem `npm run testar-ia` e `npm run smoke -- <url> --agentes` (passo 7 do [DEPLOY.md](DEPLOY.md)).

## Achados importantes desta revisão

1. **Os agentes de IA não existiam.** O Caçador e o NEWS FLEX só gravavam o pedido e esperavam um "processo externo" que nunca foi escrito; os pedidos ficariam em "Buscando…" para sempre. Agora existem (`agents.js`), rodam dentro da API e usam o Claude com pesquisa na web.
2. **O Radar de marcas não fazia nada.** As marcas eram salvas, mas nada as usava. Agora, uma vez por semana, o caçador procura oportunidades dessas marcas para cada pessoa.
3. **Quem esquecesse a senha ficava sem saída.** Agora há "Esqueci minha senha" (vira um relato para a equipe) e o painel gera uma senha provisória. Também dá para trocar a senha e excluir a conta.
4. **Não havia como relatar problemas.** Agora há uma área completa de relatos (detalhes abaixo).
5. **O WhatsApp de todo mundo ficava visível para qualquer visitante**, inclusive robôs. Agora só aparece para quem está logado.

## Área por área

| Área | Situação | O que foi conferido |
|---|---|---|
| Cadastro e login | ✅ pronto | cadastro, @ repetido, e-mail repetido, senha curta, login errado, limite de tentativas, sessão de 30 dias |
| Conta | ✅ pronto | editar perfil e WhatsApp, perfil público/privado, trocar senha, excluir conta (apaga tudo), esqueci a senha |
| Coleção | ✅ pronto | adicionar, editar, remover, abas (coleção, a caminho, Wish Time, saíram), valor estimado total, dados inválidos dão mensagem clara |
| Wish Time | ✅ pronto | prioridade, botões rápidos "Comprei! Está a caminho" e "Chegou! Mover para a coleção", linha do tempo registra cada mudança |
| Perfil e vitrine | ✅ pronto | vitrine pública, à venda primeiro, Wish Time e "saíram" nunca aparecem, botão de WhatsApp só para logados |
| Pessoas | ✅ pronto | busca pelo nome ou pelo @ (antes era só pelo @) |
| Comunidades | ✅ pronto | criar, filtrar por cidade, entrar, sair, mural só para membros, admin apaga posts; se o último admin sai, o membro mais antigo vira admin |
| Trades & Deals | ✅ pronto (preço médio depende da chave da IA) | aba Meus: cada relógio Inegociável / À venda / Recebendo propostas, aceita troca, preço editável, "Vendi"; preço médio de mercado calculado pela IA e anúncio já sai com ele; aba Para você com indicações (Wish Time, radar, marcas, cidade) e o motivo; Explorar com filtros; aba Trades & Deals no perfil de cada colecionador; promoções |
| ECONOMY: Caçador | ✅ pronto (falta a chave da IA) | pedido começa na hora, status "na fila / buscando / pronto / não deu certo", tela atualiza sozinha, tenta 3 vezes, botão tentar de novo, limite de 5 por dia e 3 ao mesmo tempo, aviso quando a IA está desligada |
| ECONOMY: Radar | ✅ pronto (falta a chave da IA) | até 30 marcas com preço máximo; resultado semanal aparece como "Radar semanal" no caçador |
| NEWS FLEX | ✅ pronto (falta a chave da IA) | edição semanal automática (5 a 10 notícias, uma principal), troca de edição, links só http/https |
| Relatos | ✅ pronto | enviar com e sem login, contexto técnico anexado, acompanhar resposta, painel da equipe, terminal |
| Administração | ✅ pronto | visão geral, relatos, agentes (status, custo, rodar agora, tentar de novo), senha provisória |
| Privacidade | ✅ pronto | página explicando o que é guardado, quem vê, uso de IA e como excluir |
| App no celular (PWA) | ✅ pronto | instala no Android e no iPhone, ícone próprio, abre em tela cheia |
| Cores por área | ✅ pronto | NEWS FLEX claro (branco/bege e dourado), Economy azul-marinho com branco, Trades & Deals verde; o resto no preto e dourado |

## Área de relatos

Feita para os primeiros testes com amigos: tem que ser fácil relatar e fácil para a equipe acompanhar.

- **Onde a pessoa relata:** ícone de bandeira no topo de todas as telas; link "Relatar" em toda mensagem de erro; "Esqueci minha senha" na tela de entrar; Minha conta.
- **O que a pessoa escolhe:** Problema, Ideia, Conta e acesso ou Outro, e escreve com as próprias palavras. Sem login, deixa e-mail ou WhatsApp.
- **O que vai junto, sozinho:** a tela em que estava, o último erro que o app mostrou (inclusive erros internos do navegador), a versão do app e o aparelho. A pessoa vê tudo antes de enviar e pode desmarcar.
- **Acompanhamento:** em "Meus relatos" a pessoa vê o status (Recebido, Visto pela equipe, Em andamento, Resolvido) e a resposta da equipe.
- **Para a equipe:** painel `/admin` > Relatos, com os novos destacados. Dá para mudar o status e responder ("Responder e resolver" faz os dois de uma vez).
- **Para trazer os relatos ao Claude:** na pasta da API, rode `npm run relatos`. Sai um texto com todos os relatos em aberto, com tela, erro e aparelho. Cole numa conversa com o Claude Code nestes repositórios e peça para corrigir. Depois, marque como resolvido no painel e responda a pessoa.

## Ainda não existe (ideias para depois do lançamento)

Nada disso impede o lançamento para poucas pessoas:

- **Upload de fotos:** hoje a foto do relógio e do perfil é um link https. Upload direto (ex.: Supabase Storage) seria a melhoria mais visível.
- **Notificações:** ninguém é avisado quando o caçador termina, quando alguém posta na comunidade ou quando a equipe responde um relato. A pessoa precisa abrir o app.
- **Recuperação de senha por e-mail automática:** hoje passa pela equipe (relato + senha provisória). Para muita gente, vale um serviço de e-mail (ex.: Resend).
- **Moderação:** não há botão de denunciar post ou promoção; o admin da comunidade apaga posts, e a equipe pode apagar pelo banco.
- **Editar comunidade e promoção, ver lista de membros, comentar posts.**
- **Paginação:** listas param em 100 a 300 itens. Sobra para os primeiros meses.
- **Lojas de apps:** ver o final do [DEPLOY.md](DEPLOY.md).

## Como rodar a revisão de novo

```
npm run smoke                                   # todas as rotas, API local
AI_FAKE=true npm start                          # API com agentes em modo de teste (outro terminal)
npm run smoke -- http://localhost:3001 --agentes
```
