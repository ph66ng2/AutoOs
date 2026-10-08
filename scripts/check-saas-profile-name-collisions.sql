-- Run read-only against the target Supabase database before `supabase db push`.
-- The 20261008120000 migration creates an all-row unique index, so inactive
-- duplicates in a non-NULL company also need distinct names; deactivation alone
-- does not resolve them. NULL company IDs follow PostgreSQL's default NULL-distinct index behavior.
SELECT
    empresa_id,
    lower(btrim(nome)) AS nome_normalizado,
    array_agg(nome ORDER BY nome) AS nomes,
    array_agg(format('id=%s ativo=%s', id, ativo) ORDER BY id) AS perfis
FROM public.security_profiles
WHERE empresa_id IS NOT NULL
GROUP BY empresa_id, lower(btrim(nome))
HAVING count(*) > 1
ORDER BY empresa_id, nome_normalizado;
