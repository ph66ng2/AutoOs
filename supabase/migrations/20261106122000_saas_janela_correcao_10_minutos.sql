-- Porte SaaS de src-tauri/migrations/0043_janela_correcao_10_minutos.sql.
-- Prazo para o cliente desfazer a resposta no portal: de 15 para 10 minutos
-- (CHECK, DEFAULT, configuração única e autoos_portal_janela_minutos). Idempotente.

DO $$
DECLARE
    v_nome text;
BEGIN
    FOR v_nome IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'public'
           AND t.relname = 'orcamento_aceite_config'
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) ILIKE '%janela_correcao_minutos%'
    LOOP
        EXECUTE format('ALTER TABLE public.orcamento_aceite_config DROP CONSTRAINT %I', v_nome);
    END LOOP;
END;
$$;

ALTER TABLE public.orcamento_aceite_config
    ADD CONSTRAINT orcamento_aceite_config_janela_correcao_minutos_check
    CHECK (janela_correcao_minutos BETWEEN 10 AND 1440);

ALTER TABLE public.orcamento_aceite_config
    ALTER COLUMN janela_correcao_minutos SET DEFAULT 10;

UPDATE public.orcamento_aceite_config
   SET janela_correcao_minutos = 10
 WHERE singleton = TRUE
   AND janela_correcao_minutos = 15;

CREATE OR REPLACE FUNCTION public.autoos_portal_janela_minutos()
RETURNS integer
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
    SELECT GREATEST(COALESCE((SELECT janela_correcao_minutos FROM public.orcamento_aceite_config
                              WHERE singleton = TRUE), 10), 10)
$$;
