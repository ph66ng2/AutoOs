-- Permissão "Elaborar e enviar orçamentos" (PREPARE_QUOTES).
--
-- Concede PREPARE_QUOTES aos perfis TECNICO, FINANCEIRO e ADMIN que ainda não a têm.
-- A coluna security_profiles.permissions é TEXT contendo um array JSON de permissões.
--
-- ADMIN entra na lista porque o status de permissões exibido no frontend lê a
-- coluna permissions diretamente: sem a entrada, o administrador veria a permissão
-- como ausente mesmo tendo acesso total. Perfis sem role conhecido não são alterados.
--
-- Cada linha é tratada à parte: JSON legado inválido gera NOTICE e é ignorado,
-- sem abortar a migration. A operação é idempotente: quem já tem a permissão não muda.

DO $$
DECLARE
    rec RECORD;
    v_perms JSONB;
BEGIN
    FOR rec IN
        SELECT id, permissions
          FROM security_profiles
         WHERE role IN ('TECNICO', 'FINANCEIRO', 'ADMIN')
    LOOP
        BEGIN
            v_perms := rec.permissions::jsonb;

            IF jsonb_typeof(v_perms) = 'array' AND NOT (v_perms ? 'PREPARE_QUOTES') THEN
                UPDATE security_profiles
                   SET permissions = (v_perms || '["PREPARE_QUOTES"]'::jsonb)::text,
                       atualizado_em = NOW()
                 WHERE id = rec.id;
            END IF;
        EXCEPTION WHEN others THEN
            RAISE NOTICE 'security_profiles id=% ignorado na migration 0042: permissions não é JSON válido (%)',
                rec.id, SQLERRM;
        END;
    END LOOP;
END;
$$;
