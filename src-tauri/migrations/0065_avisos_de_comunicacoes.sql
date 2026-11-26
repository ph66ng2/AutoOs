-- Comunicações enviadas (orçamento, aviso de pronto, WhatsApp/e-mail) também avisam ao vivo.
-- Sem isto, a OS aberta em outro computador continua mostrando o orçamento como não enviado
-- até alguém reabrir a OS. O aviso leva só ids: ref = equipamento_id da comunicação.
-- Mesma função da 0063 (a 0064 não a altera), acrescida do ref de `comunicacoes`.
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
                 WHEN 'comunicacoes' THEN (linha->>'equipamento_id')::BIGINT
                 WHEN 'cliente_contatos' THEN (linha->>'cliente_id')::BIGINT
                 ELSE NULL
               END,
        'op', left(TG_OP, 1)
    )::TEXT);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_avisar_mudanca ON public.comunicacoes;
CREATE TRIGGER trg_avisar_mudanca AFTER INSERT OR UPDATE OR DELETE ON public.comunicacoes
    FOR EACH ROW EXECUTE FUNCTION public.avisar_mudanca();
