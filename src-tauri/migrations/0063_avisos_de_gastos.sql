-- Gastos legados sem empresa são compartilhados. Enviam apenas um aviso da tabela,
-- sem o identificador da linha. As demais tabelas continuam restritas à empresa.
CREATE OR REPLACE FUNCTION public.avisar_mudanca()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    linha JSONB;
    empresa INTEGER;
BEGIN
    linha := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
    empresa := (linha->>'empresa_id')::INTEGER;
    IF empresa IS NULL AND TG_TABLE_NAME NOT IN ('gastos_fixos', 'gastos_variaveis') THEN
        RETURN NULL;
    END IF;
    PERFORM pg_notify('autoos_mudancas', json_build_object(
        'e', empresa,
        't', TG_TABLE_NAME,
        'id', CASE WHEN empresa IS NOT NULL THEN (linha->>'id')::BIGINT END,
        'ref', CASE TG_TABLE_NAME
                 WHEN 'verificacoes' THEN (linha->>'equipamento_id')::BIGINT
                 WHEN 'cliente_contatos' THEN (linha->>'cliente_id')::BIGINT
                 ELSE NULL
               END,
        'op', left(TG_OP, 1)
    )::TEXT);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_avisar_mudanca ON public.gastos_fixos;
CREATE TRIGGER trg_avisar_mudanca AFTER INSERT OR UPDATE OR DELETE ON public.gastos_fixos
    FOR EACH ROW EXECUTE FUNCTION public.avisar_mudanca();

DROP TRIGGER IF EXISTS trg_avisar_mudanca ON public.gastos_variaveis;
CREATE TRIGGER trg_avisar_mudanca AFTER INSERT OR UPDATE OR DELETE ON public.gastos_variaveis
    FOR EACH ROW EXECUTE FUNCTION public.avisar_mudanca();
