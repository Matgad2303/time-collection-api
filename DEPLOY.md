# Colocar no ar

Ordem: **banco → chave da IA → API → site → CORS → admin → testar**. Leva cerca de 1 hora com calma.

Antes de começar: junte as branches de trabalho na `main` dos dois repositórios (o Render publica a `main`).

## 1. Banco (Supabase)

1. Em supabase.com, crie um projeto (região **South America (São Paulo)**). Guarde a senha do banco.
2. Em **Connect** (ou Project Settings > Database), copie a connection string do **Session pooler** (porta 5432, host `...pooler.supabase.com`).
   - Não use a "Direct connection": ela é só IPv6 e o Render não alcança.
   - Não use o "Transaction pooler" (porta 6543) para as migrações.
3. Troque `[YOUR-PASSWORD]` pela senha. Essa é a `DATABASE_URL`.

Não precisa criar tabelas: a API cria sozinha no deploy (`npm run migrate`).

## 2. Chave da IA (Anthropic)

1. Em console.anthropic.com, crie a conta da equipe, coloque créditos (Billing) e crie uma chave em **API Keys**.
2. Em **Limits**, defina um limite de gasto mensal (ex.: US$ 20) para não ter surpresa.
3. Guarde a chave (`sk-ant-...`). Ela é a `ANTHROPIC_API_KEY`. Nunca coloque no GitHub.

Sem a chave o app funciona inteiro; só o Caçador, o Radar e o NEWS FLEX ficam desligados (o app avisa isso na tela do Economy).

**Custo esperado:** cada busca do caçador custa por volta de US$ 0,05 a 0,30 (modelo Claude Opus 5.5 + pesquisas na web); a edição semanal do NEWS FLEX, algo parecido. Com poucas pessoas testando, poucos dólares por mês. O painel de administração mostra o custo aproximado dos últimos 30 dias, e o limite `HUNTS_PER_DAY` (5 por pessoa por dia) segura abusos.

## 3. API (Render)

1. render.com > **New > Blueprint** > repositório `time-collection-api`.
2. Preencha:
   - `DATABASE_URL`: a do passo 1.
   - `CORS_ORIGIN`: por enquanto `*`; no passo 5 troca pelo endereço do site.
   - `ANTHROPIC_API_KEY`: a do passo 2.
   - `JWT_SECRET` é gerado sozinho. `DATABASE_SSL` e `HUNTS_PER_DAY` já vêm preenchidos.
3. Aguarde o deploy. No log devem aparecer `Aplicando 001_init.sql`, `Aplicando 002_relatos_e_agentes.sql`, `Banco atualizado.` e `[agentes] ligados`.
4. Abra `https://SEU-SERVICO.onrender.com/health`: deve mostrar `{"ok":true,"db":true,"ai":true}`.

## 4. Site (Render)

1. render.com > **New > Blueprint** > repositório `time-collection-web`.
2. `VITE_API_URL` = endereço da API do passo 3, sem barra no final.
3. Aguarde o deploy e abra o endereço do site.

## 5. Ajustar o CORS

Na API (Render > Environment), troque `CORS_ORIGIN` pelo endereço do site, ex.: `https://time-collection-web.onrender.com`. Para mais de um endereço (ex.: domínio próprio), separe por vírgula. Salve; o Render reinicia a API.

## 6. Contas de administrador

1. Você e seu amigo criam as contas pelo site.
2. No computador, na pasta da API, crie um `.env` com a mesma `DATABASE_URL` e `DATABASE_SSL=true`, e rode para cada um:

```
npm install
npm run tornar-admin -- email-da-conta@exemplo.com
```

3. Saiam e entrem de novo no app: aparece **Administração** em Minha conta. Lá ficam os relatos, a visão geral, os agentes e a senha provisória para quem esqueceu a senha.

## 7. Testar

No computador, na pasta da API:

```
npm run smoke -- https://SEU-SERVICO.onrender.com            # todas as rotas; cria e apaga um usuário de teste
npm run smoke -- https://SEU-SERVICO.onrender.com --agentes  # também espera o caçador terminar (1 busca real paga)
npm run testar-ia                                            # uma busca real de teste, mostra anúncios e custo (precisa da chave no .env)
```

Os três devem terminar sem `FALHA`. Depois, no painel de administração > Agentes, clique em **Gerar NEWS FLEX agora** e confira a aba News. Por fim, instalem no celular (Android: Chrome > Instalar app; iPhone: Safari > Compartilhar > Adicionar à Tela de Início) e façam uma rodada pelo app.

## Bom saber

- **Render gratuito dorme** depois de 15 min sem uso: a primeira abertura depois disso demora ~50 s. Para o lançamento, vale o plano Starter da API (US$ 7/mês), que não dorme e deixa os agentes sempre ativos.
- **Supabase gratuito pausa** o projeto depois de 7 dias sem nenhum acesso. Com gente usando, não acontece.
- **Domínio próprio:** Render > Settings > Custom Domains. Inclua o novo endereço em `CORS_ORIGIN`.
- **Backups:** o plano gratuito do Supabase não tem backup restaurável. Antes de ter muita gente, considere o plano Pro ou um `pg_dump` periódico.
- **Migrações novas:** crie `003_....sql` na raiz e faça deploy; elas rodam sozinhas.

## Lojas de apps (próximo passo)

O site já funciona como app instalável (PWA). Para aparecer nas lojas:

- **Google Play:** dá para empacotar o próprio PWA com o PWABuilder (pwabuilder.com) como TWA. Precisa de conta de desenvolvedor (US$ 25, pagamento único) e domínio com o arquivo `assetlinks.json`.
- **App Store:** a Apple exige empacotar com Capacitor e ter recursos nativos para aprovar; conta de desenvolvedor US$ 99/ano e revisão de alguns dias.
