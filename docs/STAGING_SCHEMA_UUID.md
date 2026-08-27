# Schema SaaS de staging: UUID e isolamento por empresa

## Decisão

O schema SaaS usa UUID nativo como `id` e `empresa_id` em todas as tabelas sincronizáveis. Não será usado sequential-id mapping no runtime Online ou Offline. O conversor `scripts/migrate_serial_to_uuid.py` permanece apenas como ferramenta histórica para dumps legados e sempre produz um único `empresa_id` UUID por registro.

Cada relação entre dados de negócio inclui a empresa nos dois lados da FK. Por exemplo, um equipamento de uma empresa não pode referenciar um cliente de outra empresa, mesmo que uma chamada de backend esteja defeituosa. RLS e as claims de autenticação continuam sendo definidos no `AO-PS-004`.

## Aplicação permitida

Somente o projeto **AutoOS Staging** pode receber este schema. O projeto interno e a `master` ficam fora deste procedimento. O staging deve estar vazio ou ter backup descartável, e nunca pode receber dump, seed ou credencial da BMITAG.

No terminal de operações, com a URL PostgreSQL de staging carregada apenas na sessão atual, execute primeiro o dry-run:

```bash
./scripts/dry-run-staging-schema.sh
```

O comando cria o schema e roda os testes na mesma transação, que sempre termina em `ROLLBACK`. Portanto ele não mantém estruturas nem registros. A aplicação persistente só poderá ocorrer depois que o `AO-PS-004` tiver a migração de RLS e grants pronta para ser aplicada no mesmo procedimento:

```bash
psql "$SUPABASE_STAGING_DATABASE_URL" --set ON_ERROR_STOP=on --file supabase/schema.sql
psql "$SUPABASE_STAGING_DATABASE_URL" --set ON_ERROR_STOP=on \
  --file supabase/migrations/20260827180517_provision_saas_admin_identity.sql
psql "$SUPABASE_STAGING_DATABASE_URL" --set ON_ERROR_STOP=on --file supabase/seed.sql
psql "$SUPABASE_STAGING_DATABASE_URL" --set ON_ERROR_STOP=on --file supabase/rls.sql
./scripts/validate-staging-schema.sh
```

Depois da aplicação, habilite o Custom Access Token Hook e mantenha signup
público desabilitado conforme `docs/SAAS_AUTH_RLS_CONTRACT.md`. A validação de
autenticação real é separada porque cria e remove usuários sintéticos pela Auth
Admin API: `npm run qa:staging:auth`.

O validador abre uma transação, cria duas empresas sintéticas e confirma que relações cruzadas são rejeitadas; ele sempre termina com `ROLLBACK`, portanto não mantém esses registros.

## Reaplicação e rollback

Executar `schema.sql` cria estruturas persistentes e deve ocorrer somente após revisão humana do SQL e do `AO-PS-004`. Antes de reaplicar em qualquer staging já utilizado, faça um backup descartável ou recrie o projeto. Não aplique este schema no Supabase interno e não execute o fluxo histórico `big-bang-migration.sh` para popular staging.
