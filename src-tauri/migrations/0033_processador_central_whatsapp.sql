-- Processador central de envios de WhatsApp.
--
-- Com vários computadores no mesmo banco, o desktop só enfileira (`PENDENTE`) e um processador
-- central reserva (`FOR UPDATE SKIP LOCKED`), envia e conclui as tentativas. O modo é escolhido
-- por empresa e nasce `LOCAL`: sem linha de configuração, tudo continua como na 0032.

CREATE TABLE IF NOT EXISTS envio_whatsapp_config_empresa (
    empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    modo TEXT NOT NULL DEFAULT 'LOCAL',
    provedor TEXT NOT NULL DEFAULT 'EVOLUTION',
    -- Identificadores sem segredo. Tokens ficam só nos segredos do processador.
    evolution_api_url TEXT,
    cloud_phone_number_id TEXT,
    cloud_waba_id TEXT,
    cloud_idioma TEXT NOT NULL DEFAULT 'pt_BR',
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_envio_whatsapp_config_modo CHECK (modo IN ('LOCAL', 'CENTRAL')),
    CONSTRAINT chk_envio_whatsapp_config_provedor CHECK (provedor IN ('EVOLUTION', 'CLOUD_API')),
    CONSTRAINT chk_envio_whatsapp_config_central CHECK (
        modo = 'LOCAL'
        OR (provedor = 'EVOLUTION' AND evolution_api_url ~ '^https://')
        OR (provedor = 'CLOUD_API' AND cloud_phone_number_id ~ '^[0-9]+$')
    ),
    CONSTRAINT chk_envio_whatsapp_config_idioma CHECK (cloud_idioma ~ '^[a-z]{2}(_[A-Z]{2})?$')
);

ALTER TABLE envio_whatsapp_config_empresa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE envio_whatsapp_config_empresa FROM PUBLIC;
DROP POLICY IF EXISTS envio_whatsapp_config_empresa_empresa ON envio_whatsapp_config_empresa;
CREATE POLICY envio_whatsapp_config_empresa_empresa ON envio_whatsapp_config_empresa
    FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);

-- A tentativa ganha a fase anterior ao envio e o conteúdo que o processador precisa.
ALTER TABLE envios_whatsapp_tentativas
    ADD COLUMN IF NOT EXISTS mensagem_payload JSONB,
    ADD COLUMN IF NOT EXISTS reservado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reservado_por TEXT,
    ADD COLUMN IF NOT EXISTS provedor_usado TEXT;

ALTER TABLE envios_whatsapp_tentativas
    DROP CONSTRAINT IF EXISTS chk_envios_whatsapp_tentativas_estado,
    DROP CONSTRAINT IF EXISTS chk_envios_whatsapp_tentativas_final;
ALTER TABLE envios_whatsapp_tentativas
    ADD CONSTRAINT chk_envios_whatsapp_tentativas_estado
        CHECK (estado IN ('PENDENTE', 'PREPARANDO', 'ENVIADA', 'FALHOU', 'INCERTA')),
    ADD CONSTRAINT chk_envios_whatsapp_tentativas_final
        CHECK ((estado IN ('PENDENTE', 'PREPARANDO')) = (finalizado_em IS NULL));

-- Continua valendo uma tentativa aberta por pedido, agora contando também a fila.
DROP INDEX IF EXISTS ux_envios_whatsapp_tentativas_em_andamento;
CREATE UNIQUE INDEX IF NOT EXISTS ux_envios_whatsapp_tentativas_em_andamento
    ON envios_whatsapp_tentativas (pedido_id)
    WHERE estado IN ('PENDENTE', 'PREPARANDO');

CREATE INDEX IF NOT EXISTS idx_envios_whatsapp_tentativas_fila
    ON envios_whatsapp_tentativas (id)
    WHERE estado = 'PENDENTE';

