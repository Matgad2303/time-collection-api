# Colocar no ar

Ordem: **banco → API → site → ajustar CORS → testar**. Tudo cabe nos planos gratuitos do Supabase e do Render.

## 1. Banco (Supabase)

1. Em supabase.com, crie um projeto (região **South America (São Paulo)**). Guarde a senha do banco.
2. Em **Connect** (ou Project Settings > Database), copie a connection string do **Session pooler** (porta 5432, host `...pooler.supabase.com`).
   - Não use a "Direct connection": ela é só IPv6 e o Render não alcança.
   - Não use o "Transaction pooler" (porta 6543) para as migrações.
3. Troque `[YOUR-PASSWORD]` pela senha. Essa é a `DATABASE_URL`.

Não precisa criar tabelas: a API cria sozinha no primeiro deploy (`npm run migrate`).

## 2. API (Render)

1. render.com > **New > Blueprint** > repositório `time-collection-api` (branch `main`).
2. Preencha:
   - `DATABASE_URL`: a do passo 1.
   - `CORS_ORIGIN`: por enquanto `*`; no passo 4 troca pelo endereço do site.
   - `JWT_SECRET` é gerado sozinho. `DATABASE_SSL` já vem `true`.
3. Aguarde o deploy. No log deve aparecer `Aplicando 001_init.sql` e `Banco atualizado.`
4. Abra `https://SEU-SERVICO.onrender.com/health`: deve mostrar `{"ok":true,"db":true}`.

## 3. Site (Render)

1. render.com > **New > Blueprint** > repositório `time-collection-web` (branch `main`).
2. `VITE_API_URL` = endereço da API do passo 2, sem barra no final.
3. Aguarde o deploy e abra o endereço do site.

## 4. Ajustar o CORS

Na API (Render > Environment), troque `CORS_ORIGIN` pelo endereço do site, ex.: `https://time-collection-web.onrender.com`. Para mais de um endereço (ex.: domínio próprio), separe por vírgula. Salve; o Render reinicia a API.

## 5. Testar

No computador, dentro da pasta da API:

```
npm install
npm run smoke -- https://SEU-SERVICO.onrender.com
```

Deve terminar com `Tudo certo.` (cria um usuário de teste `teste_...`; pode apagar depois no Supabase). Depois, crie sua conta pelo site e instale no celular (veja o README do web).

## Bom saber

- **Render gratuito dorme** depois de 15 min sem uso: a primeira chamada depois disso demora ~50 s. Para o lançamento, vale o plano Starter da API (US$ 7/mês), que não dorme.
- **Supabase gratuito pausa** o projeto depois de 7 dias sem nenhum acesso. Com usuários usando, não acontece.
- **Domínio próprio:** Render > Settings > Custom Domains, no site e/ou na API. Lembre de incluir o novo endereço em `CORS_ORIGIN`.
- **Backups:** o plano gratuito do Supabase não tem backup automático restaurável. Antes de ter usuários de verdade, considere o plano Pro ou um `pg_dump` periódico.
- **Migrações novas:** crie `002_....sql` na raiz e faça deploy; elas rodam sozinhas.

## Lojas de apps (próximo passo)

O site já funciona como app instalável (PWA). Para aparecer nas lojas:

- **Google Play:** dá para empacotar o próprio PWA com o PWABuilder (pwabuilder.com) como TWA. Precisa de conta de desenvolvedor (US$ 25, pagamento único) e domínio com o arquivo `assetlinks.json`.
- **App Store:** a Apple exige empacotar com Capacitor e usar recursos nativos para aprovar; conta de desenvolvedor US$ 99/ano e revisão de alguns dias.
