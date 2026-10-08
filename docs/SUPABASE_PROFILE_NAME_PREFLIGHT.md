# Pré-checagem de nomes dos perfis SaaS

Antes de aplicar migrations Supabase, execute `scripts/check-saas-profile-name-collisions.sql` somente para leitura no banco alvo. A migration `20261008120000_saas_profile_name_casefold` cria unicidade em `(empresa_id, lower(btrim(nome)))` para todos os perfis de uma empresa não nula, inclusive inativos. O relatório ignora `empresa_id IS NULL`, pois o índice usa o comportamento padrão do PostgreSQL em que valores `NULL` não colidem.

Exemplo com `psql`:

```sh
psql "$AUTOOS_MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-saas-profile-name-collisions.sql
```

Resultado vazio: pode seguir com `supabase db push`. Se a consulta retornar grupos, renomeie os perfis até que os nomes normalizados sejam únicos dentro de cada empresa e rode a consulta novamente. Desativar um perfil, por si só, não resolve a colisão: o índice inclui linhas inativas. Preserve o histórico e não exclua perfis para contornar a checagem.
