-- Porte SaaS de src-tauri/migrations/0050_acessos_portal_operacional.sql.
-- Cria/concede MANAGE_STATUS_LINKS (não existia no SaaS) sem remover permissões.
-- ADMIN entra porque a 0042/listagem de permissões não tinha porte; saas_has_permission
-- já trata ADMIN como total, mas o JSON da UI precisa da chave. Idempotente.

DO $$
DECLARE
    rec RECORD;
    v_perms jsonb;
BEGIN
    FOR rec IN
        SELECT id, permissions
          FROM public.security_profiles
         WHERE role = 'ADMIN'
            OR (
                role <> 'ADMIN'
                AND (
                    role IN ('TECNICO', 'FINANCEIRO', 'ATENDENTE')
                    OR lower(btrim(nome)) IN ('técnico', 'tecnico', 'financeiro', 'recepção', 'recepcao')
                )
            )
    LOOP
        BEGIN
            v_perms := rec.permissions::jsonb;
            IF jsonb_typeof(v_perms) = 'array' AND NOT (v_perms ? 'MANAGE_STATUS_LINKS') THEN
                UPDATE public.security_profiles
                   SET permissions = (v_perms || '["MANAGE_STATUS_LINKS"]'::jsonb)::text,
                       atualizado_em = NOW()
                 WHERE id = rec.id;
            END IF;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE NOTICE 'security_profiles id=% ignorado no porte 0050: permissions não é JSON válido (%)',
                rec.id, SQLERRM;
        END;
    END LOOP;
END;
$$;