-- Imutabilidade: o que identifica a tentativa nunca muda; o que registra o andamento só muda
-- enquanto ela está aberta (`PENDENTE` ou `PREPARANDO`), e o resultado é definitivo.
CREATE OR REPLACE FUNCTION autoos_proteger_envio_whatsapp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF pg_trigger_depth() <= 1 THEN
            RAISE EXCEPTION 'O histórico de envios de WhatsApp não pode ser apagado';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_TABLE_NAME = 'envios_whatsapp_pedidos' THEN
        RAISE EXCEPTION 'Pedido de envio é imutável';
    END IF;

    IF NEW.pedido_id IS DISTINCT FROM OLD.pedido_id
       OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.numero IS DISTINCT FROM OLD.numero
       OR NEW.origem IS DISTINCT FROM OLD.origem
       OR NEW.provedor IS DISTINCT FROM OLD.provedor
       OR NEW.criado_em IS DISTINCT FROM OLD.criado_em
       OR NEW.mensagem_payload IS DISTINCT FROM OLD.mensagem_payload
       OR (OLD.estado NOT IN ('PENDENTE', 'PREPARANDO') AND (
            NEW.estado IS DISTINCT FROM OLD.estado
            OR NEW.finalizado_em IS DISTINCT FROM OLD.finalizado_em
            OR NEW.mensagem_externa_id IS DISTINCT FROM OLD.mensagem_externa_id
            OR NEW.erro_resumo IS DISTINCT FROM OLD.erro_resumo
            OR NEW.destino_final IS DISTINCT FROM OLD.destino_final
            OR NEW.reservado_em IS DISTINCT FROM OLD.reservado_em
            OR NEW.reservado_por IS DISTINCT FROM OLD.reservado_por
            OR NEW.provedor_usado IS DISTINCT FROM OLD.provedor_usado)) THEN
        RAISE EXCEPTION 'Tentativa de envio é imutável depois de concluída';
    END IF;
    RETURN NEW;
END;
$$;

