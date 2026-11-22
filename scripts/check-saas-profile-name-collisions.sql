-- Run read-only against the target Supabase database before `supabase db push`.
-- The 20261008120000 migration creates an all-row unique index, so inactive
-- duplicates in a non-NULL company also need distinct names; deactivation alone
-- does not resolve them. NULL company IDs follow PostgreSQL's default NULL-distinct index behavior.
SELECT
    empresa_id,
    lower(btrim(nome)) AS nome_normalizado,
    array_agg(nome ORDER BY id) AS nomes,
    array_agg(format('id=%s ativo=%s', id, ativo) ORDER BY id) AS perfis
FROM public.security_profiles
WHERE empresa_id IS NOT NULL
GROUP BY empresa_id, lower(btrim(nome))
HAVING count(*) > 1
ORDER BY empresa_id, nome_normalizado;

-- Migration 0027 also blocks duplicate active product codes without a company.
-- Include the concrete rows so the migration error can be resolved before push.
SELECT
    codigo AS chave_conflito,
    array_agg(id ORDER BY id) AS produto_ids,
    array_agg(nome ORDER BY id) AS produtos
FROM public.produtos
WHERE ativo = true AND empresa_id IS NULL AND codigo IS NOT NULL
GROUP BY codigo
HAVING count(*) > 1
ORDER BY codigo;
