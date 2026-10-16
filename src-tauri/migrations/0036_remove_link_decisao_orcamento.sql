-- 0036: remove o link de decisão individual do orçamento (`status.bmitag.com.br/#/o/<token>`).
--
-- O cliente responde ao orçamento pelo Portal do Cliente, com login (0034/0035). O link por
-- token (0030/0031) e o envio dele pela fila de WhatsApp (tipo `orcamento_decisao`, 0032/0033)
-- deixam de existir. Versões, respostas, solicitações e a fila continuam: o portal usa as mesmas
-- tabelas. Linhas antigas de links ficam só como histórico.
--
-- `orcamento_aceite_config.online_enabled` continua sendo a chave que liga as respostas no portal.

-- Entradas públicas do link (chamadas só pela Edge Function `orcamento-decisao`, removida).
DROP FUNCTION IF EXISTS public.consultar_orcamento_decisao(TEXT);
DROP FUNCTION IF EXISTS public.registrar_solicitacao_orcamento(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.registrar_resposta_orcamento(TEXT, TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.autoos_estado_link_orcamento(TEXT);
-- Geração do link no processador central de WhatsApp.
DROP FUNCTION IF EXISTS public.emitir_link_decisao_envio(BIGINT, TEXT);

-- Nenhum link continua válido, e nenhum novo pode nascer.
UPDATE orcamento_links_decisao
SET revogado_em = statement_timestamp(), revogado_motivo = 'FLUXO_SUBSTITUIDO_PELO_PORTAL'
WHERE revogado_em IS NULL;

DO $$
BEGIN
    ALTER TABLE orcamento_links_decisao
        ADD CONSTRAINT chk_orcamento_links_decisao_descontinuado CHECK (revogado_em IS NOT NULL) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- A fila de WhatsApp não aceita mais pedidos de link de decisão.
DO $$
BEGIN
    ALTER TABLE envios_whatsapp_pedidos
        ADD CONSTRAINT chk_envios_whatsapp_sem_link_decisao CHECK (tipo <> 'orcamento_decisao') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

COMMENT ON COLUMN public.orcamento_aceite_config.online_enabled IS
    'Liga as respostas ao orçamento no Portal do Cliente (aceitar, recusar, negociar).';
COMMENT ON TABLE orcamento_links_decisao IS
    'Histórico do link de decisão individual, substituído pelo Portal do Cliente na 0036.';
