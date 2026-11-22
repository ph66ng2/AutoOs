BEGIN;

-- Só remove os UUIDs e nomes reservados para esta validação. A exclusão falha
-- se algum Auth user sintético ainda estiver vinculado.
DELETE FROM public.empresas
WHERE (id, nome) IN (
    ('a0000000-0000-4000-8000-000000000001'::uuid, 'AO-AUTH-TEST-A'),
    ('b0000000-0000-4000-8000-000000000001'::uuid, 'AO-AUTH-TEST-B')
);

COMMIT;
