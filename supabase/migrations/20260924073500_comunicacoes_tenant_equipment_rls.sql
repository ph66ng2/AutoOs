-- Communication logs must reference equipment from the same authenticated tenant.
-- The default tenant-only policy permits arbitrary foreign equipment UUIDs unless
-- the relationship is checked explicitly in both INSERT and UPDATE.
DROP POLICY IF EXISTS company_insert ON public.comunicacoes;
CREATE POLICY company_insert ON public.comunicacoes
    FOR INSERT TO authenticated
    WITH CHECK (
        empresa_id = (select public.current_company_id())
        AND EXISTS (
            SELECT 1
              FROM public.equipamentos AS equipment
             WHERE equipment.id = comunicacoes.equipamento_id
               AND equipment.empresa_id = comunicacoes.empresa_id
        )
    );

DROP POLICY IF EXISTS company_update ON public.comunicacoes;
CREATE POLICY company_update ON public.comunicacoes
    FOR UPDATE TO authenticated
    USING (empresa_id = (select public.current_company_id()))
    WITH CHECK (
        empresa_id = (select public.current_company_id())
        AND EXISTS (
            SELECT 1
              FROM public.equipamentos AS equipment
             WHERE equipment.id = comunicacoes.equipamento_id
               AND equipment.empresa_id = comunicacoes.empresa_id
        )
    );
