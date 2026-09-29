ALTER TABLE public.servicos_catalogo
    ADD COLUMN IF NOT EXISTS pecas_sugeridas jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
    ALTER TABLE public.servicos_catalogo
        ADD CONSTRAINT chk_servicos_catalogo_pecas_sugeridas_array
        CHECK (jsonb_typeof(pecas_sugeridas) = 'array') NOT VALID;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_pecas_sugeridas_servico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_peca jsonb;
    v_quantidade numeric;
    v_valor_unitario numeric;
BEGIN
    IF jsonb_typeof(NEW.pecas_sugeridas) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'As peças sugeridas devem ser uma lista.' USING ERRCODE = '22023';
    END IF;

    FOR v_peca IN
        SELECT item.value
          FROM jsonb_array_elements(NEW.pecas_sugeridas) AS item(value)
    LOOP
        IF jsonb_typeof(v_peca) IS DISTINCT FROM 'object'
            OR jsonb_typeof(v_peca -> 'produto_id') IS DISTINCT FROM 'string'
            OR jsonb_typeof(v_peca -> 'nome') IS DISTINCT FROM 'string'
            OR jsonb_typeof(v_peca -> 'quantidade') IS DISTINCT FROM 'number'
            OR jsonb_typeof(v_peca -> 'valor_unitario') IS DISTINCT FROM 'number'
            OR BTRIM(v_peca ->> 'nome') = ''
            OR (v_peca ->> 'produto_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN
            RAISE EXCEPTION 'Uma peça sugerida possui dados inválidos.' USING ERRCODE = '22023';
        END IF;

        v_quantidade := (v_peca ->> 'quantidade')::numeric;
        v_valor_unitario := (v_peca ->> 'valor_unitario')::numeric;
        IF v_quantidade < 1 OR TRUNC(v_quantidade) <> v_quantidade OR v_valor_unitario < 0 THEN
            RAISE EXCEPTION 'A quantidade e o preço da peça sugerida são inválidos.' USING ERRCODE = '22023';
        END IF;

        IF NOT EXISTS (
            SELECT 1
              FROM public.produtos AS produto
             WHERE produto.id = (v_peca ->> 'produto_id')::uuid
               AND produto.empresa_id = NEW.empresa_id
        ) THEN
            RAISE EXCEPTION 'A peça sugerida não pertence à empresa autenticada.' USING ERRCODE = '42501';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validar_pecas_sugeridas_servico() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validar_pecas_sugeridas_servico() TO authenticated;

DROP TRIGGER IF EXISTS trg_validar_pecas_sugeridas_servico ON public.servicos_catalogo;
CREATE TRIGGER trg_validar_pecas_sugeridas_servico
    BEFORE INSERT OR UPDATE OF pecas_sugeridas, empresa_id
    ON public.servicos_catalogo
    FOR EACH ROW
    EXECUTE FUNCTION public.validar_pecas_sugeridas_servico();
