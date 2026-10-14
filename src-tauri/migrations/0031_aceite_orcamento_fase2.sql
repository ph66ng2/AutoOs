-- Aceite online de orçamento, fase 2: consulta pública, dúvidas, pedidos de mudança
-- e auditoria da correção de decisão. A 0030 não é alterada.

-- Mensagens do cliente. Uma dúvida não registra decisão; um pedido de mudança só existe
-- depois que a equipe aplicou a resposta. Somente `tratado_*` pode ser preenchido depois.
CREATE TABLE IF NOT EXISTS orcamento_solicitacoes (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL,
    equipamento_id INTEGER NOT NULL,
    versao_id BIGINT NOT NULL,
    link_id BIGINT REFERENCES orcamento_links_decisao(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tratado_em TIMESTAMPTZ,
    tratado_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL,
    CONSTRAINT chk_orcamento_solicitacoes_tipo CHECK (tipo IN ('DUVIDA', 'MUDANCA')),
    CONSTRAINT chk_orcamento_solicitacoes_mensagem
        CHECK (char_length(btrim(mensagem)) BETWEEN 1 AND 500),
    CONSTRAINT fk_orcamento_solicitacoes_versao
        FOREIGN KEY (versao_id, empresa_id)
        REFERENCES orcamento_versoes (id, empresa_id)
        ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_orcamento_solicitacoes_versao
    ON orcamento_solicitacoes (versao_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_orcamento_solicitacoes_equipamento
    ON orcamento_solicitacoes (empresa_id, equipamento_id, id DESC);

-- Registro de cada correção de decisão feita pela equipe (nunca reescrito).
CREATE TABLE IF NOT EXISTS orcamento_correcoes (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL,
    equipamento_id INTEGER NOT NULL,
    status_anterior TEXT NOT NULL,
    motivo TEXT NOT NULL,
    estoque_devolvido BOOLEAN NOT NULL DEFAULT FALSE,
    quantidade_devolvida INTEGER NOT NULL DEFAULT 0,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    criado_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL,
    CONSTRAINT chk_orcamento_correcoes_quantidade CHECK (quantidade_devolvida >= 0),
    CONSTRAINT chk_orcamento_correcoes_motivo CHECK (char_length(btrim(motivo)) >= 5),
    CONSTRAINT fk_orcamento_correcoes_equipamento_empresa
        FOREIGN KEY (equipamento_id, empresa_id)
        REFERENCES equipamentos (id, empresa_id)
        ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_orcamento_correcoes_equipamento
    ON orcamento_correcoes (empresa_id, equipamento_id, id DESC);

CREATE OR REPLACE FUNCTION autoos_proteger_orcamento_solicitacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF pg_trigger_depth() <= 1 THEN
            RAISE EXCEPTION 'Mensagens do cliente sobre o orçamento não podem ser apagadas';
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.equipamento_id IS DISTINCT FROM OLD.equipamento_id
       OR NEW.versao_id IS DISTINCT FROM OLD.versao_id
       OR NEW.tipo IS DISTINCT FROM OLD.tipo
       OR NEW.mensagem IS DISTINCT FROM OLD.mensagem
       OR NEW.criado_em IS DISTINCT FROM OLD.criado_em
       OR (OLD.tratado_em IS NOT NULL AND NEW.tratado_em IS DISTINCT FROM OLD.tratado_em) THEN
        RAISE EXCEPTION 'Mensagem do cliente é imutável';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamento_solicitacoes_imutavel ON orcamento_solicitacoes;
CREATE TRIGGER trg_orcamento_solicitacoes_imutavel
    BEFORE UPDATE OR DELETE ON orcamento_solicitacoes
    FOR EACH ROW
    EXECUTE FUNCTION autoos_proteger_orcamento_solicitacao();

CREATE OR REPLACE FUNCTION autoos_proteger_orcamento_correcao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'O registro de correções do orçamento é imutável';
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamento_correcoes_imutavel ON orcamento_correcoes;
CREATE TRIGGER trg_orcamento_correcoes_imutavel
    BEFORE UPDATE OR DELETE ON orcamento_correcoes
    FOR EACH ROW
    EXECUTE FUNCTION autoos_proteger_orcamento_correcao();

-- Depois que a equipe aplica a resposta, a versão é encerrada mas o link continua válido
-- até expirar, para o cliente poder ver o resultado e pedir uma mudança.
CREATE OR REPLACE FUNCTION autoos_encerrar_orcamento_versoes(
    p_equipamento_id INTEGER,
    p_motivo TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    UPDATE public.orcamento_links_decisao l
    SET revogado_em = statement_timestamp(), revogado_motivo = p_motivo
    FROM public.orcamento_versoes v
    WHERE v.id = l.versao_id
      AND v.equipamento_id = p_equipamento_id
      AND v.encerrada_em IS NULL
      AND l.revogado_em IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.orcamento_respostas r
          WHERE r.versao_id = v.id AND r.aplicada_em IS NOT NULL
      );

    UPDATE public.orcamento_versoes
    SET encerrada_em = statement_timestamp(), encerrada_motivo = p_motivo
    WHERE equipamento_id = p_equipamento_id AND encerrada_em IS NULL;
END;
$$;

ALTER TABLE orcamento_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamento_correcoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE orcamento_solicitacoes FROM PUBLIC;
REVOKE ALL ON TABLE orcamento_correcoes FROM PUBLIC;

DROP POLICY IF EXISTS orcamento_solicitacoes_empresa ON orcamento_solicitacoes;
CREATE POLICY orcamento_solicitacoes_empresa ON orcamento_solicitacoes
    FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);

DROP POLICY IF EXISTS orcamento_correcoes_empresa ON orcamento_correcoes;
CREATE POLICY orcamento_correcoes_empresa ON orcamento_correcoes
    FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);

-- Estado público do link: ABERTO (aceita resposta) ou APLICADO (equipe já registrou a decisão).
-- Qualquer outro caso é LINK_INDISPONIVEL, com a mesma resposta para o cliente.
CREATE OR REPLACE FUNCTION public.autoos_estado_link_orcamento(p_token_hash TEXT)
RETURNS TABLE (
    o_link_id BIGINT,
    o_versao_id BIGINT,
    o_empresa_id INTEGER,
    o_equipamento_id INTEGER,
    o_estado TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_enabled BOOLEAN;
    v_link RECORD;
    v_versao RECORD;
    v_status TEXT;
    v_aplicada BOOLEAN;
    v_agora TIMESTAMPTZ := statement_timestamp();
BEGIN
    SELECT online_enabled INTO v_enabled
    FROM public.orcamento_aceite_config WHERE singleton = TRUE;
    IF NOT COALESCE(v_enabled, FALSE) THEN
        RAISE EXCEPTION 'ACEITE_PAUSADO';
    END IF;

    SELECT * INTO v_link FROM public.orcamento_links_decisao WHERE token_hash = p_token_hash;
    IF NOT FOUND OR v_link.revogado_em IS NOT NULL OR v_link.expira_em <= v_agora THEN
        RAISE EXCEPTION 'LINK_INDISPONIVEL';
    END IF;

    SELECT * INTO v_versao
    FROM public.orcamento_versoes
    WHERE id = v_link.versao_id AND empresa_id = v_link.empresa_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'LINK_INDISPONIVEL';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.orcamento_respostas r
        WHERE r.versao_id = v_versao.id AND r.aplicada_em IS NOT NULL
    ) INTO v_aplicada;

    IF v_aplicada THEN
        RETURN QUERY SELECT v_link.id, v_versao.id, v_link.empresa_id, v_link.equipamento_id, 'APLICADO'::TEXT;
        RETURN;
    END IF;

    SELECT status INTO v_status
    FROM public.equipamentos
    WHERE id = v_link.equipamento_id AND empresa_id = v_link.empresa_id;
    IF v_versao.encerrada_em IS NOT NULL
       OR (v_versao.valido_ate IS NOT NULL AND v_versao.valido_ate <= v_agora)
       OR v_status IS DISTINCT FROM 'AGUARDANDO_APROVACAO' THEN
        RAISE EXCEPTION 'LINK_INDISPONIVEL';
    END IF;

    RETURN QUERY SELECT v_link.id, v_versao.id, v_link.empresa_id, v_link.equipamento_id, 'ABERTO'::TEXT;
END;
$$;

-- Dados exibidos ao cliente: lista branca de campos da versão congelada.
CREATE OR REPLACE FUNCTION public.consultar_orcamento_decisao(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_estado RECORD;
    v_versao RECORD;
    v_janela INTEGER;
    v_resposta RECORD;
    v_servicos JSONB;
    v_pecas JSONB;
BEGIN
    SELECT * INTO v_estado FROM public.autoos_estado_link_orcamento(p_token_hash);
    SELECT * INTO v_versao FROM public.orcamento_versoes WHERE id = v_estado.o_versao_id;
    SELECT janela_correcao_minutos INTO v_janela
    FROM public.orcamento_aceite_config WHERE singleton = TRUE;

    SELECT r.id, r.decisao, r.registrada_em, r.aplicada_em INTO v_resposta
    FROM public.orcamento_respostas r
    WHERE r.versao_id = v_versao.id
    ORDER BY (CASE WHEN v_estado.o_estado = 'APLICADO' THEN r.aplicada_em IS NOT NULL ELSE TRUE END) DESC,
             r.id DESC
    LIMIT 1;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'descricao', left(COALESCE(s->>'descricao', ''), 200),
        'valor', COALESCE((s->>'valor')::NUMERIC, 0),
        'pecas', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'nome', left(COALESCE(p->>'nome', 'Peça'), 120),
                'quantidade', COALESCE((p->>'quantidade')::INTEGER, 0),
                'valorUnitario', COALESCE((p->>'valor_unitario')::NUMERIC, 0)
            ))
            FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(s->'pecas') = 'array' THEN s->'pecas' ELSE '[]'::JSONB END
            ) p
        ), '[]'::JSONB)
    )), '[]'::JSONB)
    INTO v_servicos
    FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_versao.snapshot->'servicos') = 'array'
             THEN v_versao.snapshot->'servicos' ELSE '[]'::JSONB END
    ) s;

    -- Orçamentos antigos sem serviços detalhados mostram só a lista de peças e o total.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'nome', left(COALESCE(p->>'nome', 'Peça'), 120),
        'quantidade', COALESCE((p->>'quantidade')::INTEGER, 0),
        'valorTotal', COALESCE((p->>'valorTotal')::NUMERIC, 0)
    )), '[]'::JSONB)
    INTO v_pecas
    FROM jsonb_array_elements(
        CASE WHEN jsonb_array_length(v_servicos) = 0 AND jsonb_typeof(v_versao.snapshot->'pecas') = 'array'
             THEN v_versao.snapshot->'pecas' ELSE '[]'::JSONB END
    ) p;

    UPDATE public.orcamento_links_decisao
    SET ultimo_acesso_em = statement_timestamp() WHERE id = v_estado.o_link_id;

    RETURN jsonb_build_object(
        'estado', v_estado.o_estado,
        'versao', v_versao.versao,
        'equipamento', left(btrim(concat_ws(' ',
            v_versao.snapshot->'equipamento'->>'tipo',
            v_versao.snapshot->'equipamento'->>'marca',
            v_versao.snapshot->'equipamento'->>'modelo')), 180),
        'valorTotal', v_versao.valor_total,
        'validoAte', v_versao.valido_ate,
        'servicos', v_servicos,
        'pecas', v_pecas,
        'janelaMinutos', COALESCE(v_janela, 15),
        'resposta', CASE WHEN v_resposta.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', v_resposta.id,
            'decisao', v_resposta.decisao,
            'registradaEm', v_resposta.registrada_em,
            'janelaAte', v_resposta.registrada_em + make_interval(mins => COALESCE(v_janela, 15)),
            'aplicada', v_resposta.aplicada_em IS NOT NULL
        ) END
    );
