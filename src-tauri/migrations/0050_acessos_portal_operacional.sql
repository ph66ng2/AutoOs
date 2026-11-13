-- Só dados: garante Acessos do portal à equipe operacional existente, inclusive inativos.
-- A seleção por nome alcança modelos convertidos em CUSTOM; outros personalizados ficam intactos.
-- Preserva permissões anteriores, não concede FINANCIAL_ACTIONS e não altera ADMIN.
-- 0045/0046: feature; 0047: PDF do portal (#188); 0048: #184; 0049: #185.
-- Idempotente: quem já tem MANAGE_STATUS_LINKS mantém inclusive atualizado_em.

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
                role IN ('TECNICO', 'FINANCEIRO', 'ATENDENTE')
                OR lower(btrim(nome)) IN ('técnico', 'tecnico', 'financeiro', 'recepção', 'recepcao')
           )
    LOOP
        BEGIN
            v_perms := rec.permissions::jsonb;

            IF jsonb_typeof(v_perms) = 'array' AND NOT (v_perms ? 'MANAGE_STATUS_LINKS') THEN
                UPDATE security_profiles
                   SET permissions = (v_perms || '["MANAGE_STATUS_LINKS"]'::jsonb)::text,
                       atualizado_em = NOW()
                 WHERE id = rec.id;
            END IF;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE NOTICE 'security_profiles id=% ignorado na migration 0050: permissions não é JSON válido (%)',
                rec.id, SQLERRM;
        END;
    END LOOP;
END;
$$;
