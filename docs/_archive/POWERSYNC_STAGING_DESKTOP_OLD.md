# Staging isolado para PowerSync

Esta configuração existe exclusivamente para a POC SaaS. A linha interna da
BMITAG continua em `master`, com Tauri/Rust/sqlx e sem PowerSync.

## Limites obrigatórios

- Crie um projeto Supabase novo, identificado como **AutoOS Staging**. Não use o
  projeto interno e não reutilize seu database password, keys ou Storage.
- Crie uma instância PowerSync nova ligada somente a esse projeto de staging.
- Não importe dump, backup, imagem ou cadastro da BMITAG. O schema UUID/text e
  o seed sintético serão aplicados somente em `AO-PS-003`, depois de a revisão
  do modelo e IDs ser aprovada.
- Não versione `src-tauri/.env`. O template contém somente endpoints públicos;
  senha PostgreSQL, `service_role`, token administrativo PowerSync e segredo de
  cobrança ficam exclusivamente no cofre de operações ou nos respectivos
  serviços server-side, nunca no desktop.
- Credenciais que já tenham sido expostas em histórico Git devem ser rotacionadas
  antes de qualquer distribuição externa. Elas não podem ser reutilizadas no
  staging.

## Provisionamento manual

1. No dashboard Supabase, crie o projeto descartável de staging.
2. Não aplique as migrations do baseline interno nem `supabase/schema.sql` como
   atalho. O banco pode permanecer vazio até `AO-PS-003` definir o schema SaaS.
3. No dashboard PowerSync, crie uma instância de staging e conecte-a ao Postgres
   desse projeto Supabase.
4. Registre os endpoints públicos de staging somente em configuração local não
   versionada. Não inclua `DATABASE_URL`, `service_role` ou token PowerSync no
   diretório do aplicativo.
5. Exporte, apenas no terminal de operações, as variáveis de validação abaixo.
   A URL PostgreSQL é usada unicamente pelo validador e pela conexão server-side
   do PowerSync Cloud; ela nunca entra no bundle desktop:

   ```bash
   export SUPABASE_STAGING_URL='https://<staging-project-ref>.supabase.co'
   export SUPABASE_STAGING_DATABASE_URL='postgresql://postgres:<password>@db.<staging-project-ref>.supabase.co:5432/postgres?sslmode=require'
   export POWERSYNC_STAGING_URL='https://<staging-powersync-instance>.powersync.journeyapps.com'
   export AUTOOS_INTERNAL_SUPABASE_URL='https://<internal-project-ref>.supabase.co'
   ```

6. Execute `./scripts/verify-staging-isolation.sh`. O comando falha se a URL de
   staging coincidir com a URL interna e testa a conexão PostgreSQL sem imprimir
   credenciais.

## Checklist de aceite da S0

- [x ] Projeto Supabase de staging acessível e marcado como descartável.
- [x ] Instância PowerSync exclusiva conectada ao Postgres de staging.
- [x] `SUPABASE_STAGING_URL` é diferente de `AUTOOS_INTERNAL_SUPABASE_URL`.
- [x] `./scripts/verify-staging-isolation.sh` retorna sucesso.
- [x] Nenhum dump, seed ou arquivo de ambiente contém dado real da BMITAG.
- [ ] Nenhuma chave, token ou senha aparece em arquivos versionados.

O ticket S1 só pode começar após todos os itens acima serem confirmados por um
operador com acesso aos dashboards.