END;
$$;

-- Dúvida (link aberto) ou pedido de mudança (decisão já aplicada). No máximo 5 por hora e versão.
CREATE OR REPLACE FUNCTION public.registrar_solicitacao_orcamento(
    p_token_hash TEXT,
    p_tipo TEXT,
    p_mensagem TEXT
)
RETURNS TABLE (solicitacao_id BIGINT, criado_em TIMESTAMPTZ)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_estado RECORD;
    v_mensagem TEXT := btrim(regexp_replace(COALESCE(p_mensagem, ''), '[[:cntrl:]]', ' ', 'g'));
    v_id BIGINT;
    v_agora TIMESTAMPTZ := statement_timestamp();
BEGIN
    IF p_tipo NOT IN ('DUVIDA', 'MUDANCA') THEN
        RAISE EXCEPTION 'TIPO_INVALIDO';
    END IF;
    IF char_length(v_mensagem) NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION 'MENSAGEM_INVALIDA';
    END IF;

    SELECT * INTO v_estado FROM public.autoos_estado_link_orcamento(p_token_hash);
    IF (p_tipo = 'DUVIDA' AND v_estado.o_estado <> 'ABERTO')
       OR (p_tipo = 'MUDANCA' AND v_estado.o_estado <> 'APLICADO') THEN
        RAISE EXCEPTION 'LINK_INDISPONIVEL';
    END IF;

    PERFORM 1 FROM public.orcamento_versoes WHERE id = v_estado.o_versao_id FOR UPDATE;
    IF (SELECT count(*) FROM public.orcamento_solicitacoes s
        WHERE s.versao_id = v_estado.o_versao_id AND s.criado_em > v_agora - INTERVAL '1 hour') >= 5 THEN
        RAISE EXCEPTION 'LIMITE_SOLICITACOES';
    END IF;

    INSERT INTO public.orcamento_solicitacoes
        (empresa_id, equipamento_id, versao_id, link_id, tipo, mensagem, criado_em)
    VALUES
        (v_estado.o_empresa_id, v_estado.o_equipamento_id, v_estado.o_versao_id, v_estado.o_link_id,
         p_tipo, v_mensagem, v_agora)
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, v_agora;
END;
$$;

