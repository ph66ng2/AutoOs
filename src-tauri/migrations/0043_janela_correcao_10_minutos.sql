-- Prazo para o cliente desfazer a resposta no portal: de 15 para 10 minutos.
--
-- Decisão do responsável do produto (29/10/2026). O mínimo era 15 em três lugares:
-- o CHECK da coluna (0031), o padrão da coluna e a função autoos_portal_janela_minutos
-- (0035), que forçava GREATEST(…, 15). Esta migration baixa os três para 10 e grava 10
-- na configuração única, se ela ainda estiver no padrão antigo (15).
--
-- Respostas já registradas não mudam de prazo: a efetivação usa registrada_em + janela,
-- e uma resposta com mais de 10 minutos passa a ser efetivada na próxima rodada.
--
-- Idempotente: pode rodar de novo sem efeito.

DO $$
DECLARE
    v_nome TEXT;
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
RETURNS INTEGER
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
    SELECT GREATEST(COALESCE((SELECT janela_correcao_minutos FROM public.orcamento_aceite_config
                              WHERE singleton = TRUE), 10), 10)
$$;
