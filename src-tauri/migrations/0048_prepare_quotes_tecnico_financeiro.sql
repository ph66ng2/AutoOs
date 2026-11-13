-- Permissão "Elaborar e enviar orçamentos" (PREPARE_QUOTES) para Técnico e Financeiro.
--
-- Continuação da 0042, que concedeu a permissão só ao ADMIN enquanto havia PCs na v0.5.6
-- (ela recusa chave desconhecida em perfil não-ADMIN e a lista de perfis ficava vazia).
-- Toda a frota está na 0.6.2 (confirmado em 10/11/2026), então a concessão pode sair.
--
-- Só dados, sem alteração de schema. Recebem a permissão os perfis que ainda não a têm e:
--   - têm role TECNICO ou FINANCEIRO; ou
--   - chamam-se "Técnico"/"Tecnico" ou "Financeiro" (sem diferenciar maiúsculas), caso o
--     perfil tenha virado Personalizado (CUSTOM) por ajuste de permissões.
-- ADMIN fica fora: já recebeu na 0042. Perfis inativos entram, para que uma reativação
-- futura não volte sem a permissão.
--
-- FINANCEIRO entra porque FINANCIAL_ACTIONS não cobre tudo: publicar o orçamento no portal
-- e enviá-lo ao contato exigem MANAGE_STATUS_LINKS ou PREPARE_QUOTES.
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
         WHERE role <> 'ADMIN'
           AND (
                role IN ('TECNICO', 'FINANCEIRO')
                OR lower(btrim(nome)) IN ('técnico', 'tecnico', 'financeiro')
           )
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
            RAISE NOTICE 'security_profiles id=% ignorado na migration 0048: permissions não é JSON válido (%)',
                rec.id, SQLERRM;
        END;
    END LOOP;
END;
$$;
