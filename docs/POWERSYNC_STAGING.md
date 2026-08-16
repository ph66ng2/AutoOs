# Staging isolado para PowerSync

Esta configuração existe exclusivamente para a POC SaaS. A linha interna da
BMITAG continua em `master`, com Tauri/Rust/sqlx e sem PowerSync.

## Limites obrigatórios

- Crie um projeto Supabase novo, identificado como **AutoOS Staging**. Não use o
  projeto interno e não reutilize seu database password, keys ou Storage.
- Crie uma instância PowerSync nova ligada somente a esse projeto de staging.
- Use apenas `supabase/schema.sql` e `supabase/seed.sql`. O seed cria a empresa
  sintética `AutoOS Staging`; não importe dump, backup, imagem ou cadastro da
  BMITAG.
- Não versione `src-tauri/.env`. Parta de `src-tauri/.env.example` e mantenha as
  chaves reais em cofre de segredos ou no ambiente local do operador.
- Credenciais que já tenham sido expostas em histórico Git devem ser rotacionadas
  antes de qualquer distribuição externa. Elas não podem ser reutilizadas no
  staging.

## Provisionamento manual

1. No dashboard Supabase, crie o projeto descartável de staging.
2. Aplique `supabase/schema.sql` e `supabase/seed.sql` nesse projeto; não aplique
   as migrations do baseline interno como substituto do schema UUID.
3. No dashboard PowerSync, crie uma instância de staging e conecte-a ao Postgres
   desse projeto Supabase.
4. Copie `src-tauri/.env.example` para `src-tauri/.env` na worktree de staging e
   preencha somente valores do novo ambiente.
5. Exporte, apenas no terminal do operador, as variáveis de validação abaixo:

   ```bash
   export SUPABASE_STAGING_URL='https://<staging-project-ref>.supabase.co'
   export SUPABASE_STAGING_DATABASE_URL='postgresql://postgres:<password>@db.<staging-project-ref>.supabase.co:5432/postgres?sslmode=require'
   export POWERSYNC_STAGING_URL='wss://<staging-powersync-instance>.powersync.journeyapps.com/v2/ws'
   export AUTOOS_INTERNAL_SUPABASE_URL='https://<internal-project-ref>.supabase.co'
   ```

6. Execute `./scripts/verify-staging-isolation.sh`. O comando falha se a URL de
   staging coincidir com a URL interna e testa a conexão PostgreSQL sem imprimir
   credenciais.

## Checklist de aceite da S0

- [ ] Projeto Supabase de staging acessível e marcado como descartável.
- [ ] Instância PowerSync exclusiva conectada ao Postgres de staging.
- [ ] `SUPABASE_STAGING_URL` é diferente de `AUTOOS_INTERNAL_SUPABASE_URL`.
- [ ] `./scripts/verify-staging-isolation.sh` retorna sucesso.
- [ ] Nenhum dump, seed ou arquivo de ambiente contém dado real da BMITAG.
- [ ] Nenhuma chave, token ou senha aparece em arquivos versionados.

O ticket S1 só pode começar após todos os itens acima serem confirmados por um
operador com acesso aos dashboards.
