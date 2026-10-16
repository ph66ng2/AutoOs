-- Fila de envios de WhatsApp. Todo envio (automático ou manual) vira um pedido ligado a um
-- evento; o pedido é único por evento e cada reenvio explícito é uma nova tentativa rastreável.

CREATE TABLE IF NOT EXISTS envios_whatsapp_pedidos (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL,
    equipamento_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    -- Identidade do evento: `v:<orcamento_versoes.id>` para orçamento (versão congelada)
    -- e `s:<status_alterado_em em microssegundos>` para a mudança de etapa.
    chave_evento TEXT NOT NULL,
    versao_id BIGINT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    criado_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL,
    CONSTRAINT chk_envios_whatsapp_pedidos_tipo
        CHECK (tipo IN ('orcamento_informativo', 'orcamento_decisao', 'equipamento_pronto', 'codigo_verificacao')),
    CONSTRAINT chk_envios_whatsapp_pedidos_chave
        CHECK (chave_evento ~ '^(v|s):[0-9]+$'),
    CONSTRAINT chk_envios_whatsapp_pedidos_versao
        CHECK ((tipo IN ('orcamento_informativo', 'orcamento_decisao')) = (versao_id IS NOT NULL)),
    CONSTRAINT uq_envios_whatsapp_pedidos_evento
        UNIQUE (empresa_id, equipamento_id, tipo, chave_evento),
    CONSTRAINT uq_envios_whatsapp_pedidos_id_empresa UNIQUE (id, empresa_id),
    CONSTRAINT fk_envios_whatsapp_pedidos_equipamento
        FOREIGN KEY (equipamento_id, empresa_id)
        REFERENCES equipamentos (id, empresa_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_envios_whatsapp_pedidos_versao
        FOREIGN KEY (versao_id, empresa_id)
        REFERENCES orcamento_versoes (id, empresa_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_envios_whatsapp_pedidos_equipamento
    ON envios_whatsapp_pedidos (empresa_id, equipamento_id, id DESC);

-- Estados de uma tentativa:
--   PREPARANDO  reservada por uma instância; a chamada ao provedor ainda não terminou
--   ENVIADA     o provedor aceitou o pedido (não prova entrega)
--   FALHOU      falha definitiva ou nada chegou a ser enviado; nova tentativa é segura
--   INCERTA     o pedido pode ter chegado ao provedor (tempo esgotado, erro 5xx, instância
--               interrompida); só é repetida com confirmação explícita
CREATE TABLE IF NOT EXISTS envios_whatsapp_tentativas (
    id BIGSERIAL PRIMARY KEY,
    pedido_id BIGINT NOT NULL,
    empresa_id INTEGER NOT NULL,
    numero INTEGER NOT NULL,
    origem TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'PREPARANDO',
    provedor TEXT NOT NULL,
    destino_final TEXT,
    link_decisao_id BIGINT REFERENCES orcamento_links_decisao(id) ON DELETE SET NULL,
    mensagem_externa_id TEXT,
    erro_resumo TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalizado_em TIMESTAMPTZ,
    criado_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL,
    CONSTRAINT chk_envios_whatsapp_tentativas_origem CHECK (origem IN ('AUTOMATICO', 'REENVIO_MANUAL')),
    CONSTRAINT chk_envios_whatsapp_tentativas_estado
        CHECK (estado IN ('PREPARANDO', 'ENVIADA', 'FALHOU', 'INCERTA')),
    CONSTRAINT chk_envios_whatsapp_tentativas_numero CHECK (numero >= 1),
    CONSTRAINT chk_envios_whatsapp_tentativas_final
        CHECK ((estado = 'PREPARANDO') = (finalizado_em IS NULL)),
    CONSTRAINT chk_envios_whatsapp_tentativas_erro CHECK (char_length(COALESCE(erro_resumo, '')) <= 300),
    CONSTRAINT uq_envios_whatsapp_tentativas_numero UNIQUE (pedido_id, numero),
    CONSTRAINT fk_envios_whatsapp_tentativas_pedido
        FOREIGN KEY (pedido_id, empresa_id)
        REFERENCES envios_whatsapp_pedidos (id, empresa_id)
        ON DELETE CASCADE
);

-- No máximo uma tentativa em andamento por pedido: duas instâncias ou dois cliques
-- não conseguem enviar o mesmo evento ao mesmo tempo.
CREATE UNIQUE INDEX IF NOT EXISTS ux_envios_whatsapp_tentativas_em_andamento
    ON envios_whatsapp_tentativas (pedido_id)
    WHERE estado = 'PREPARANDO';

CREATE INDEX IF NOT EXISTS idx_envios_whatsapp_tentativas_pedido
    ON envios_whatsapp_tentativas (pedido_id, numero DESC);

-- O histórico só cresce: nenhuma linha é apagada ou reescrita fora da conclusão da tentativa.
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

    -- Tentativa: só PREPARANDO pode mudar de estado, e o resultado é definitivo.
    IF NEW.pedido_id IS DISTINCT FROM OLD.pedido_id
       OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.numero IS DISTINCT FROM OLD.numero
       OR NEW.origem IS DISTINCT FROM OLD.origem
       OR NEW.provedor IS DISTINCT FROM OLD.provedor
       OR NEW.criado_em IS DISTINCT FROM OLD.criado_em
       OR (OLD.estado <> 'PREPARANDO' AND (
            NEW.estado IS DISTINCT FROM OLD.estado
            OR NEW.finalizado_em IS DISTINCT FROM OLD.finalizado_em
            OR NEW.mensagem_externa_id IS DISTINCT FROM OLD.mensagem_externa_id
            OR NEW.erro_resumo IS DISTINCT FROM OLD.erro_resumo
            OR NEW.destino_final IS DISTINCT FROM OLD.destino_final)) THEN
        RAISE EXCEPTION 'Tentativa de envio é imutável depois de concluída';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_envios_whatsapp_pedidos_imutavel ON envios_whatsapp_pedidos;
CREATE TRIGGER trg_envios_whatsapp_pedidos_imutavel
    BEFORE UPDATE OR DELETE ON envios_whatsapp_pedidos
    FOR EACH ROW
    EXECUTE FUNCTION autoos_proteger_envio_whatsapp();

DROP TRIGGER IF EXISTS trg_envios_whatsapp_tentativas_imutavel ON envios_whatsapp_tentativas;
CREATE TRIGGER trg_envios_whatsapp_tentativas_imutavel
    BEFORE UPDATE OR DELETE ON envios_whatsapp_tentativas
    FOR EACH ROW
    EXECUTE FUNCTION autoos_proteger_envio_whatsapp();

ALTER TABLE envios_whatsapp_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE envios_whatsapp_tentativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE envios_whatsapp_pedidos FROM PUBLIC;
REVOKE ALL ON TABLE envios_whatsapp_tentativas FROM PUBLIC;

DROP POLICY IF EXISTS envios_whatsapp_pedidos_empresa ON envios_whatsapp_pedidos;
CREATE POLICY envios_whatsapp_pedidos_empresa ON envios_whatsapp_pedidos
    FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);

DROP POLICY IF EXISTS envios_whatsapp_tentativas_empresa ON envios_whatsapp_tentativas;
CREATE POLICY envios_whatsapp_tentativas_empresa ON envios_whatsapp_tentativas
    FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);

DO $$
DECLARE
    v_role TEXT;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE public.envios_whatsapp_pedidos FROM %I', v_role);
            EXECUTE format('REVOKE ALL ON TABLE public.envios_whatsapp_tentativas FROM %I', v_role);
        END IF;
    END LOOP;
END;
$$;
