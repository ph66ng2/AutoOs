# Pré-checagem de nomes dos perfis SaaS

Antes de aplicar migrations Supabase, execute `scripts/check-saas-profile-name-collisions.sql` somente para leitura no banco alvo. A migration `20261008120000_saas_profile_name_casefold` cria unicidade em `(empresa_id, lower(btrim(nome)))` para todos os perfis de uma empresa não nula, inclusive inativos. O primeiro resultado lista colisões de perfis; o segundo lista produtos ativos sem empresa com códigos repetidos, que também bloqueiam a migration SQLx 0027. Os dois resultados incluem os registros envolvidos. O relatório de perfis ignora `empresa_id IS NULL`, pois o índice usa o comportamento padrão do PostgreSQL em que valores `NULL` não colidem.

Exemplo com `psql`:

```sh
psql "$AUTOOS_MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-saas-profile-name-collisions.sql
```

Resultados vazios: pode seguir com `supabase db push`. Se a consulta retornar grupos de perfis, renomeie os perfis até que os nomes normalizados sejam únicos dentro de cada empresa e rode a consulta novamente. Desativar um perfil, por si só, não resolve a colisão: o índice inclui linhas inativas. Para produtos, vincule os registros a empresas ou corrija os códigos duplicados. Preserve o histórico e não exclua perfis ou produtos para contornar a checagem.
