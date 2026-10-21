-- Permissão "Elaborar e enviar orçamentos" (PREPARE_QUOTES).
--
-- Concede PREPARE_QUOTES apenas aos perfis ADMIN que ainda não a têm.
-- A coluna security_profiles.permissions é TEXT contendo um array JSON de permissões.
--
-- ADMIN entra porque o status de permissões exibido no frontend lê a coluna
-- permissions diretamente: sem a entrada, o administrador veria a permissão
-- como ausente mesmo tendo acesso total (o backend já dá ALL_PERMISSIONS ao ADMIN
-- sem ler a coluna, então a v0.5.6 não é afetada).
--
-- TECNICO e FINANCEIRO NÃO recebem a permissão aqui: a v0.5.6 recusa chave
-- desconhecida em perfil não-ADMIN ("Permissão inválida"), o que quebraria a lista
-- de perfis e o desbloqueio nos PCs ainda nessa versão. A concessão a eles fica para
-- uma migration posterior, aplicada só quando todos os PCs estiverem na 0.6.0.
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
         WHERE role = 'ADMIN'
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
