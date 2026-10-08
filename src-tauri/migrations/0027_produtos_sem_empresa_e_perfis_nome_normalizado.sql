-- Preserva a unicidade global dos produtos ativos ainda sem empresa e impede
-- perfis com nomes que diferem apenas por caixa ou espaços externos.
DO $$
DECLARE duplicate_profiles text;
BEGIN
    IF EXISTS (
        SELECT 1
          FROM produtos
         WHERE ativo = true AND empresa_id IS NULL AND codigo IS NOT NULL
         GROUP BY codigo
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Produtos ativos sem empresa têm códigos duplicados.'
            USING HINT = 'Vincule os produtos a empresas ou corrija os códigos duplicados antes de executar novamente a migration.';
    END IF;

    SELECT string_agg(
        format('normalizado=%L ids=%s nomes=%s', normalized_name, profile_ids, profile_names),
        '; '
    )
      INTO duplicate_profiles
      FROM (
          SELECT lower(btrim(nome)) AS normalized_name,
                 array_agg(id ORDER BY id)::TEXT AS profile_ids,
                 array_agg(nome ORDER BY id)::TEXT AS profile_names
            FROM security_profiles
           GROUP BY lower(btrim(nome))
          HAVING count(*) > 1
      ) AS duplicates;

    IF duplicate_profiles IS NOT NULL THEN
        RAISE EXCEPTION 'Perfis ativos com nomes duplicados: %', duplicate_profiles
            USING HINT = 'Renomeie os perfis duplicados (inclusive inativos) e execute novamente a migration.';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_security_profiles_nome_normalizado
    ON security_profiles (lower(btrim(nome)));

CREATE UNIQUE INDEX IF NOT EXISTS ux_produtos_codigo_ativo_sem_empresa
    ON produtos (codigo)
    WHERE ativo = true AND empresa_id IS NULL;
