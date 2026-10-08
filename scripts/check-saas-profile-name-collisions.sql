-- Run read-only against the target Supabase database before `supabase db push`.
-- The 20261008120000 migration creates an all-row unique index, so inactive
-- duplicates also need a distinct name; deactivation alone does not resolve it.
SELECT
    empresa_id,
    lower(btrim(nome)) AS nome_normalizado,
    array_agg(nome ORDER BY nome) AS nomes,
    array_agg(format('id=%s ativo=%s', id, ativo) ORDER BY id) AS perfis
FROM public.security_profiles
GROUP BY empresa_id, lower(btrim(nome))
HAVING count(*) > 1
ORDER BY empresa_id, nome_normalizado;