-- Histórico visível por equipamento, gravado quando a tentativa termina.
CREATE OR REPLACE FUNCTION autoos_registrar_historico_envio(
    p_tentativa_id BIGINT,
    p_enviado BOOLEAN,
    p_erro TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_t RECORD;
    v_payload JSONB;
BEGIN
    SELECT t.empresa_id, t.mensagem_payload, p.equipamento_id INTO v_t
    FROM public.envios_whatsapp_tentativas t
    JOIN public.envios_whatsapp_pedidos p ON p.id = t.pedido_id AND p.empresa_id = t.empresa_id
    WHERE t.id = p_tentativa_id;
    IF NOT FOUND OR v_t.mensagem_payload IS NULL THEN
        RETURN;
    END IF;
    v_payload := v_t.mensagem_payload;

    INSERT INTO public.comunicacoes
        (empresa_id, equipamento_id, tipo, canal, destinatario, contato, mensagem, enviado, data_envio, erro)
    VALUES
        (v_t.empresa_id, v_t.equipamento_id,
         COALESCE(NULLIF(v_payload->>'tipoComunicacao', ''), 'ORCAMENTO'), 'WHATSAPP',
         COALESCE(NULLIF(btrim(v_payload->>'destinatario'), ''), 'Cliente'),
         COALESCE(NULLIF(v_payload->>'contato', ''), '-'),
         COALESCE(NULLIF(v_payload->>'historico', ''), 'Envio de WhatsApp.'),
         p_enviado, CASE WHEN p_enviado THEN statement_timestamp() END, left(p_erro, 300));
END;
$$;

-- Marca como incerta a tentativa cuja instância parou e descarta da fila o que ficou parado
-- tempo demais (nunca foi enviado, então a falha é definitiva e segura).
CREATE OR REPLACE FUNCTION public.varrer_envios_whatsapp(
    p_abandono_minutos INTEGER DEFAULT 2,
    p_fila_horas INTEGER DEFAULT 6
)
RETURNS TABLE (incertas INTEGER, expiradas INTEGER)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_id BIGINT;
    v_incertas INTEGER := 0;
    v_expiradas INTEGER := 0;
BEGIN
    FOR v_id IN
        SELECT id FROM public.envios_whatsapp_tentativas
        WHERE estado = 'PREPARANDO'
          AND COALESCE(reservado_em, criado_em) < statement_timestamp() - make_interval(mins => p_abandono_minutos)
        ORDER BY id
        FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE public.envios_whatsapp_tentativas
        SET estado = 'INCERTA', finalizado_em = statement_timestamp(),
            erro_resumo = 'O processador foi interrompido durante o envio. A mensagem pode ter sido enviada.'
        WHERE id = v_id AND estado = 'PREPARANDO';
        PERFORM public.autoos_registrar_historico_envio(
            v_id, FALSE, 'O processador foi interrompido durante o envio. A mensagem pode ter sido enviada.');
        v_incertas := v_incertas + 1;
    END LOOP;

    FOR v_id IN
        SELECT id FROM public.envios_whatsapp_tentativas
        WHERE estado = 'PENDENTE'
          AND criado_em < statement_timestamp() - make_interval(hours => p_fila_horas)
        ORDER BY id
        FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE public.envios_whatsapp_tentativas
        SET estado = 'FALHOU', finalizado_em = statement_timestamp(),
            erro_resumo = 'A mensagem ficou tempo demais na fila e não foi enviada.'
        WHERE id = v_id AND estado = 'PENDENTE';
        PERFORM public.autoos_registrar_historico_envio(
            v_id, FALSE, 'A mensagem ficou tempo demais na fila e não foi enviada.');
        v_expiradas := v_expiradas + 1;
    END LOOP;

    RETURN QUERY SELECT v_incertas, v_expiradas;
END;
$$;

-- Reserva atômica: instâncias simultâneas recebem tentativas diferentes. `valido` diz se o
-- evento ainda existe (orçamento não editado, equipamento ainda PRONTO).
CREATE OR REPLACE FUNCTION public.reservar_envios_whatsapp(
    p_instancia TEXT,
    p_limite INTEGER DEFAULT 10
)
RETURNS TABLE (
    tentativa_id BIGINT,
    empresa_id INTEGER,
    equipamento_id INTEGER,
    tipo TEXT,
    mensagem_payload JSONB,
    valido BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_instancia IS NULL OR btrim(p_instancia) = '' OR char_length(p_instancia) > 80 THEN
        RAISE EXCEPTION 'INSTANCIA_INVALIDA';
    END IF;
    IF p_limite < 1 OR p_limite > 50 THEN
        RAISE EXCEPTION 'LIMITE_INVALIDO';
    END IF;

    RETURN QUERY
    WITH candidatas AS (
        SELECT t.id
        FROM public.envios_whatsapp_tentativas t
        WHERE t.estado = 'PENDENTE'
        ORDER BY t.id
        FOR UPDATE SKIP LOCKED
        LIMIT p_limite
    ), reservadas AS (
        UPDATE public.envios_whatsapp_tentativas t
        SET estado = 'PREPARANDO', reservado_em = statement_timestamp(), reservado_por = p_instancia
        FROM candidatas c
        WHERE t.id = c.id
        RETURNING t.id, t.empresa_id AS t_empresa, t.mensagem_payload AS t_payload, t.pedido_id
    )
    SELECT r.id, r.t_empresa, p.equipamento_id, p.tipo, r.t_payload,
           CASE
               WHEN p.tipo = 'equipamento_pronto' THEN EXISTS (
                   SELECT 1 FROM public.equipamentos e
                   WHERE e.id = p.equipamento_id AND e.empresa_id = p.empresa_id
                     AND e.status = 'PRONTO'
                     AND 's:' || (EXTRACT(EPOCH FROM e.status_alterado_em) * 1000000)::BIGINT = p.chave_evento)
               ELSE EXISTS (
                   SELECT 1 FROM public.orcamento_versoes v
                   JOIN public.equipamentos e ON e.id = v.equipamento_id AND e.empresa_id = v.empresa_id
                   WHERE v.id = p.versao_id AND v.encerrada_em IS NULL
                     AND e.status = 'AGUARDANDO_APROVACAO')
           END
    FROM reservadas r
    JOIN public.envios_whatsapp_pedidos p ON p.id = r.pedido_id
    ORDER BY r.id;
END;
$$;

-- Configuração do provedor da empresa, sem segredos.
CREATE OR REPLACE FUNCTION public.obter_config_envio_whatsapp(p_empresa_id INTEGER)
RETURNS TABLE (
    provedor TEXT,
    evolution_api_url TEXT,
    cloud_phone_number_id TEXT,
    cloud_idioma TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT c.provedor, c.evolution_api_url, c.cloud_phone_number_id, c.cloud_idioma
    FROM public.envio_whatsapp_config_empresa c
    WHERE c.empresa_id = p_empresa_id AND c.modo = 'CENTRAL';
$$;

-- Gera o link de decisão no momento do envio e devolve o token uma única vez. O desktop nunca
-- vê o token, e só o hash é gravado. Recusa se o orçamento mudou depois do pedido.
CREATE OR REPLACE FUNCTION public.emitir_link_decisao_envio(
    p_tentativa_id BIGINT,
    p_instancia TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_t RECORD;
    v_versao RECORD;
    v_token TEXT;
    v_expira TIMESTAMPTZ;
    v_link_id BIGINT;
BEGIN
    SELECT t.id, t.empresa_id, t.estado, t.reservado_por, p.tipo, p.versao_id, p.equipamento_id INTO v_t
    FROM public.envios_whatsapp_tentativas t
    JOIN public.envios_whatsapp_pedidos p ON p.id = t.pedido_id AND p.empresa_id = t.empresa_id
    WHERE t.id = p_tentativa_id
    FOR UPDATE OF t;
    IF NOT FOUND OR v_t.estado <> 'PREPARANDO' OR v_t.reservado_por IS DISTINCT FROM p_instancia
       OR v_t.tipo <> 'orcamento_decisao' THEN
        RAISE EXCEPTION 'TENTATIVA_INVALIDA';
    END IF;

    PERFORM 1 FROM public.orcamento_aceite_config WHERE singleton = TRUE AND online_enabled;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ACEITE_PAUSADO';
    END IF;

    SELECT v.id, v.valido_ate INTO v_versao
    FROM public.orcamento_versoes v
    JOIN public.equipamentos e ON e.id = v.equipamento_id AND e.empresa_id = v.empresa_id
    WHERE v.id = v_t.versao_id AND v.encerrada_em IS NULL AND e.status = 'AGUARDANDO_APROVACAO';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORCAMENTO_ALTERADO';
    END IF;

    -- 64 caracteres hexadecimais, o mesmo formato do token gerado pelo desktop.
    v_token := replace(gen_random_uuid()::TEXT || gen_random_uuid()::TEXT, '-', '');
    v_expira := LEAST(COALESCE(v_versao.valido_ate, statement_timestamp() + INTERVAL '30 days'),
                      statement_timestamp() + INTERVAL '30 days');

    INSERT INTO public.orcamento_links_decisao
        (empresa_id, equipamento_id, versao_id, token_hash, expira_em)
    VALUES
        (v_t.empresa_id, v_t.equipamento_id, v_versao.id,
         encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_expira)
    RETURNING id INTO v_link_id;

    UPDATE public.envios_whatsapp_tentativas SET link_decisao_id = v_link_id WHERE id = p_tentativa_id;
    RETURN v_token;
END;
$$;

-- Conclusão com trava de posse: só quem reservou a tentativa a conclui. Se a reserva foi
-- varrida (virou INCERTA), uma conclusão tardia não sobrescreve o resultado.
CREATE OR REPLACE FUNCTION public.concluir_envio_whatsapp(
    p_tentativa_id BIGINT,
    p_instancia TEXT,
    p_estado TEXT,
    p_provedor TEXT,
    p_mensagem_externa_id TEXT,
    p_erro TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_contato TEXT;
    v_linhas INTEGER;
BEGIN
    IF p_estado NOT IN ('ENVIADA', 'FALHOU', 'INCERTA') THEN
        RAISE EXCEPTION 'ESTADO_INVALIDO';
    END IF;

    SELECT mensagem_payload->>'contato' INTO v_contato
    FROM public.envios_whatsapp_tentativas WHERE id = p_tentativa_id;

    UPDATE public.envios_whatsapp_tentativas
    SET estado = p_estado,
        finalizado_em = statement_timestamp(),
        provedor_usado = left(p_provedor, 40),
        mensagem_externa_id = left(p_mensagem_externa_id, 120),
        erro_resumo = left(p_erro, 300),
        destino_final = CASE WHEN char_length(COALESCE(v_contato, '')) > 8
                             THEN left(v_contato, 4) || '****' || right(v_contato, 4) ELSE '****' END
    WHERE id = p_tentativa_id AND estado = 'PREPARANDO' AND reservado_por = p_instancia;
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    IF v_linhas = 0 THEN
        RETURN FALSE;
    END IF;

    PERFORM public.autoos_registrar_historico_envio(p_tentativa_id, p_estado = 'ENVIADA', p_erro);
    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.varrer_envios_whatsapp(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_envios_whatsapp(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obter_config_envio_whatsapp(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.emitir_link_decisao_envio(BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.concluir_envio_whatsapp(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.autoos_registrar_historico_envio(BIGINT, BOOLEAN, TEXT) FROM PUBLIC;

-- Somente o processador (service_role) executa as funções; nenhuma tabela é concedida.
DO $$
DECLARE
    v_role TEXT;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE public.envio_whatsapp_config_empresa FROM %I', v_role);
            EXECUTE format('REVOKE ALL ON FUNCTION public.varrer_envios_whatsapp(INTEGER, INTEGER) FROM %I', v_role);
            EXECUTE format('REVOKE ALL ON FUNCTION public.reservar_envios_whatsapp(TEXT, INTEGER) FROM %I', v_role);
            EXECUTE format('REVOKE ALL ON FUNCTION public.obter_config_envio_whatsapp(INTEGER) FROM %I', v_role);
            EXECUTE format('REVOKE ALL ON FUNCTION public.emitir_link_decisao_envio(BIGINT, TEXT) FROM %I', v_role);
            EXECUTE format('REVOKE ALL ON FUNCTION public.concluir_envio_whatsapp(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM %I', v_role);
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.varrer_envios_whatsapp(INTEGER, INTEGER) TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.reservar_envios_whatsapp(TEXT, INTEGER) TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.obter_config_envio_whatsapp(INTEGER) TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.emitir_link_decisao_envio(BIGINT, TEXT) TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.concluir_envio_whatsapp(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role';
    END IF;
END;
$$;
