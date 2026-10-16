-- Aceite online de orçamento (fase 1: banco e desktop).
-- A resposta do cliente é registrada, mas só a equipe altera status, pagamento e estoque.
-- O aceite online nasce desligado (`orcamento_aceite_config.online_enabled = FALSE`),
-- separado da chave `status_portal_config.public_enabled` do acompanhamento.

-- Versão congelada do orçamento enviada ao cliente. O cliente só decide sobre o que viu.
CREATE TABLE IF NOT EXISTS orcamento_versoes (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL,
    equipamento_id INTEGER NOT NULL,
    verificacao_id INTEGER,
    versao INTEGER NOT NULL,
    snapshot JSONB NOT NULL,
    valor_total NUMERIC(14, 2) NOT NULL,
    valido_ate TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    criado_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL,
    encerrada_em TIMESTAMPTZ,
    encerrada_motivo TEXT,
    CONSTRAINT uq_orcamento_versoes_numero UNIQUE (equipamento_id, versao),
    CONSTRAINT uq_orcamento_versoes_id_empresa UNIQUE (id, empresa_id),
    CONSTRAINT chk_orcamento_versoes_valor CHECK (valor_total >= 0),
    CONSTRAINT chk_orcamento_versoes_encerramento
        CHECK ((encerrada_em IS NULL) = (encerrada_motivo IS NULL)),
    CONSTRAINT fk_orcamento_versoes_equipamento_empresa
        FOREIGN KEY (equipamento_id, empresa_id)
        REFERENCES equipamentos (id, empresa_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orcamento_versoes_abertas
    ON orcamento_versoes (empresa_id, equipamento_id, versao DESC)
    WHERE encerrada_em IS NULL;

-- Link próprio da decisão. O token nunca é guardado, apenas seu hash SHA-256,
-- e não se confunde com o link de acompanhamento (`links_status_publico`).
CREATE TABLE IF NOT EXISTS orcamento_links_decisao (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL,
    equipamento_id INTEGER NOT NULL,
    versao_id BIGINT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em TIMESTAMPTZ NOT NULL,
    revogado_em TIMESTAMPTZ,
    revogado_motivo TEXT,
    criado_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL,
    revogado_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL,
    ultimo_acesso_em TIMESTAMPTZ,
    CONSTRAINT chk_orcamento_links_decisao_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT chk_orcamento_links_decisao_expiracao CHECK (expira_em > criado_em),
    CONSTRAINT chk_orcamento_links_decisao_revogacao
        CHECK ((revogado_em IS NULL) = (revogado_motivo IS NULL)),
    CONSTRAINT fk_orcamento_links_decisao_versao
        FOREIGN KEY (versao_id, empresa_id)
        REFERENCES orcamento_versoes (id, empresa_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orcamento_links_decisao_equipamento
    ON orcamento_links_decisao (empresa_id, equipamento_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_orcamento_links_decisao_ativos
    ON orcamento_links_decisao (versao_id)
    WHERE revogado_em IS NULL;

-- Histórico somente de acréscimo. A resposta vigente é a de maior id da versão;
-- nenhuma mudança apaga a anterior. Só as colunas `aplicada_*` podem ser preenchidas depois.
CREATE TABLE IF NOT EXISTS orcamento_respostas (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL,
    equipamento_id INTEGER NOT NULL,
    versao_id BIGINT NOT NULL,
    link_id BIGINT REFERENCES orcamento_links_decisao(id) ON DELETE SET NULL,
    origem TEXT NOT NULL,
    decisao TEXT NOT NULL,
    registrada_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    registrada_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL,
    motivo TEXT,
    aplicada_em TIMESTAMPTZ,
    aplicada_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL,
    CONSTRAINT chk_orcamento_respostas_origem CHECK (origem IN ('PORTAL', 'EQUIPE')),
    CONSTRAINT chk_orcamento_respostas_decisao
        CHECK (decisao IN ('APROVAR', 'RECUSAR', 'DESFEITA')),
    CONSTRAINT chk_orcamento_respostas_portal_link
        CHECK (origem <> 'PORTAL' OR link_id IS NOT NULL OR decisao = 'DESFEITA'),
    CONSTRAINT chk_orcamento_respostas_equipe_perfil
        CHECK (origem <> 'EQUIPE' OR registrada_por_profile_id IS NOT NULL),
    CONSTRAINT fk_orcamento_respostas_versao
        FOREIGN KEY (versao_id, empresa_id)
        REFERENCES orcamento_versoes (id, empresa_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orcamento_respostas_versao
    ON orcamento_respostas (versao_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_orcamento_respostas_equipamento
    ON orcamento_respostas (empresa_id, equipamento_id, id DESC);

-- Chave de ativação separada do acompanhamento. A janela de correção tem piso de 15 minutos.
CREATE TABLE IF NOT EXISTS public.orcamento_aceite_config (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    online_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    janela_correcao_minutos INTEGER NOT NULL DEFAULT 15
        CHECK (janela_correcao_minutos BETWEEN 15 AND 1440),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO public.orcamento_aceite_config (singleton, online_enabled)
VALUES (TRUE, FALSE)
ON CONFLICT (singleton) DO NOTHING;

-- Versão congelada: o conteúdo nunca muda; só o encerramento pode ser gravado.
CREATE OR REPLACE FUNCTION autoos_proteger_orcamento_versao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- A exclusão do equipamento remove as versões por cascata; exclusão direta não.
        IF pg_trigger_depth() <= 1 THEN
            RAISE EXCEPTION 'Versões de orçamento enviadas ao cliente não podem ser apagadas';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.equipamento_id IS DISTINCT FROM OLD.equipamento_id
       OR NEW.verificacao_id IS DISTINCT FROM OLD.verificacao_id
       OR NEW.versao IS DISTINCT FROM OLD.versao
       OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
       OR NEW.valor_total IS DISTINCT FROM OLD.valor_total
       OR NEW.valido_ate IS DISTINCT FROM OLD.valido_ate
       OR NEW.criado_em IS DISTINCT FROM OLD.criado_em
       OR (OLD.encerrada_em IS NOT NULL
           AND (NEW.encerrada_em IS DISTINCT FROM OLD.encerrada_em
                OR NEW.encerrada_motivo IS DISTINCT FROM OLD.encerrada_motivo)) THEN
        RAISE EXCEPTION 'Versão de orçamento é imutável';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamento_versoes_imutavel ON orcamento_versoes;
CREATE TRIGGER trg_orcamento_versoes_imutavel
    BEFORE UPDATE OR DELETE ON orcamento_versoes
    FOR EACH ROW
    EXECUTE FUNCTION autoos_proteger_orcamento_versao();

-- Histórico de respostas: sem apagar e sem reescrever; apenas marcar a aplicação.
CREATE OR REPLACE FUNCTION autoos_proteger_orcamento_resposta()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF pg_trigger_depth() <= 1 THEN
            RAISE EXCEPTION 'O histórico de respostas do orçamento não pode ser apagado';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.equipamento_id IS DISTINCT FROM OLD.equipamento_id
       OR NEW.versao_id IS DISTINCT FROM OLD.versao_id
       OR NEW.origem IS DISTINCT FROM OLD.origem
       OR NEW.decisao IS DISTINCT FROM OLD.decisao
       OR NEW.registrada_em IS DISTINCT FROM OLD.registrada_em
       OR NEW.registrada_por_profile_id IS DISTINCT FROM OLD.registrada_por_profile_id
       OR NEW.motivo IS DISTINCT FROM OLD.motivo
       OR (OLD.aplicada_em IS NOT NULL
           AND NEW.aplicada_em IS DISTINCT FROM OLD.aplicada_em) THEN
        RAISE EXCEPTION 'Resposta de orçamento é imutável';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamento_respostas_imutavel ON orcamento_respostas;
CREATE TRIGGER trg_orcamento_respostas_imutavel
    BEFORE UPDATE OR DELETE ON orcamento_respostas
    FOR EACH ROW
    EXECUTE FUNCTION autoos_proteger_orcamento_resposta();

-- Editar o orçamento, a verificação ou a etapa do equipamento invalida versões e links antigos.
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
      AND l.revogado_em IS NULL;

    UPDATE public.orcamento_versoes
    SET encerrada_em = statement_timestamp(), encerrada_motivo = p_motivo
    WHERE equipamento_id = p_equipamento_id AND encerrada_em IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION autoos_encerrar_orcamento_por_equipamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM public.autoos_encerrar_orcamento_versoes(NEW.id, 'ETAPA_ALTERADA');
    ELSIF NEW.valor_orcamento IS DISTINCT FROM OLD.valor_orcamento
          OR NEW.prazo_aprovacao IS DISTINCT FROM OLD.prazo_aprovacao THEN
        PERFORM public.autoos_encerrar_orcamento_versoes(NEW.id, 'ORCAMENTO_ALTERADO');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_equipamentos_encerrar_orcamento ON equipamentos;
CREATE TRIGGER trg_equipamentos_encerrar_orcamento
    AFTER UPDATE OF status, valor_orcamento, prazo_aprovacao ON equipamentos
    FOR EACH ROW
    EXECUTE FUNCTION autoos_encerrar_orcamento_por_equipamento();

CREATE OR REPLACE FUNCTION autoos_encerrar_orcamento_por_verificacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.servicos_necessarios IS DISTINCT FROM OLD.servicos_necessarios
       OR NEW.pecas_necessarias IS DISTINCT FROM OLD.pecas_necessarias
       OR NEW.custo_total IS DISTINCT FROM OLD.custo_total THEN
        PERFORM public.autoos_encerrar_orcamento_versoes(NEW.equipamento_id, 'ORCAMENTO_ALTERADO');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verificacoes_encerrar_orcamento ON verificacoes;
CREATE TRIGGER trg_verificacoes_encerrar_orcamento
    AFTER UPDATE OF servicos_necessarios, pecas_necessarias, custo_total ON verificacoes
    FOR EACH ROW
    EXECUTE FUNCTION autoos_encerrar_orcamento_por_verificacao();

-- Registro atômico da resposta do cliente. Uma única operação confere chave, link,
-- versão, etapa, resposta vigente e janela; toque duplo ou dois aparelhos não duplicam decisões.
-- `p_resposta_vigente_id` é o id da resposta que o cliente via (0 = nenhuma). Se mudou,
-- a chamada falha com `RESPOSTA_DESATUALIZADA` e a página deve recarregar.
CREATE OR REPLACE FUNCTION public.registrar_resposta_orcamento(
    p_token_hash TEXT,
    p_decisao TEXT,
    p_resposta_vigente_id BIGINT
)
RETURNS TABLE (
    resposta_id BIGINT,
    decisao TEXT,
    registrada_em TIMESTAMPTZ,
    janela_ate TIMESTAMPTZ,
    repetida BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_config RECORD;
    v_link RECORD;
    v_versao RECORD;
    v_status TEXT;
    v_atual RECORD;
    v_novo_id BIGINT;
    v_agora TIMESTAMPTZ := statement_timestamp();
BEGIN
    IF p_decisao NOT IN ('APROVAR', 'RECUSAR', 'DESFEITA') THEN
        RAISE EXCEPTION 'DECISAO_INVALIDA';
    END IF;

    SELECT online_enabled, janela_correcao_minutos INTO v_config
    FROM public.orcamento_aceite_config WHERE singleton = TRUE FOR SHARE;
    IF NOT COALESCE(v_config.online_enabled, FALSE) THEN
        RAISE EXCEPTION 'ACEITE_PAUSADO';
    END IF;

    SELECT * INTO v_link
    FROM public.orcamento_links_decisao
    WHERE token_hash = p_token_hash
    FOR UPDATE;
    IF NOT FOUND OR v_link.revogado_em IS NOT NULL OR v_link.expira_em <= v_agora THEN
        RAISE EXCEPTION 'LINK_INDISPONIVEL';
    END IF;

    SELECT * INTO v_versao
    FROM public.orcamento_versoes
    WHERE id = v_link.versao_id AND empresa_id = v_link.empresa_id
    FOR UPDATE;
    IF NOT FOUND OR v_versao.encerrada_em IS NOT NULL
       OR (v_versao.valido_ate IS NOT NULL AND v_versao.valido_ate <= v_agora) THEN
        RAISE EXCEPTION 'LINK_INDISPONIVEL';
    END IF;

    SELECT status INTO v_status
    FROM public.equipamentos
    WHERE id = v_link.equipamento_id AND empresa_id = v_link.empresa_id
    FOR SHARE;
    IF v_status IS DISTINCT FROM 'AGUARDANDO_APROVACAO' THEN
        RAISE EXCEPTION 'LINK_INDISPONIVEL';
    END IF;

    SELECT r.id, r.decisao, r.registrada_em, r.aplicada_em INTO v_atual
    FROM public.orcamento_respostas r
    WHERE r.versao_id = v_versao.id
    ORDER BY r.id DESC
    LIMIT 1;

    IF FOUND AND v_atual.aplicada_em IS NOT NULL THEN
        RAISE EXCEPTION 'RESPOSTA_JA_APLICADA';
    END IF;
    IF COALESCE(v_atual.id, 0) <> COALESCE(p_resposta_vigente_id, 0) THEN
        -- Toque duplo: o mesmo pedido chegando de novo devolve a resposta já gravada.
        IF FOUND AND v_atual.decisao = p_decisao
           AND v_atual.registrada_em > v_agora - INTERVAL '1 minute' THEN
            RETURN QUERY SELECT v_atual.id, v_atual.decisao, v_atual.registrada_em,
                v_atual.registrada_em + make_interval(mins => v_config.janela_correcao_minutos),
                TRUE;
            RETURN;
        END IF;
        RAISE EXCEPTION 'RESPOSTA_DESATUALIZADA';
    END IF;
    IF p_decisao = 'DESFEITA' AND (NOT FOUND OR v_atual.decisao = 'DESFEITA') THEN
        RAISE EXCEPTION 'NADA_A_DESFAZER';
    END IF;
    IF FOUND AND v_atual.decisao = p_decisao THEN
        RETURN QUERY SELECT v_atual.id, v_atual.decisao, v_atual.registrada_em,
            v_atual.registrada_em + make_interval(mins => v_config.janela_correcao_minutos),
            TRUE;
        RETURN;
    END IF;

    INSERT INTO public.orcamento_respostas
        (empresa_id, equipamento_id, versao_id, link_id, origem, decisao, registrada_em)
    VALUES
        (v_link.empresa_id, v_link.equipamento_id, v_versao.id, v_link.id, 'PORTAL',
         p_decisao, v_agora)
    RETURNING id INTO v_novo_id;

    UPDATE public.orcamento_links_decisao
    SET ultimo_acesso_em = v_agora WHERE id = v_link.id;

    RETURN QUERY SELECT v_novo_id, p_decisao, v_agora,
        v_agora + make_interval(mins => v_config.janela_correcao_minutos), FALSE;
END;
$$;

-- RLS e privilégios: o navegador nunca acessa as tabelas; a futura função de servidor
-- (fase 2) usa a chave privilegiada e apenas o necessário.
ALTER TABLE orcamento_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamento_links_decisao ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamento_respostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_aceite_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE orcamento_versoes FROM PUBLIC;
REVOKE ALL ON TABLE orcamento_links_decisao FROM PUBLIC;
REVOKE ALL ON TABLE orcamento_respostas FROM PUBLIC;
REVOKE ALL ON TABLE public.orcamento_aceite_config FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_resposta_orcamento(TEXT, TEXT, BIGINT) FROM PUBLIC;

DROP POLICY IF EXISTS orcamento_versoes_empresa ON orcamento_versoes;
CREATE POLICY orcamento_versoes_empresa ON orcamento_versoes
    FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);

DROP POLICY IF EXISTS orcamento_links_decisao_empresa ON orcamento_links_decisao;
CREATE POLICY orcamento_links_decisao_empresa ON orcamento_links_decisao
    FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);

DROP POLICY IF EXISTS orcamento_respostas_empresa ON orcamento_respostas;
CREATE POLICY orcamento_respostas_empresa ON orcamento_respostas
    FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);

DO $$
DECLARE
    v_role TEXT;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE public.orcamento_versoes FROM %I', v_role);
            EXECUTE format('REVOKE ALL ON TABLE public.orcamento_links_decisao FROM %I', v_role);
            EXECUTE format('REVOKE ALL ON TABLE public.orcamento_respostas FROM %I', v_role);
            EXECUTE format('REVOKE ALL ON TABLE public.orcamento_aceite_config FROM %I', v_role);
            EXECUTE format(
                'REVOKE ALL ON FUNCTION public.registrar_resposta_orcamento(TEXT, TEXT, BIGINT) FROM %I',
                v_role
            );
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT SELECT ON TABLE public.orcamento_versoes TO service_role';
        EXECUTE 'GRANT SELECT ON TABLE public.orcamento_links_decisao TO service_role';
        EXECUTE 'GRANT UPDATE (ultimo_acesso_em) ON TABLE public.orcamento_links_decisao TO service_role';
        EXECUTE 'GRANT SELECT, INSERT ON TABLE public.orcamento_respostas TO service_role';
        EXECUTE 'GRANT USAGE ON SEQUENCE public.orcamento_respostas_id_seq TO service_role';
        EXECUTE 'GRANT SELECT ON TABLE public.orcamento_aceite_config TO service_role';
        EXECUTE 'GRANT SELECT (id, empresa_id, status) ON TABLE public.equipamentos TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.registrar_resposta_orcamento(TEXT, TEXT, BIGINT) TO service_role';
    END IF;
END;
$$;
