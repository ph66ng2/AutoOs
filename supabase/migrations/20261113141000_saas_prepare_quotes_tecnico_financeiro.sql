-- Porte SaaS de src-tauri/migrations/0048_prepare_quotes_tecnico_financeiro.sql
-- (e da 0042 para ADMIN, que não tinha porte). Só dados; não remove permissão.
-- Idempotente.

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
                    role IN ('TECNICO', 'FINANCEIRO')
                    OR lower(btrim(nome)) IN ('técnico', 'tecnico', 'financeiro')
                )
            )
    LOOP
        BEGIN
            v_perms := rec.permissions::jsonb;
            IF jsonb_typeof(v_perms) = 'array' AND NOT (v_perms ? 'PREPARE_QUOTES') THEN
                UPDATE public.security_profiles
                   SET permissions = (v_perms || '["PREPARE_QUOTES"]'::jsonb)::text,
                       atualizado_em = NOW()
                 WHERE id = rec.id;
            END IF;
        EXCEPTION WHEN others THEN
            RAISE NOTICE 'security_profiles id=% ignorado no porte 0048: permissions não é JSON válido (%)',
                rec.id, SQLERRM;
        END;
    END LOOP;
END;
$$;
