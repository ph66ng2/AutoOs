BEGIN;

INSERT INTO public.empresas (id, nome, ativo) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'AO-AUTH-TEST-A', true),
    ('b0000000-0000-4000-8000-000000000001', 'AO-AUTH-TEST-B', true)
ON CONFLICT (id) DO UPDATE
SET nome = EXCLUDED.nome, ativo = true, atualizado_em = CURRENT_TIMESTAMP;

INSERT INTO public.security_profiles (
    id, empresa_id, nome, role, permissions, ativo, is_default
) VALUES
    (
        'a0000000-0000-4000-8000-000000000011',
        'a0000000-0000-4000-8000-000000000001',
        'AO-AUTH-TEST-ADMIN', 'ADMIN', '[]', true, true
    ),
    (
        'b0000000-0000-4000-8000-000000000011',
        'b0000000-0000-4000-8000-000000000001',
        'AO-AUTH-TEST-ADMIN', 'ADMIN', '[]', true, true
    )
ON CONFLICT (id) DO UPDATE
SET role = 'ADMIN', permissions = '[]', ativo = true, atualizado_em = CURRENT_TIMESTAMP;

COMMIT;