REVOKE ALL ON FUNCTION public.autoos_estado_link_orcamento(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consultar_orcamento_decisao(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_solicitacao_orcamento(TEXT, TEXT, TEXT) FROM PUBLIC;

DO $$
DECLARE
    v_role TEXT;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE public.orcamento_solicitacoes FROM %I', v_role);
            EXECUTE format('REVOKE ALL ON TABLE public.orcamento_correcoes FROM %I', v_role);
            EXECUTE format('REVOKE ALL ON FUNCTION public.autoos_estado_link_orcamento(TEXT) FROM %I', v_role);
            EXECUTE format('REVOKE ALL ON FUNCTION public.consultar_orcamento_decisao(TEXT) FROM %I', v_role);
            EXECUTE format('REVOKE ALL ON FUNCTION public.registrar_solicitacao_orcamento(TEXT, TEXT, TEXT) FROM %I', v_role);
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.autoos_estado_link_orcamento(TEXT) TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.consultar_orcamento_decisao(TEXT) TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.registrar_solicitacao_orcamento(TEXT, TEXT, TEXT) TO service_role';
    END IF;
END;
$$;

-- As funções do aceite rodam com os privilégios do dono (SECURITY DEFINER), porque
-- SELECT ... FOR UPDATE/SHARE exige UPDATE. Elas são a única porta do service_role:
-- os grants diretos de tabela da 0030 deixam de ser necessários e são retirados.
ALTER FUNCTION public.registrar_resposta_orcamento(TEXT, TEXT, BIGINT) SECURITY DEFINER;
ALTER FUNCTION public.registrar_resposta_orcamento(TEXT, TEXT, BIGINT) SET search_path = pg_catalog, public;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.orcamento_versoes FROM service_role';
        EXECUTE 'REVOKE ALL ON TABLE public.orcamento_links_decisao FROM service_role';
        EXECUTE 'REVOKE ALL ON TABLE public.orcamento_respostas FROM service_role';
        EXECUTE 'REVOKE ALL ON TABLE public.orcamento_aceite_config FROM service_role';
        EXECUTE 'REVOKE ALL ON SEQUENCE public.orcamento_respostas_id_seq FROM service_role';
    END IF;
END;
$$;
