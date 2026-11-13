-- Porte SaaS da decisão 10/11/2026: marcar pronto e registrar retirada/entrega
-- exigem só PIN (sessão autenticada), não FINANCIAL_ACTIONS. Aditivo.
-- Valor final, preços e demais campos financeiros continuam financeiros.
-- Não reescreve migration já aplicada. Não aplicar neste PR.

CREATE OR REPLACE FUNCTION private.saas_required_permissions(
    p_table_name text,
    p_operation text,
    p_old jsonb,
    p_new jsonb
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    required_permissions text[] := ARRAY[]::text[];
    status_changed boolean := COALESCE(p_old ->> 'status', '') IS DISTINCT FROM
                              COALESCE(p_new ->> 'status', '');
BEGIN
    CASE p_table_name
        WHEN 'equipamentos' THEN
            IF p_operation = 'DELETE' THEN
                required_permissions := ARRAY['DELETE_RECORDS'];
                IF p_old ->> 'preco_compra' IS NOT NULL
                   OR p_old ->> 'preco_venda' IS NOT NULL
                   OR p_old ->> 'valor_orcamento' IS NOT NULL
                   OR p_old ->> 'valor_final' IS NOT NULL
                   OR private.saas_is_financial_equipment_status(p_old ->> 'status') THEN
                    required_permissions := array_append(required_permissions, 'FINANCIAL_ACTIONS');
                END IF;
            ELSIF p_operation = 'INSERT' THEN
                IF p_new ->> 'preco_compra' IS NOT NULL
                   OR p_new ->> 'preco_venda' IS NOT NULL
                   OR p_new ->> 'valor_orcamento' IS NOT NULL
                   OR p_new ->> 'prazo_aprovacao' IS NOT NULL
                   OR p_new ->> 'valor_final' IS NOT NULL
                   OR p_new ->> 'data_aprovacao' IS NOT NULL
                   OR p_new ->> 'data_reprovacao' IS NOT NULL
                   OR private.saas_is_financial_equipment_status(p_new ->> 'status') THEN
                    required_permissions := ARRAY['FINANCIAL_ACTIONS'];
                END IF;
            ELSIF p_operation = 'UPDATE' THEN
                -- ENTREGUE operacional (sem valor_final/campos financeiros) é PIN-only, como no desktop.
                IF p_old ->> 'preco_compra' IS DISTINCT FROM p_new ->> 'preco_compra'
                   OR p_old ->> 'preco_venda' IS DISTINCT FROM p_new ->> 'preco_venda'
                   OR p_old ->> 'valor_orcamento' IS DISTINCT FROM p_new ->> 'valor_orcamento'
                   OR p_old ->> 'prazo_aprovacao' IS DISTINCT FROM p_new ->> 'prazo_aprovacao'
                   OR p_old ->> 'valor_final' IS DISTINCT FROM p_new ->> 'valor_final'
                   OR p_old ->> 'data_aprovacao' IS DISTINCT FROM p_new ->> 'data_aprovacao'
                   OR p_old ->> 'data_reprovacao' IS DISTINCT FROM p_new ->> 'data_reprovacao'
                   OR (status_changed
                       AND upper(COALESCE(p_new ->> 'status', '')) IS DISTINCT FROM 'ENTREGUE'
                       AND (
                            private.saas_is_financial_equipment_status(p_new ->> 'status')
                            OR private.saas_is_equipment_status_correction(
                                p_old ->> 'status', p_new ->> 'status'
                            )
                       )) THEN
                    required_permissions := ARRAY['FINANCIAL_ACTIONS'];
                END IF;
            END IF;

        WHEN 'verificacoes' THEN
            IF p_operation = 'DELETE' THEN
                required_permissions := ARRAY['DELETE_RECORDS'];
                IF p_old ->> 'custo_estimado_mao_obra' IS NOT NULL
                   OR p_old ->> 'custo_estimado_pecas' IS NOT NULL
                   OR p_old ->> 'custo_total' IS NOT NULL
                   OR p_old ->> 'forma_pagamento_codigo' IS NOT NULL
                   OR p_old ->> 'forma_pagamento_detalhe' IS NOT NULL THEN
                    required_permissions := array_append(required_permissions, 'FINANCIAL_ACTIONS');
                END IF;
            ELSIF p_operation = 'INSERT' THEN
                IF p_new ->> 'custo_estimado_mao_obra' IS NOT NULL
                   OR p_new ->> 'custo_estimado_pecas' IS NOT NULL
                   OR p_new ->> 'custo_total' IS NOT NULL
                   OR p_new ->> 'forma_pagamento_codigo' IS NOT NULL
                   OR p_new ->> 'forma_pagamento_detalhe' IS NOT NULL
                   OR p_new ->> 'adjusted_at' IS NOT NULL
                   OR p_new ->> 'adjusted_by_profile_id' IS NOT NULL THEN
                    required_permissions := ARRAY['FINANCIAL_ACTIONS'];
                END IF;
            ELSIF p_operation = 'UPDATE' THEN
                IF p_old ->> 'custo_estimado_mao_obra' IS DISTINCT FROM p_new ->> 'custo_estimado_mao_obra'
                   OR p_old ->> 'custo_estimado_pecas' IS DISTINCT FROM p_new ->> 'custo_estimado_pecas'
                   OR p_old ->> 'custo_total' IS DISTINCT FROM p_new ->> 'custo_total'
                   OR p_old ->> 'forma_pagamento_codigo' IS DISTINCT FROM p_new ->> 'forma_pagamento_codigo'
                   OR p_old ->> 'forma_pagamento_detalhe' IS DISTINCT FROM p_new ->> 'forma_pagamento_detalhe'
                   OR p_old ->> 'adjusted_at' IS DISTINCT FROM p_new ->> 'adjusted_at'
                   OR p_old ->> 'adjusted_by_profile_id' IS DISTINCT FROM p_new ->> 'adjusted_by_profile_id' THEN
                    required_permissions := ARRAY['FINANCIAL_ACTIONS'];
                END IF;
            END IF;

        WHEN 'produtos' THEN
            IF p_operation = 'DELETE' THEN
                required_permissions := ARRAY['DELETE_RECORDS'];
            ELSIF p_operation = 'UPDATE'
               AND p_old ->> 'ativo' IS DISTINCT FROM p_new ->> 'ativo'
               AND p_new ->> 'ativo' = 'false' THEN
                required_permissions := ARRAY['DELETE_RECORDS'];
                IF (p_old - 'ativo' - 'atualizado_em') IS DISTINCT FROM
                   (p_new - 'ativo' - 'atualizado_em') THEN
                    required_permissions := array_append(required_permissions, 'STOCK_CONTROL');
                END IF;
            ELSE
                required_permissions := ARRAY['STOCK_CONTROL'];
            END IF;

        WHEN 'movimentacoes_estoque' THEN
            IF p_operation = 'INSERT' THEN
                required_permissions := ARRAY['STOCK_CONTROL'];
            END IF;

        WHEN 'gastos_fixos', 'gastos_variaveis' THEN
            required_permissions := ARRAY['FINANCIAL_ACTIONS'];

        ELSE
            NULL;
    END CASE;

    RETURN required_permissions;
END;
$$;

REVOKE ALL ON FUNCTION private.saas_required_permissions(text, text, jsonb, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;

