-- Portal das Impressoras do Cliente.
--
-- O cliente entra com CPF/CNPJ + código temporário enviado ao WhatsApp ou email de um contato
-- autorizado, vê todos os atendimentos vinculados ao cadastro e responde ao orçamento publicado.
-- A resposta fica 15 minutos (mínimo) em prazo de correção; depois o servidor a efetiva com as
-- mesmas regras de `aprovar_orcamento` (pagamento, concorrência e estoque) numa transação.
--
-- Tudo nasce desligado (`portal_cliente_config.portal_enabled = FALSE`). As decisões ainda
-- dependem de `orcamento_aceite_config.online_enabled` (0030). As 0030–0033 não são alteradas.

-- ─── Acesso dos contatos ─────────────────────────────────────────────────────
-- NENHUM: sem portal. ACOMPANHAR: vê status e orçamento. DECIDIR: também responde ao orçamento.
ALTER TABLE cliente_contatos
    ADD COLUMN IF NOT EXISTS portal_acesso TEXT NOT NULL DEFAULT 'NENHUM';
DO $$ BEGIN
    ALTER TABLE cliente_contatos ADD CONSTRAINT chk_cliente_contatos_portal_acesso
        CHECK (portal_acesso IN ('NENHUM', 'ACOMPANHAR', 'DECIDIR'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ordenação por atividade recente sem mexer em `atualizado_em`, que é o token de concorrência.
ALTER TABLE equipamentos
    ADD COLUMN IF NOT EXISTS ultima_atividade_cliente_em TIMESTAMP;

-- ─── Configuração ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_cliente_config (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    portal_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    codigo_validade_minutos INTEGER NOT NULL DEFAULT 10 CHECK (codigo_validade_minutos BETWEEN 3 AND 30),
    codigo_max_tentativas INTEGER NOT NULL DEFAULT 5 CHECK (codigo_max_tentativas BETWEEN 3 AND 10),
    reverificacao_minutos INTEGER NOT NULL DEFAULT 10 CHECK (reverificacao_minutos BETWEEN 5 AND 60),
    sessao_horas INTEGER NOT NULL DEFAULT 12 CHECK (sessao_horas BETWEEN 1 AND 72),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO public.portal_cliente_config (singleton) VALUES (TRUE) ON CONFLICT (singleton) DO NOTHING;

-- Cartão de contato exibido ao cliente (sem segredos).
CREATE TABLE IF NOT EXISTS portal_contato_empresa (
    empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    nome_exibicao TEXT NOT NULL DEFAULT 'BMI TAG',
    whatsapp TEXT,
    email TEXT,
    telefone TEXT,
    horario TEXT,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_portal_contato_whatsapp CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]{10,15}$'),
    CONSTRAINT chk_portal_contato_textos CHECK (
        char_length(nome_exibicao) BETWEEN 1 AND 80
        AND char_length(COALESCE(email, '')) <= 120
        AND char_length(COALESCE(telefone, '')) <= 40
        AND char_length(COALESCE(horario, '')) <= 120
    )
);

-- ─── Códigos e sessões ───────────────────────────────────────────────────────
-- O código nunca é gravado: só um HMAC calculado no servidor com segredo fora do banco.
CREATE TABLE IF NOT EXISTS portal_codigos (
    id BIGSERIAL PRIMARY KEY,
    desafio_ref UUID NOT NULL UNIQUE,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    contato_id INTEGER NOT NULL REFERENCES cliente_contatos(id) ON DELETE CASCADE,
    canal TEXT NOT NULL,
    destino_mascarado TEXT NOT NULL,
    codigo_hash TEXT NOT NULL,
    sessao_id BIGINT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em TIMESTAMPTZ NOT NULL,
    entrega_estado TEXT NOT NULL DEFAULT 'PENDENTE',
    entrega_erro TEXT,
    tentativas INTEGER NOT NULL DEFAULT 0,
    usado_em TIMESTAMPTZ,
    invalidado_em TIMESTAMPTZ,
    CONSTRAINT chk_portal_codigos_canal CHECK (canal IN ('WHATSAPP', 'EMAIL')),
    CONSTRAINT chk_portal_codigos_hash CHECK (codigo_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT chk_portal_codigos_entrega CHECK (entrega_estado IN ('PENDENTE', 'ENVIADO', 'FALHOU')),
    CONSTRAINT chk_portal_codigos_erro CHECK (char_length(COALESCE(entrega_erro, '')) <= 300),
    CONSTRAINT chk_portal_codigos_tentativas CHECK (tentativas >= 0)
);
CREATE INDEX IF NOT EXISTS idx_portal_codigos_contato ON portal_codigos (contato_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS portal_sessoes (
    id BIGSERIAL PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    contato_id INTEGER NOT NULL REFERENCES cliente_contatos(id) ON DELETE CASCADE,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em TIMESTAMPTZ NOT NULL,
    verificada_em TIMESTAMPTZ NOT NULL,
    ultimo_acesso_em TIMESTAMPTZ,
    encerrada_em TIMESTAMPTZ,
    encerrada_motivo TEXT,
    CONSTRAINT chk_portal_sessoes_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT chk_portal_sessoes_expiracao CHECK (expira_em > criada_em)
);
CREATE INDEX IF NOT EXISTS idx_portal_sessoes_contato ON portal_sessoes (contato_id) WHERE encerrada_em IS NULL;

-- ─── Respostas e mensagens atribuídas ao contato ────────────────────────────
ALTER TABLE orcamento_respostas
    ADD COLUMN IF NOT EXISTS contato_id INTEGER REFERENCES cliente_contatos(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS contato_nome TEXT,
    ADD COLUMN IF NOT EXISTS sessao_id BIGINT REFERENCES portal_sessoes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS aplicada_pelo_sistema BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS efetivacao_tentativas INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS efetivacao_erro TEXT,
    ADD COLUMN IF NOT EXISTS efetivacao_falhou_em TIMESTAMPTZ;

ALTER TABLE orcamento_respostas DROP CONSTRAINT IF EXISTS chk_orcamento_respostas_origem;
ALTER TABLE orcamento_respostas ADD CONSTRAINT chk_orcamento_respostas_origem
    CHECK (origem IN ('PORTAL', 'EQUIPE', 'PORTAL_CLIENTE'));
DO $$ BEGIN
    ALTER TABLE orcamento_respostas ADD CONSTRAINT chk_orcamento_respostas_portal_cliente
        CHECK (origem <> 'PORTAL_CLIENTE' OR contato_nome IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE orcamento_respostas ADD CONSTRAINT chk_orcamento_respostas_efetivacao_erro
        CHECK (char_length(COALESCE(efetivacao_erro, '')) <= 300);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Imutabilidade ampliada: quem respondeu também não pode ser reescrito.
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
       OR NEW.contato_nome IS DISTINCT FROM OLD.contato_nome
       OR (OLD.contato_id IS NOT NULL AND NEW.contato_id IS NOT NULL AND NEW.contato_id <> OLD.contato_id)
       OR (OLD.aplicada_em IS NOT NULL
           AND (NEW.aplicada_em IS DISTINCT FROM OLD.aplicada_em
                OR NEW.aplicada_pelo_sistema IS DISTINCT FROM OLD.aplicada_pelo_sistema)) THEN
        RAISE EXCEPTION 'Resposta de orçamento é imutável';
    END IF;
    RETURN NEW;
END;
$$;

ALTER TABLE orcamento_solicitacoes
    ADD COLUMN IF NOT EXISTS contato_id INTEGER REFERENCES cliente_contatos(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS contato_nome TEXT;
ALTER TABLE orcamento_solicitacoes DROP CONSTRAINT IF EXISTS chk_orcamento_solicitacoes_tipo;
ALTER TABLE orcamento_solicitacoes ADD CONSTRAINT chk_orcamento_solicitacoes_tipo
    CHECK (tipo IN ('DUVIDA', 'MUDANCA', 'NEGOCIAR'));

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
       OR NEW.contato_nome IS DISTINCT FROM OLD.contato_nome
       OR (OLD.tratado_em IS NOT NULL AND NEW.tratado_em IS DISTINCT FROM OLD.tratado_em) THEN
        RAISE EXCEPTION 'Mensagem do cliente é imutável';
    END IF;
    RETURN NEW;
END;
$$;

-- ─── Alertas internos ────────────────────────────────────────────────────────
-- Persistentes, com leitura e histórico. Não dependem de WhatsApp nem do app aberto.
CREATE TABLE IF NOT EXISTS portal_alertas (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    equipamento_id INTEGER,
    tipo TEXT NOT NULL,
    resposta_id BIGINT REFERENCES orcamento_respostas(id) ON DELETE SET NULL,
    solicitacao_id BIGINT REFERENCES orcamento_solicitacoes(id) ON DELETE SET NULL,
    contato_id INTEGER REFERENCES cliente_contatos(id) ON DELETE SET NULL,
    titulo TEXT NOT NULL,
    detalhe TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lido_em TIMESTAMPTZ,
    lido_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL,
    CONSTRAINT chk_portal_alertas_tipo CHECK (tipo IN (
        'RESPOSTA_RECEBIDA', 'RESPOSTA_ALTERADA', 'RESPOSTA_CANCELADA',
        'DECISAO_EFETIVADA', 'EFETIVACAO_FALHOU',
        'NEGOCIACAO_SOLICITADA', 'CORRECAO_SOLICITADA', 'DUVIDA_RECEBIDA',
        'CODIGO_NAO_ENTREGUE'
    )),
    CONSTRAINT chk_portal_alertas_textos CHECK (
        char_length(titulo) BETWEEN 1 AND 200 AND char_length(COALESCE(detalhe, '')) <= 600
    ),
    CONSTRAINT fk_portal_alertas_equipamento
        FOREIGN KEY (equipamento_id, empresa_id) REFERENCES equipamentos (id, empresa_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_portal_alertas_empresa ON portal_alertas (empresa_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_portal_alertas_nao_lidos ON portal_alertas (empresa_id, id DESC) WHERE lido_em IS NULL;
-- Um alerta de efetivação por resposta (o processador pode rodar várias vezes).
CREATE UNIQUE INDEX IF NOT EXISTS ux_portal_alertas_resposta_tipo
    ON portal_alertas (resposta_id, tipo)
    WHERE resposta_id IS NOT NULL AND tipo IN ('DECISAO_EFETIVADA', 'EFETIVACAO_FALHOU');

CREATE OR REPLACE FUNCTION autoos_proteger_portal_alerta()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF pg_trigger_depth() <= 1 THEN
            RAISE EXCEPTION 'Alertas do portal não podem ser apagados';
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.equipamento_id IS DISTINCT FROM OLD.equipamento_id
       OR NEW.tipo IS DISTINCT FROM OLD.tipo
       OR NEW.titulo IS DISTINCT FROM OLD.titulo
       OR NEW.detalhe IS DISTINCT FROM OLD.detalhe
       OR NEW.criado_em IS DISTINCT FROM OLD.criado_em
       OR (OLD.lido_em IS NOT NULL AND NEW.lido_em IS DISTINCT FROM OLD.lido_em) THEN
        RAISE EXCEPTION 'Alerta do portal é imutável; só a leitura pode ser registrada';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_portal_alertas_imutavel ON portal_alertas;
CREATE TRIGGER trg_portal_alertas_imutavel
    BEFORE UPDATE OR DELETE ON portal_alertas
    FOR EACH ROW EXECUTE FUNCTION autoos_proteger_portal_alerta();

-- Trocar telefone/email, inativar o contato ou mudar o cliente retira o acesso e encerra as
-- sessões: o código passaria a ir para outro destino sem que ninguém reautorizasse.
CREATE OR REPLACE FUNCTION autoos_portal_revisar_acesso_contato()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF OLD.portal_acesso <> 'NENHUM'
       AND (NEW.telefone IS DISTINCT FROM OLD.telefone
            OR NEW.email IS DISTINCT FROM OLD.email
            OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
            OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
            OR NOT NEW.ativo) THEN
        NEW.portal_acesso := 'NENHUM';
    END IF;
    IF NEW.portal_acesso IS DISTINCT FROM OLD.portal_acesso THEN
        UPDATE public.portal_sessoes
        SET encerrada_em = statement_timestamp(), encerrada_motivo = 'ACESSO_ALTERADO'
        WHERE contato_id = NEW.id AND encerrada_em IS NULL;
        UPDATE public.portal_codigos
        SET invalidado_em = statement_timestamp()
        WHERE contato_id = NEW.id AND usado_em IS NULL AND invalidado_em IS NULL;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_cliente_contatos_portal_acesso ON cliente_contatos;
CREATE TRIGGER trg_cliente_contatos_portal_acesso
    BEFORE UPDATE ON cliente_contatos
    FOR EACH ROW EXECUTE FUNCTION autoos_portal_revisar_acesso_contato();

-- ─── Auxiliares ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.autoos_portal_digitos(p_valor TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$ SELECT regexp_replace(COALESCE(p_valor, ''), '[^0-9]', '', 'g') $$;

-- Telefones comparados sem DDI 55 (o cliente pode digitar com ou sem).
CREATE OR REPLACE FUNCTION public.autoos_portal_telefone(p_valor TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
    SELECT CASE
        WHEN length(d) IN (12, 13) AND left(d, 2) = '55' THEN substr(d, 3)
        ELSE d
    END
    FROM (SELECT public.autoos_portal_digitos(p_valor) AS d) s
$$;

CREATE OR REPLACE FUNCTION public.autoos_portal_mascarar(p_canal TEXT, p_destino TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
    SELECT CASE
        WHEN p_canal = 'EMAIL' THEN
            left(split_part(p_destino, '@', 1), 1) || '•••@' || split_part(p_destino, '@', 2)
        ELSE '•••• ' || right(public.autoos_portal_digitos(p_destino), 4)
    END
$$;

CREATE OR REPLACE FUNCTION public.autoos_portal_rotulo_equipamento(p_tipo TEXT, p_marca TEXT, p_modelo TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT left(btrim(regexp_replace(concat_ws(' ', NULLIF(btrim(p_tipo), ''), NULLIF(btrim(p_marca), ''),
        NULLIF(btrim(p_modelo), '')), '[[:cntrl:][:space:]]+', ' ', 'g')), 180)
$$;

-- Valor em reais no formato brasileiro, independente do lc_numeric do servidor.
CREATE OR REPLACE FUNCTION public.autoos_portal_moeda(p_valor NUMERIC)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT translate(to_char(COALESCE(p_valor, 0), 'FM999,999,990.00'), ',.', '.,')
$$;

CREATE OR REPLACE FUNCTION public.autoos_portal_alerta(
    p_empresa_id INTEGER,
    p_equipamento_id INTEGER,
    p_tipo TEXT,
    p_titulo TEXT,
    p_detalhe TEXT,
    p_resposta_id BIGINT DEFAULT NULL,
    p_solicitacao_id BIGINT DEFAULT NULL,
    p_contato_id INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    INSERT INTO public.portal_alertas
        (empresa_id, equipamento_id, tipo, resposta_id, solicitacao_id, contato_id, titulo, detalhe)
    VALUES
        (p_empresa_id, p_equipamento_id, p_tipo, p_resposta_id, p_solicitacao_id, p_contato_id,
         left(p_titulo, 200), left(p_detalhe, 600))
    ON CONFLICT (resposta_id, tipo)
        WHERE resposta_id IS NOT NULL AND tipo IN ('DECISAO_EFETIVADA', 'EFETIVACAO_FALHOU')
        DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.autoos_portal_janela_minutos()
RETURNS INTEGER
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
    SELECT GREATEST(COALESCE((SELECT janela_correcao_minutos FROM public.orcamento_aceite_config
                              WHERE singleton = TRUE), 15), 15)
$$;

-- Sessão válida: portal ligado, sessão aberta, contato ativo com acesso, cliente ativo.
CREATE OR REPLACE FUNCTION public.autoos_portal_sessao(p_sessao_hash TEXT)
RETURNS TABLE (
    s_id BIGINT,
    s_empresa_id INTEGER,
    s_cliente_id INTEGER,
    s_contato_id INTEGER,
    s_contato_nome TEXT,
    s_acesso TEXT,
    s_verificada_em TIMESTAMPTZ
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_agora TIMESTAMPTZ := statement_timestamp();
BEGIN
    IF NOT COALESCE((SELECT portal_enabled FROM public.portal_cliente_config WHERE singleton = TRUE), FALSE) THEN
        RAISE EXCEPTION 'PORTAL_PAUSADO';
    END IF;
    IF p_sessao_hash IS NULL OR p_sessao_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'SESSAO_INVALIDA';
    END IF;

    RETURN QUERY
    UPDATE public.portal_sessoes s
    SET ultimo_acesso_em = v_agora
    FROM public.cliente_contatos c, public.clientes cl
    WHERE s.token_hash = p_sessao_hash
      AND s.encerrada_em IS NULL
      AND s.expira_em > v_agora
      AND c.id = s.contato_id AND c.empresa_id = s.empresa_id AND c.cliente_id = s.cliente_id
      AND c.ativo AND c.portal_acesso <> 'NENHUM'
      AND cl.id = s.cliente_id AND cl.empresa_id = s.empresa_id AND COALESCE(cl.ativo, TRUE)
    RETURNING s.id, s.empresa_id, s.cliente_id, s.contato_id, c.nome, c.portal_acesso, s.verificada_em;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'SESSAO_INVALIDA';
    END IF;
END;
$$;

-- ─── Login por código ────────────────────────────────────────────────────────
-- Devolve linha só se CPF/CNPJ + telefone/email casam com exatamente um contato autorizado.
-- O chamador responde igual nos dois casos para não revelar quem é cliente.
CREATE OR REPLACE FUNCTION public.portal_criar_desafio(
    p_documento TEXT,
    p_destino TEXT,
    p_desafio_ref UUID,
    p_codigo_hash TEXT
)
RETURNS TABLE (
    desafio_id BIGINT,
    empresa_id INTEGER,
    canal TEXT,
    destino TEXT,
    contato_nome TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_config RECORD;
    v_doc TEXT := public.autoos_portal_digitos(p_documento);
    v_canal TEXT;
    v_destino TEXT := lower(btrim(COALESCE(p_destino, '')));
    v_contatos INTEGER[];
    v_contato RECORD;
    v_id BIGINT;
BEGIN
    SELECT * INTO v_config FROM public.portal_cliente_config WHERE singleton = TRUE;
    IF NOT COALESCE(v_config.portal_enabled, FALSE) THEN
        RAISE EXCEPTION 'PORTAL_PAUSADO';
    END IF;
    IF length(v_doc) NOT IN (11, 14) OR p_codigo_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN;
    END IF;
    v_canal := CASE WHEN position('@' IN v_destino) > 1 THEN 'EMAIL' ELSE 'WHATSAPP' END;
    IF v_canal = 'WHATSAPP' AND length(public.autoos_portal_telefone(v_destino)) NOT BETWEEN 10 AND 11 THEN
        RETURN;
    END IF;

    SELECT array_agg(c.id ORDER BY c.id) INTO v_contatos
    FROM public.clientes cl
    JOIN public.cliente_contatos c ON c.cliente_id = cl.id AND c.empresa_id = cl.empresa_id
    WHERE COALESCE(cl.ativo, TRUE)
      AND cl.empresa_id IS NOT NULL
      AND (public.autoos_portal_digitos(cl.documento) = v_doc OR public.autoos_portal_digitos(cl.cpf_cnpj) = v_doc)
      AND c.ativo AND c.portal_acesso <> 'NENHUM'
      AND CASE WHEN v_canal = 'EMAIL'
               THEN lower(btrim(COALESCE(c.email, ''))) = v_destino
               ELSE public.autoos_portal_telefone(c.telefone) = public.autoos_portal_telefone(v_destino) END;

    -- Nenhum ou mais de um vínculo (documento repetido entre empresas): não há como escolher.
    IF COALESCE(array_length(v_contatos, 1), 0) <> 1 THEN
        RETURN;
    END IF;

    SELECT * INTO v_contato FROM public.cliente_contatos WHERE id = v_contatos[1] FOR UPDATE;
    IF (SELECT count(*) FROM public.portal_codigos pc
        WHERE pc.contato_id = v_contato.id AND pc.criado_em > statement_timestamp() - INTERVAL '1 hour') >= 6 THEN
        RAISE EXCEPTION 'LIMITE_CODIGOS';
    END IF;

    -- Só o último código vale.
    UPDATE public.portal_codigos pc SET invalidado_em = statement_timestamp()
    WHERE pc.contato_id = v_contato.id AND pc.usado_em IS NULL AND pc.invalidado_em IS NULL;

    INSERT INTO public.portal_codigos
        (desafio_ref, empresa_id, cliente_id, contato_id, canal, destino_mascarado, codigo_hash, expira_em)
    VALUES
        (p_desafio_ref, v_contato.empresa_id, v_contato.cliente_id, v_contato.id, v_canal,
         public.autoos_portal_mascarar(v_canal, CASE WHEN v_canal = 'EMAIL' THEN v_contato.email ELSE v_contato.telefone END),
         p_codigo_hash,
         statement_timestamp() + make_interval(mins => v_config.codigo_validade_minutos))
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, v_contato.empresa_id, v_canal,
        CASE WHEN v_canal = 'EMAIL' THEN btrim(v_contato.email) ELSE public.autoos_portal_digitos(v_contato.telefone) END,
        v_contato.nome;
END;
$$;

-- Novo código para quem já está logado (verificação recente antes de decidir).
CREATE OR REPLACE FUNCTION public.portal_criar_desafio_sessao(
    p_sessao_hash TEXT,
    p_canal TEXT,
    p_desafio_ref UUID,
    p_codigo_hash TEXT
)
RETURNS TABLE (
    desafio_id BIGINT,
    empresa_id INTEGER,
    canal TEXT,
    destino TEXT,
    contato_nome TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_s RECORD;
    v_contato RECORD;
    v_config RECORD;
    v_destino TEXT;
    v_id BIGINT;
BEGIN
    SELECT * INTO v_s FROM public.autoos_portal_sessao(p_sessao_hash);
    SELECT * INTO v_config FROM public.portal_cliente_config WHERE singleton = TRUE;
    IF p_canal NOT IN ('WHATSAPP', 'EMAIL') OR p_codigo_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'CANAL_INDISPONIVEL';
    END IF;
    SELECT * INTO v_contato FROM public.cliente_contatos WHERE id = v_s.s_contato_id FOR UPDATE;
    v_destino := CASE WHEN p_canal = 'EMAIL' THEN NULLIF(btrim(COALESCE(v_contato.email, '')), '')
                      ELSE NULLIF(public.autoos_portal_digitos(v_contato.telefone), '') END;
    IF v_destino IS NULL THEN
        RAISE EXCEPTION 'CANAL_INDISPONIVEL';
    END IF;
    IF (SELECT count(*) FROM public.portal_codigos pc
        WHERE pc.contato_id = v_contato.id AND pc.criado_em > statement_timestamp() - INTERVAL '1 hour') >= 6 THEN
        RAISE EXCEPTION 'LIMITE_CODIGOS';
    END IF;
    UPDATE public.portal_codigos pc SET invalidado_em = statement_timestamp()
    WHERE pc.contato_id = v_contato.id AND pc.usado_em IS NULL AND pc.invalidado_em IS NULL;

    INSERT INTO public.portal_codigos
        (desafio_ref, empresa_id, cliente_id, contato_id, canal, destino_mascarado, codigo_hash, sessao_id, expira_em)
    VALUES
        (p_desafio_ref, v_s.s_empresa_id, v_s.s_cliente_id, v_contato.id, p_canal,
         public.autoos_portal_mascarar(p_canal, v_destino), p_codigo_hash, v_s.s_id,
         statement_timestamp() + make_interval(mins => v_config.codigo_validade_minutos))
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, v_s.s_empresa_id, p_canal, v_destino, v_contato.nome;
END;
$$;

-- Resultado da entrega informado pelo servidor que enviou. Falha gera alerta para a equipe.
CREATE OR REPLACE FUNCTION public.portal_registrar_entrega_codigo(
    p_desafio_id BIGINT,
    p_estado TEXT,
    p_erro TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_c RECORD;
BEGIN
    IF p_estado NOT IN ('ENVIADO', 'FALHOU') THEN
        RAISE EXCEPTION 'ESTADO_INVALIDO';
    END IF;
    UPDATE public.portal_codigos
    SET entrega_estado = p_estado,
        entrega_erro = left(p_erro, 300),
        invalidado_em = CASE WHEN p_estado = 'FALHOU' THEN statement_timestamp() ELSE invalidado_em END
    WHERE id = p_desafio_id AND entrega_estado = 'PENDENTE'
    RETURNING * INTO v_c;
    IF FOUND AND p_estado = 'FALHOU' THEN
        PERFORM public.autoos_portal_alerta(
            v_c.empresa_id, NULL, 'CODIGO_NAO_ENTREGUE',
            'Código de acesso ao portal não entregue',
            format('Contato %s (%s, %s). Confira o cadastro do contato e a configuração de envio do servidor.',
                   (SELECT nome FROM public.cliente_contatos WHERE id = v_c.contato_id),
                   v_c.canal, v_c.destino_mascarado),
            NULL, NULL, v_c.contato_id);
    END IF;
END;
$$;

-- Confere o código. Tentativa errada é gravada (não usa RAISE para não desfazer o contador).
-- Com `p_sessao_existente_hash`, renova a verificação da sessão em vez de criar outra.
CREATE OR REPLACE FUNCTION public.portal_verificar_codigo(
    p_desafio_ref UUID,
    p_codigo_hash TEXT,
    p_nova_sessao_hash TEXT,
    p_sessao_existente_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_config RECORD;
    v_c RECORD;
    v_contato RECORD;
    v_sessao_id BIGINT;
    v_expira TIMESTAMPTZ;
    v_agora TIMESTAMPTZ := statement_timestamp();
BEGIN
    SELECT * INTO v_config FROM public.portal_cliente_config WHERE singleton = TRUE;
    IF NOT COALESCE(v_config.portal_enabled, FALSE) THEN
        RAISE EXCEPTION 'PORTAL_PAUSADO';
    END IF;

    SELECT * INTO v_c FROM public.portal_codigos WHERE desafio_ref = p_desafio_ref FOR UPDATE;
    IF NOT FOUND OR v_c.usado_em IS NOT NULL OR v_c.invalidado_em IS NOT NULL
       OR v_c.entrega_estado = 'FALHOU' OR v_c.tentativas >= v_config.codigo_max_tentativas THEN
        RETURN jsonb_build_object('resultado', 'CODIGO_INDISPONIVEL');
    END IF;
    IF v_c.expira_em <= v_agora THEN
        RETURN jsonb_build_object('resultado', 'CODIGO_EXPIRADO');
    END IF;
    IF v_c.codigo_hash <> p_codigo_hash THEN
        UPDATE public.portal_codigos SET tentativas = tentativas + 1 WHERE id = v_c.id;
        RETURN jsonb_build_object('resultado', 'CODIGO_INVALIDO',
            'tentativasRestantes', GREATEST(v_config.codigo_max_tentativas - v_c.tentativas - 1, 0));
    END IF;

    SELECT c.* INTO v_contato
    FROM public.cliente_contatos c
    JOIN public.clientes cl ON cl.id = c.cliente_id AND cl.empresa_id = c.empresa_id AND COALESCE(cl.ativo, TRUE)
    WHERE c.id = v_c.contato_id AND c.cliente_id = v_c.cliente_id AND c.empresa_id = v_c.empresa_id
      AND c.ativo AND c.portal_acesso <> 'NENHUM';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('resultado', 'CODIGO_INDISPONIVEL');
    END IF;

    UPDATE public.portal_codigos SET usado_em = v_agora WHERE id = v_c.id;

    IF v_c.sessao_id IS NOT NULL THEN
        -- Reverificação: só vale para a própria sessão que pediu o código.
        UPDATE public.portal_sessoes
        SET verificada_em = v_agora, ultimo_acesso_em = v_agora
        WHERE id = v_c.sessao_id AND token_hash = p_sessao_existente_hash
          AND encerrada_em IS NULL AND expira_em > v_agora
        RETURNING id, expira_em INTO v_sessao_id, v_expira;
        IF v_sessao_id IS NULL THEN
            RETURN jsonb_build_object('resultado', 'CODIGO_INDISPONIVEL');
        END IF;
    ELSE
        IF p_nova_sessao_hash IS NULL OR p_nova_sessao_hash !~ '^[0-9a-f]{64}$' THEN
            RAISE EXCEPTION 'SESSAO_INVALIDA';
        END IF;
        INSERT INTO public.portal_sessoes
            (token_hash, empresa_id, cliente_id, contato_id, expira_em, verificada_em, ultimo_acesso_em)
        VALUES
            (p_nova_sessao_hash, v_c.empresa_id, v_c.cliente_id, v_c.contato_id,
             v_agora + make_interval(hours => v_config.sessao_horas), v_agora, v_agora)
        RETURNING id, expira_em INTO v_sessao_id, v_expira;
    END IF;

    RETURN jsonb_build_object(
        'resultado', 'OK',
        'contato', v_contato.nome,
        'acesso', v_contato.portal_acesso,
        'expiraEm', v_expira,
        'reverificada', v_c.sessao_id IS NOT NULL
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_encerrar_sessao(p_sessao_hash TEXT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    UPDATE public.portal_sessoes
    SET encerrada_em = statement_timestamp(), encerrada_motivo = 'SAIDA'
    WHERE token_hash = p_sessao_hash AND encerrada_em IS NULL;
$$;

-- ─── Estado público do status e do orçamento ────────────────────────────────
-- Mesmos títulos da Edge Function `public-status`, para o cartão resumido da lista.
CREATE OR REPLACE FUNCTION public.autoos_portal_titulo_status(p_status TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT CASE p_status
        WHEN 'RECEBIDO' THEN 'Recebemos seu equipamento'
        WHEN 'EM_VERIFICACAO' THEN 'Estamos analisando seu equipamento'
        WHEN 'VERIFICADO' THEN 'Análise concluída'
        WHEN 'AGUARDANDO_APROVACAO' THEN 'O orçamento aguarda sua resposta'
        WHEN 'APROVADO' THEN 'Orçamento aprovado'
        WHEN 'REPROVADO' THEN 'Orçamento não aprovado'
        WHEN 'EM_MANUTENCAO' THEN 'Serviço em andamento'
        WHEN 'AGUARDANDO_PECA' THEN 'Aguardando peça'
        WHEN 'PRONTO' THEN 'Pronto para retirada'
        WHEN 'ENTREGUE' THEN 'Equipamento entregue'
        WHEN 'ORCAMENTO_VENCIDO' THEN 'O prazo do orçamento terminou'
        WHEN 'ABANDONADO' THEN 'Atendimento encerrado'
        ELSE 'Acompanhe o atendimento'
    END
$$;

-- Estado da resposta vigente de uma versão, do ponto de vista do cliente.
-- EM_CORRECAO: dentro do prazo de correção. PROCESSANDO: prazo terminou, efetivação a caminho.
-- PENDENTE_EQUIPE: a efetivação falhou e a equipe vai tratar. EFETIVADA: status já aplicado.
CREATE OR REPLACE FUNCTION public.autoos_portal_estado_resposta(
    p_origem TEXT,
    p_decisao TEXT,
    p_registrada_em TIMESTAMPTZ,
    p_aplicada_em TIMESTAMPTZ,
    p_falhou_em TIMESTAMPTZ,
    p_versao_encerrada BOOLEAN
)
RETURNS TEXT
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
    SELECT CASE
        WHEN p_decisao IS NULL OR p_decisao = 'DESFEITA' THEN NULL
        WHEN p_aplicada_em IS NOT NULL THEN 'EFETIVADA'
        WHEN p_falhou_em IS NOT NULL OR p_versao_encerrada THEN 'PENDENTE_EQUIPE'
        WHEN p_origem <> 'PORTAL_CLIENTE' THEN 'AGUARDANDO_EQUIPE'
        WHEN statement_timestamp() < p_registrada_em + make_interval(mins => public.autoos_portal_janela_minutos())
            THEN 'EM_CORRECAO'
        ELSE 'PROCESSANDO'
    END
$$;

-- Lista de atendimentos do cliente pelo vínculo real (empresa + cliente_id), nunca por nome ou série.
CREATE OR REPLACE FUNCTION public.portal_listar_atendimentos(p_sessao_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_s RECORD;
    v_lista JSONB;
    v_cliente TEXT;
BEGIN
    SELECT * INTO v_s FROM public.autoos_portal_sessao(p_sessao_hash);
    -- Efetiva o que já passou do prazo antes de mostrar: o portal fica correto mesmo sem o Cron.
    PERFORM public.portal_efetivar_respostas_vencidas(10, v_s.s_empresa_id, v_s.s_cliente_id);
    SELECT COALESCE(NULLIF(btrim(nome_fantasia), ''), NULLIF(btrim(razao_social), ''), nome)
    INTO v_cliente FROM public.clientes WHERE id = v_s.s_cliente_id;

    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'atividadeEm') DESC NULLS LAST, (item->>'id')::INTEGER DESC), '[]'::JSONB)
    INTO v_lista
    FROM (
        SELECT jsonb_build_object(
            'id', e.id,
            'equipamento', COALESCE(NULLIF(public.autoos_portal_rotulo_equipamento(e.tipo, e.marca, e.modelo), ''), 'Equipamento'),
            'serie', left(e.serial_number, 60),
            'patrimonio', left(NULLIF(btrim(e.patrimonio), ''), 60),
            'status', e.status,
            'titulo', public.autoos_portal_titulo_status(e.status),
            'historico', e.status IN ('ENTREGUE', 'ABANDONADO'),
            'entradaEm', e.criado_em,
            'atividadeEm', GREATEST(COALESCE(e.atualizado_em, e.criado_em), COALESCE(e.ultima_atividade_cliente_em, e.criado_em)),
            'statusAlteradoEm', e.status_alterado_em,
            'aguardaResposta', e.status = 'AGUARDANDO_APROVACAO' AND v.id IS NOT NULL
                AND (v.valido_ate IS NULL OR v.valido_ate > statement_timestamp())
                AND COALESCE(r.decisao, 'DESFEITA') = 'DESFEITA',
            'resposta', public.autoos_portal_estado_resposta(r.origem, r.decisao, r.registrada_em, r.aplicada_em,
                r.efetivacao_falhou_em, v.encerrada_em IS NOT NULL)
        ) AS item
        FROM public.equipamentos e
        LEFT JOIN LATERAL (
            SELECT ov.* FROM public.orcamento_versoes ov
            WHERE ov.equipamento_id = e.id AND ov.empresa_id = e.empresa_id
            ORDER BY ov.versao DESC LIMIT 1
        ) v ON TRUE
        LEFT JOIN LATERAL (
            SELECT orr.* FROM public.orcamento_respostas orr
            WHERE orr.versao_id = v.id ORDER BY orr.id DESC LIMIT 1
        ) r ON TRUE
        WHERE e.empresa_id = v_s.s_empresa_id AND e.cliente_id = v_s.s_cliente_id
        -- Entregues há mais de 2 anos saem da lista para não crescer sem limite.
          AND NOT (e.status = 'ENTREGUE' AND e.status_alterado_em < statement_timestamp() - INTERVAL '2 years')
        LIMIT 300
    ) x;

    RETURN jsonb_build_object(
        'cliente', v_cliente,
        'contato', v_s.s_contato_nome,
        'podeDecidir', v_s.s_acesso = 'DECIDIR',
        'atendimentos', v_lista
    );
END;
$$;

-- Detalhe: status (mesmo formato do link individual) + orçamento publicado + contato.
CREATE OR REPLACE FUNCTION public.portal_detalhe_atendimento(p_sessao_hash TEXT, p_equipamento_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_s RECORD;
    v_e RECORD;
    v_v RECORD;
    v_r RECORD;
    v_aceite BOOLEAN;
    v_config RECORD;
    v_estado_orc TEXT;
    v_orcamento JSONB;
    v_servicos JSONB;
    v_pecas JSONB;
    v_solicitacoes JSONB;
    v_contato JSONB;
    v_janela INTEGER := public.autoos_portal_janela_minutos();
BEGIN
    SELECT * INTO v_s FROM public.autoos_portal_sessao(p_sessao_hash);
    PERFORM public.portal_efetivar_respostas_vencidas(10, v_s.s_empresa_id, v_s.s_cliente_id);
    SELECT * INTO v_config FROM public.portal_cliente_config WHERE singleton = TRUE;
    SELECT * INTO v_e FROM public.equipamentos
    WHERE id = p_equipamento_id AND empresa_id = v_s.s_empresa_id AND cliente_id = v_s.s_cliente_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ATENDIMENTO_INDISPONIVEL';
    END IF;
    v_aceite := COALESCE((SELECT online_enabled FROM public.orcamento_aceite_config WHERE singleton = TRUE), FALSE);

    SELECT * INTO v_v FROM public.orcamento_versoes
    WHERE equipamento_id = v_e.id AND empresa_id = v_e.empresa_id
    ORDER BY versao DESC LIMIT 1;

    IF v_v.id IS NOT NULL THEN
        SELECT * INTO v_r FROM public.orcamento_respostas WHERE versao_id = v_v.id ORDER BY id DESC LIMIT 1;

        v_estado_orc := CASE
            WHEN v_r.id IS NOT NULL AND v_r.decisao <> 'DESFEITA' THEN 'RESPONDIDA'
            WHEN v_v.encerrada_em IS NOT NULL AND v_e.status = 'AGUARDANDO_APROVACAO' THEN 'EM_REVISAO'
            WHEN v_v.encerrada_em IS NOT NULL THEN 'ENCERRADA'
            WHEN v_v.valido_ate IS NOT NULL AND v_v.valido_ate <= statement_timestamp() THEN 'VENCIDA'
            ELSE 'ABERTA'
        END;

        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'descricao', left(COALESCE(NULLIF(s->>'descricao', ''), NULLIF(s->>'nome', ''), 'Serviço'), 200),
            'valor', COALESCE((s->>'valor')::NUMERIC, 0),
            'pecas', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'nome', left(COALESCE(p->>'nome', 'Peça'), 120),
                    'quantidade', COALESCE((p->>'quantidade')::INTEGER, 0),
                    'valorUnitario', COALESCE((p->>'valor_unitario')::NUMERIC, 0)
                ))
                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s->'pecas') = 'array' THEN s->'pecas' ELSE '[]'::JSONB END) p
            ), '[]'::JSONB)
        )), '[]'::JSONB)
        INTO v_servicos
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_v.snapshot->'servicos') = 'array'
                                       THEN v_v.snapshot->'servicos' ELSE '[]'::JSONB END) s;

        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'nome', left(COALESCE(p->>'nome', 'Peça'), 120),
            'quantidade', COALESCE((p->>'quantidade')::INTEGER, 0),
            'valorTotal', COALESCE((p->>'valorTotal')::NUMERIC, 0)
        )), '[]'::JSONB)
        INTO v_pecas
        FROM jsonb_array_elements(CASE WHEN jsonb_array_length(v_servicos) = 0 AND jsonb_typeof(v_v.snapshot->'pecas') = 'array'
                                       THEN v_v.snapshot->'pecas' ELSE '[]'::JSONB END) p;

        v_orcamento := jsonb_build_object(
            'versaoId', v_v.id,
            'versao', v_v.versao,
            'publicadaEm', v_v.criado_em,
            'valorTotal', v_v.valor_total,
            'validoAte', v_v.valido_ate,
            'estado', v_estado_orc,
            'servicos', v_servicos,
            'pecas', v_pecas,
            'janelaMinutos', v_janela,
            'aceiteOnline', v_aceite,
            'resposta', CASE WHEN v_r.id IS NULL THEN NULL ELSE jsonb_build_object(
                'id', v_r.id,
                'decisao', v_r.decisao,
                'origem', v_r.origem,
                'registradaEm', v_r.registrada_em,
                'janelaAte', v_r.registrada_em + make_interval(mins => v_janela),
                'contato', CASE WHEN v_r.origem = 'PORTAL_CLIENTE' THEN v_r.contato_nome END,
                'propria', v_r.contato_id IS NOT DISTINCT FROM v_s.s_contato_id AND v_r.origem = 'PORTAL_CLIENTE',
                'estado', public.autoos_portal_estado_resposta(v_r.origem, v_r.decisao, v_r.registrada_em,
                    v_r.aplicada_em, v_r.efetivacao_falhou_em,
                    v_v.encerrada_em IS NOT NULL AND v_r.aplicada_em IS NULL),
                'efetivadaEm', v_r.aplicada_em,
                'protocolo', 'R-' || v_r.id
            ) END
        );
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', so.id, 'tipo', so.tipo, 'criadoEm', so.criado_em, 'tratada', so.tratado_em IS NOT NULL,
        'contato', so.contato_nome, 'protocolo', 'S-' || so.id
    ) ORDER BY so.id DESC), '[]'::JSONB)
    INTO v_solicitacoes
    FROM (SELECT * FROM public.orcamento_solicitacoes
          WHERE equipamento_id = v_e.id AND empresa_id = v_e.empresa_id
          ORDER BY id DESC LIMIT 10) so;

    SELECT jsonb_build_object('nome', pc.nome_exibicao, 'whatsapp', pc.whatsapp, 'email', pc.email,
                              'telefone', pc.telefone, 'horario', pc.horario)
    INTO v_contato
    FROM public.portal_contato_empresa pc WHERE pc.empresa_id = v_e.empresa_id;

    RETURN jsonb_build_object(
        'id', v_e.id,
        'equipamento', COALESCE(NULLIF(public.autoos_portal_rotulo_equipamento(v_e.tipo, v_e.marca, v_e.modelo), ''), 'Equipamento'),
        'serie', left(v_e.serial_number, 60),
        'patrimonio', left(NULLIF(btrim(v_e.patrimonio), ''), 60),
        'status', v_e.status,
        'statusAlteradoEm', v_e.status_alterado_em,
        'entradaEm', v_e.criado_em,
        'orcamento', v_orcamento,
        'solicitacoes', v_solicitacoes,
        'contatoEmpresa', v_contato,
        'podeDecidir', v_s.s_acesso = 'DECIDIR',
        'verificacaoRecente', v_s.s_verificada_em > statement_timestamp() - make_interval(mins => v_config.reverificacao_minutos),
        'contato', v_s.s_contato_nome
    );
END;
$$;

-- ─── Resposta do cliente ─────────────────────────────────────────────────────
-- Atômica sob bloqueio da versão (o mesmo que `registrar_resposta_orcamento` e o desktop usam).
-- `p_versao_id` é a versão que o cliente leu: outra versão aberta = proposta alterada.
CREATE OR REPLACE FUNCTION public.portal_registrar_resposta(
    p_sessao_hash TEXT,
    p_equipamento_id INTEGER,
    p_versao_id BIGINT,
    p_decisao TEXT,
    p_resposta_vigente_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_s RECORD;
    v_config RECORD;
    v_e RECORD;
    v_v RECORD;
    v_atual RECORD;
    v_novo_id BIGINT;
    v_trocas INTEGER;
    v_janela INTEGER := public.autoos_portal_janela_minutos();
    v_agora TIMESTAMPTZ := statement_timestamp();
    v_rotulo TEXT;
    v_tipo_alerta TEXT;
BEGIN
    IF p_decisao NOT IN ('APROVAR', 'RECUSAR', 'DESFEITA') THEN
        RAISE EXCEPTION 'DECISAO_INVALIDA';
    END IF;
    SELECT * INTO v_s FROM public.autoos_portal_sessao(p_sessao_hash);
    SELECT * INTO v_config FROM public.portal_cliente_config WHERE singleton = TRUE;
    IF v_s.s_acesso <> 'DECIDIR' THEN
        RAISE EXCEPTION 'SEM_PERMISSAO_DECISAO';
    END IF;
    IF NOT COALESCE((SELECT online_enabled FROM public.orcamento_aceite_config WHERE singleton = TRUE), FALSE) THEN
        RAISE EXCEPTION 'ACEITE_PAUSADO';
    END IF;
    IF p_decisao <> 'DESFEITA'
       AND v_s.s_verificada_em <= v_agora - make_interval(mins => v_config.reverificacao_minutos) THEN
        RAISE EXCEPTION 'VERIFICACAO_NECESSARIA';
    END IF;

    -- Mesma ordem de bloqueio de `aprovar_orcamento` no desktop: equipamento, depois versão.
    -- FOR UPDATE (não FOR SHARE): a linha é atualizada adiante e dois FOR SHARE se travariam.
    SELECT * INTO v_e FROM public.equipamentos
    WHERE id = p_equipamento_id AND empresa_id = v_s.s_empresa_id
    FOR UPDATE;
    IF NOT FOUND OR v_e.cliente_id IS DISTINCT FROM v_s.s_cliente_id THEN
        RAISE EXCEPTION 'ATENDIMENTO_INDISPONIVEL';
    END IF;

    SELECT * INTO v_v FROM public.orcamento_versoes
    WHERE id = p_versao_id AND equipamento_id = p_equipamento_id AND empresa_id = v_s.s_empresa_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ATENDIMENTO_INDISPONIVEL';
    END IF;

    SELECT r.* INTO v_atual FROM public.orcamento_respostas r
    WHERE r.versao_id = v_v.id ORDER BY r.id DESC LIMIT 1;

    IF v_atual.id IS NOT NULL AND v_atual.aplicada_em IS NOT NULL THEN
        RAISE EXCEPTION 'RESPOSTA_JA_EFETIVADA';
    END IF;
    -- Proposta alterada (nova versão, etapa mudada) enquanto a página estava aberta.
    IF v_v.encerrada_em IS NOT NULL OR v_e.status IS DISTINCT FROM 'AGUARDANDO_APROVACAO' THEN
        RAISE EXCEPTION 'PROPOSTA_ALTERADA';
    END IF;

    IF COALESCE(v_atual.id, 0) <> COALESCE(p_resposta_vigente_id, 0) THEN
        -- Clique repetido: o mesmo pedido devolve o comprovante já gravado.
        IF v_atual.id IS NOT NULL AND v_atual.decisao = p_decisao AND v_atual.origem = 'PORTAL_CLIENTE'
           AND v_atual.contato_id = v_s.s_contato_id
           AND v_atual.registrada_em > v_agora - INTERVAL '2 minutes' THEN
            v_novo_id := v_atual.id;
        ELSE
            RAISE EXCEPTION 'RESPOSTA_DESATUALIZADA';
        END IF;
    END IF;

    IF v_novo_id IS NULL THEN
        IF v_atual.id IS NOT NULL AND v_atual.decisao <> 'DESFEITA' THEN
            -- Uma resposta final já existe: só quem respondeu, dentro do prazo, pode mudar de ideia.
            IF v_atual.origem <> 'PORTAL_CLIENTE' THEN
                RAISE EXCEPTION 'RESPOSTA_JA_REGISTRADA';
            END IF;
            IF v_atual.contato_id IS DISTINCT FROM v_s.s_contato_id THEN
                RAISE EXCEPTION 'RESPOSTA_DE_OUTRO_CONTATO';
            END IF;
            IF v_agora >= v_atual.registrada_em + make_interval(mins => v_janela) THEN
                RAISE EXCEPTION 'PRAZO_CORRECAO_ENCERRADO';
            END IF;
            IF v_atual.decisao = p_decisao THEN
                v_novo_id := v_atual.id;
            END IF;
        ELSIF p_decisao = 'DESFEITA' THEN
            RAISE EXCEPTION 'NADA_A_DESFAZER';
        END IF;
    END IF;

    IF v_novo_id IS NULL THEN
        IF p_decisao <> 'DESFEITA' AND v_v.valido_ate IS NOT NULL AND v_v.valido_ate <= v_agora THEN
            RAISE EXCEPTION 'PROPOSTA_VENCIDA';
        END IF;
        SELECT count(*) INTO v_trocas FROM public.orcamento_respostas
        WHERE versao_id = v_v.id AND origem = 'PORTAL_CLIENTE';
        IF v_trocas >= 10 THEN
            RAISE EXCEPTION 'LIMITE_RESPOSTAS';
        END IF;

        INSERT INTO public.orcamento_respostas
            (empresa_id, equipamento_id, versao_id, origem, decisao, registrada_em, contato_id, contato_nome, sessao_id)
        VALUES
            (v_v.empresa_id, v_v.equipamento_id, v_v.id, 'PORTAL_CLIENTE', p_decisao, v_agora,
             v_s.s_contato_id, v_s.s_contato_nome, v_s.s_id)
        RETURNING id INTO v_novo_id;

        UPDATE public.equipamentos SET ultima_atividade_cliente_em = CURRENT_TIMESTAMP
        WHERE id = v_e.id AND empresa_id = v_e.empresa_id;

        v_rotulo := COALESCE(NULLIF(public.autoos_portal_rotulo_equipamento(v_e.tipo, v_e.marca, v_e.modelo), ''), 'Equipamento')
            || ' (série ' || left(v_e.serial_number, 60) || ')';
        v_tipo_alerta := CASE
            WHEN p_decisao = 'DESFEITA' THEN 'RESPOSTA_CANCELADA'
            WHEN v_atual.id IS NOT NULL AND v_atual.decisao <> 'DESFEITA' THEN 'RESPOSTA_ALTERADA'
            ELSE 'RESPOSTA_RECEBIDA' END;
        PERFORM public.autoos_portal_alerta(
            v_v.empresa_id, v_v.equipamento_id, v_tipo_alerta,
            CASE p_decisao
                WHEN 'APROVAR' THEN 'Cliente aceitou o orçamento — em prazo de correção'
                WHEN 'RECUSAR' THEN 'Cliente recusou o orçamento — em prazo de correção'
                ELSE 'Cliente cancelou a resposta ao orçamento' END,
            format('%s. Orçamento v%s, R$ %s. Resposta de %s em %s (protocolo R-%s). %s',
                   v_rotulo, v_v.versao, public.autoos_portal_moeda(v_v.valor_total),
                   v_s.s_contato_nome, to_char(v_agora AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
                   v_novo_id,
                   CASE WHEN p_decisao = 'DESFEITA' THEN 'O orçamento volta a aguardar resposta.'
                        ELSE format('Não aja como efetivada: o cliente pode corrigir até %s.',
                                    to_char((v_agora + make_interval(mins => v_janela)) AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')) END),
            v_novo_id, NULL, v_s.s_contato_id);
    END IF;

    SELECT r.* INTO v_atual FROM public.orcamento_respostas r WHERE r.id = v_novo_id;
    RETURN jsonb_build_object(
        'id', v_atual.id,
        'protocolo', 'R-' || v_atual.id,
        'decisao', v_atual.decisao,
        'registradaEm', v_atual.registrada_em,
        'janelaAte', v_atual.registrada_em + make_interval(mins => v_janela),
        'versao', v_v.versao,
        'valorTotal', v_v.valor_total,
        'equipamento', COALESCE(NULLIF(public.autoos_portal_rotulo_equipamento(v_e.tipo, v_e.marca, v_e.modelo), ''), 'Equipamento'),
        'serie', left(v_e.serial_number, 60),
        'contato', v_atual.contato_nome,
        'repetida', v_atual.registrada_em < v_agora
    );
END;
$$;

-- Negociação, dúvida ou pedido de correção. Nunca muda a resposta nem o prazo.
CREATE OR REPLACE FUNCTION public.portal_registrar_solicitacao(
    p_sessao_hash TEXT,
    p_equipamento_id INTEGER,
    p_versao_id BIGINT,
    p_tipo TEXT,
    p_mensagem TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_s RECORD;
    v_e RECORD;
    v_v RECORD;
    v_aplicada BOOLEAN;
    v_mensagem TEXT := left(btrim(regexp_replace(COALESCE(p_mensagem, ''), '[[:cntrl:]]', ' ', 'g')), 500);
    v_id BIGINT;
    v_agora TIMESTAMPTZ := statement_timestamp();
    v_rotulo TEXT;
BEGIN
    IF p_tipo NOT IN ('NEGOCIAR', 'DUVIDA', 'MUDANCA') THEN
        RAISE EXCEPTION 'TIPO_INVALIDO';
    END IF;
    SELECT * INTO v_s FROM public.autoos_portal_sessao(p_sessao_hash);
    IF p_tipo IN ('NEGOCIAR', 'MUDANCA') AND v_s.s_acesso <> 'DECIDIR' THEN
        RAISE EXCEPTION 'SEM_PERMISSAO_DECISAO';
    END IF;

    SELECT * INTO v_e FROM public.equipamentos
    WHERE id = p_equipamento_id AND empresa_id = v_s.s_empresa_id AND cliente_id = v_s.s_cliente_id
    FOR UPDATE;
    SELECT * INTO v_v FROM public.orcamento_versoes
    WHERE id = p_versao_id AND equipamento_id = p_equipamento_id AND empresa_id = v_s.s_empresa_id
    FOR UPDATE;
    IF v_v.id IS NULL OR v_e.id IS NULL THEN
        RAISE EXCEPTION 'ATENDIMENTO_INDISPONIVEL';
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.orcamento_respostas WHERE versao_id = v_v.id AND aplicada_em IS NOT NULL)
    INTO v_aplicada;
    IF p_tipo = 'MUDANCA' AND NOT v_aplicada THEN
        RAISE EXCEPTION 'SOLICITACAO_INDISPONIVEL';
    END IF;
    IF p_tipo = 'NEGOCIAR' AND (v_aplicada OR v_v.encerrada_em IS NOT NULL OR v_e.status <> 'AGUARDANDO_APROVACAO') THEN
        RAISE EXCEPTION 'PROPOSTA_ALTERADA';
    END IF;
    IF v_mensagem = '' THEN
        v_mensagem := CASE p_tipo
            WHEN 'NEGOCIAR' THEN 'Quero negociar este orçamento.'
            WHEN 'MUDANCA' THEN 'Quero solicitar uma correção na decisão do orçamento.'
            ELSE '' END;
    END IF;
    IF char_length(v_mensagem) = 0 THEN
        RAISE EXCEPTION 'MENSAGEM_INVALIDA';
    END IF;
    IF (SELECT count(*) FROM public.orcamento_solicitacoes so
        WHERE so.versao_id = v_v.id AND so.criado_em > v_agora - INTERVAL '1 hour') >= 5 THEN
        RAISE EXCEPTION 'LIMITE_SOLICITACOES';
    END IF;

    INSERT INTO public.orcamento_solicitacoes
        (empresa_id, equipamento_id, versao_id, tipo, mensagem, criado_em, contato_id, contato_nome)
    VALUES
        (v_v.empresa_id, v_v.equipamento_id, v_v.id, p_tipo, v_mensagem, v_agora, v_s.s_contato_id, v_s.s_contato_nome)
    RETURNING id INTO v_id;

    UPDATE public.equipamentos SET ultima_atividade_cliente_em = CURRENT_TIMESTAMP
    WHERE id = v_e.id AND empresa_id = v_e.empresa_id;

    v_rotulo := COALESCE(NULLIF(public.autoos_portal_rotulo_equipamento(v_e.tipo, v_e.marca, v_e.modelo), ''), 'Equipamento')
        || ' (série ' || left(v_e.serial_number, 60) || ')';
    PERFORM public.autoos_portal_alerta(
        v_v.empresa_id, v_v.equipamento_id,
        CASE p_tipo WHEN 'NEGOCIAR' THEN 'NEGOCIACAO_SOLICITADA' WHEN 'MUDANCA' THEN 'CORRECAO_SOLICITADA' ELSE 'DUVIDA_RECEBIDA' END,
        CASE p_tipo WHEN 'NEGOCIAR' THEN 'Cliente quer negociar o orçamento'
                    WHEN 'MUDANCA' THEN 'Cliente pediu correção da decisão já efetivada'
                    ELSE 'Cliente enviou uma dúvida' END,
        format('%s. Orçamento v%s. %s: "%s" (protocolo S-%s).%s', v_rotulo, v_v.versao, v_s.s_contato_nome,
               left(v_mensagem, 300), v_id,
               CASE p_tipo WHEN 'NEGOCIAR' THEN ' Não é aceite, recusa nem prorrogação. Para mudar valores, altere o orçamento e publique nova versão.'
                           WHEN 'MUDANCA' THEN ' Mudar só o status não desfaz baixa de peças nem trabalho iniciado: use Corrigir decisão.'
                           ELSE '' END),
        NULL, v_id, v_s.s_contato_id);

    RETURN jsonb_build_object('id', v_id, 'protocolo', 'S-' || v_id, 'tipo', p_tipo, 'criadoEm', v_agora);
END;
$$;

-- ─── Efetivação no servidor ──────────────────────────────────────────────────
-- Espelha `aprovar_orcamento` + `aplicar_decisoes` (src-tauri) para aceitar ou recusar o
-- orçamento INTEIRO: mesma verificação por empresa, mesma validação de serviços e peças,
-- mesma baixa limitada ao saldo (o resto vira pendência), mesmo registro de decisões.
-- Diferença deliberada: o valor efetivado é o da versão que o cliente aceitou.
-- Falhas de regra levantam 'PORTAL_EFETIVACAO:<motivo>' e nada é gravado.
CREATE OR REPLACE FUNCTION public.portal_efetivar_resposta(p_resposta_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_r RECORD;
    v_v RECORD;
    v_ultima BIGINT;
    v_e RECORD;
    v_cliente_contato INTEGER;
    v_ver RECORD;
    v_servicos JSONB;
    v_pecas_antigas JSONB;
    v_aprovado BOOLEAN;
    v_servico JSONB;
    v_peca JSONB;
    v_idx INTEGER;
    v_ids TEXT[] := ARRAY[]::TEXT[];
    v_vinculadas TEXT[] := ARRAY[]::TEXT[];
    v_produtos INTEGER[];
    v_item RECORD;
    v_anterior RECORD;
    v_nova INTEGER;
    v_restante INTEGER;
    v_saldo INTEGER;
    v_baixa INTEGER;
    v_pecas_aceitas JSONB := '[]'::JSONB;
    v_total NUMERIC;
    v_status TEXT;
    v_rotulo TEXT;
    v_baixadas INTEGER := 0;
    v_pendentes INTEGER := 0;
BEGIN
    SELECT * INTO v_r FROM public.orcamento_respostas WHERE id = p_resposta_id;
    IF NOT FOUND OR v_r.origem <> 'PORTAL_CLIENTE' OR v_r.decisao NOT IN ('APROVAR', 'RECUSAR')
       OR v_r.aplicada_em IS NOT NULL THEN
        RETURN 'IGNORADA';
    END IF;

    -- Ordem de bloqueio de `aprovar_orcamento` + `conferir_e_aplicar_resposta` no desktop:
    -- equipamento, verificação, versão. Editar a verificação (trigger que encerra versões) segue
    -- verificação → versão; a mesma ordem aqui evita ciclo.
    SELECT * INTO v_e FROM public.equipamentos
    WHERE id = v_r.equipamento_id AND empresa_id = v_r.empresa_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PORTAL_EFETIVACAO:ATENDIMENTO_REMOVIDO';
    END IF;
    IF EXISTS (SELECT 1 FROM public.verificacoes
               WHERE equipamento_id = v_e.id AND empresa_id IS NOT NULL AND empresa_id <> v_e.empresa_id) THEN
        RAISE EXCEPTION 'PORTAL_EFETIVACAO:VERIFICACAO_DE_OUTRA_EMPRESA';
    END IF;
    SELECT id, empresa_id, servicos_necessarios, pecas_necessarias, custo_total INTO v_ver
    FROM public.verificacoes
    WHERE equipamento_id = v_e.id AND (empresa_id = v_e.empresa_id OR empresa_id IS NULL)
    ORDER BY (empresa_id = v_e.empresa_id) DESC, id DESC
    LIMIT 1
    FOR UPDATE;
    SELECT * INTO v_v FROM public.orcamento_versoes WHERE id = v_r.versao_id FOR UPDATE;
    SELECT id INTO v_ultima FROM public.orcamento_respostas WHERE versao_id = v_v.id ORDER BY id DESC LIMIT 1;
    SELECT aplicada_em IS NOT NULL AS aplicada, decisao INTO v_item FROM public.orcamento_respostas WHERE id = p_resposta_id;
    IF v_ultima <> p_resposta_id OR v_item.aplicada THEN
        RETURN 'IGNORADA';
    END IF;
    IF clock_timestamp() < v_r.registrada_em + make_interval(mins => public.autoos_portal_janela_minutos()) THEN
        RETURN 'AGUARDANDO_PRAZO';
    END IF;
    IF v_e.status IS DISTINCT FROM 'AGUARDANDO_APROVACAO' THEN
        RAISE EXCEPTION 'PORTAL_EFETIVACAO:ETAPA_ALTERADA';
    END IF;
    SELECT cliente_id INTO v_cliente_contato FROM public.cliente_contatos WHERE id = v_r.contato_id;
    IF v_cliente_contato IS NULL OR v_e.cliente_id IS DISTINCT FROM v_cliente_contato THEN
        RAISE EXCEPTION 'PORTAL_EFETIVACAO:ATENDIMENTO_TRANSFERIDO';
    END IF;
    IF v_v.encerrada_em IS NOT NULL THEN
        RAISE EXCEPTION 'PORTAL_EFETIVACAO:PROPOSTA_ALTERADA';
    END IF;

    IF v_ver.id IS NULL THEN
        RAISE EXCEPTION 'PORTAL_EFETIVACAO:SEM_VERIFICACAO';
    END IF;
    IF v_v.verificacao_id IS DISTINCT FROM v_ver.id THEN
        RAISE EXCEPTION 'PORTAL_EFETIVACAO:PROPOSTA_ALTERADA';
    END IF;

    BEGIN
        v_servicos := COALESCE(NULLIF(btrim(v_ver.servicos_necessarios), ''), '[]')::JSONB;
        v_pecas_antigas := COALESCE(NULLIF(btrim(v_ver.pecas_necessarias), ''), '[]')::JSONB;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'PORTAL_EFETIVACAO:ORCAMENTO_INVALIDO';
    END;
    IF jsonb_typeof(v_servicos) <> 'array' OR jsonb_typeof(v_pecas_antigas) <> 'array' THEN
        RAISE EXCEPTION 'PORTAL_EFETIVACAO:ORCAMENTO_INVALIDO';
    END IF;

    -- normalizar_servicos: serviço sem id recebe `legacy:<índice>`.
    SELECT COALESCE(jsonb_agg(CASE
               WHEN jsonb_typeof(s) <> 'object' THEN NULL
               WHEN jsonb_typeof(s->'id') = 'string' THEN s
               ELSE s || jsonb_build_object('id', 'legacy:' || (n - 1)) END ORDER BY n), '[]'::JSONB)
    INTO v_servicos
    FROM jsonb_array_elements(v_servicos) WITH ORDINALITY AS t(s, n);

    -- parse_servicos: ids únicos e não vazios, valores e peças válidos.
    FOR v_servico IN SELECT value FROM jsonb_array_elements(v_servicos) LOOP
        IF v_servico IS NULL OR v_servico = 'null'::JSONB
           OR btrim(v_servico->>'id') = '' OR (v_servico->>'id') = ANY (v_ids) THEN
            RAISE EXCEPTION 'PORTAL_EFETIVACAO:ORCAMENTO_INVALIDO';
        END IF;
        v_ids := v_ids || (v_servico->>'id');
        IF v_servico ? 'valor' AND (jsonb_typeof(v_servico->'valor') <> 'number' OR (v_servico->>'valor')::NUMERIC < 0) THEN
            RAISE EXCEPTION 'PORTAL_EFETIVACAO:ORCAMENTO_INVALIDO';
        END IF;
        IF v_servico ? 'pecas' AND jsonb_typeof(v_servico->'pecas') NOT IN ('array', 'null') THEN
            RAISE EXCEPTION 'PORTAL_EFETIVACAO:ORCAMENTO_INVALIDO';
        END IF;
        FOR v_peca IN SELECT value FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(v_servico->'pecas') = 'array' THEN v_servico->'pecas' ELSE '[]'::JSONB END) LOOP
            IF jsonb_typeof(v_peca->'produto_id') <> 'number' OR jsonb_typeof(v_peca->'quantidade') <> 'number'
               OR (v_peca->>'produto_id')::NUMERIC <= 0 OR (v_peca->>'quantidade')::NUMERIC <= 0
               OR (v_peca->>'produto_id')::NUMERIC <> trunc((v_peca->>'produto_id')::NUMERIC)
               OR (v_peca->>'quantidade')::NUMERIC <> trunc((v_peca->>'quantidade')::NUMERIC)
               OR (v_peca ? 'valor_unitario' AND (jsonb_typeof(v_peca->'valor_unitario') <> 'number'
                                                  OR (v_peca->>'valor_unitario')::NUMERIC < 0)) THEN
                RAISE EXCEPTION 'PORTAL_EFETIVACAO:ORCAMENTO_INVALIDO';
            END IF;
            v_vinculadas := v_vinculadas || ((v_servico->>'id') || ':' || (v_peca->>'produto_id')::INTEGER);
        END LOOP;
    END LOOP;

    v_aprovado := v_r.decisao = 'APROVAR';
    IF v_aprovado AND jsonb_array_length(v_servicos) > 0 AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_pecas_antigas) p
        WHERE NOT COALESCE(p->>'id' = ANY (v_vinculadas), FALSE)
    ) THEN
        RAISE EXCEPTION 'PORTAL_EFETIVACAO:PECAS_SEM_SERVICO';
    END IF;

    -- A resposta é marcada antes de mexer na verificação: `autoos_encerrar_orcamento_versoes`
    -- preserva os links de versões com resposta aplicada (mesma ordem do desktop).
    UPDATE public.orcamento_respostas
    SET aplicada_em = statement_timestamp(), aplicada_pelo_sistema = TRUE,
        efetivacao_tentativas = efetivacao_tentativas + 1, efetivacao_erro = NULL
    WHERE id = p_resposta_id;

    -- aplicar_decisoes: ordem global de bloqueio por produto.
    SELECT array_agg(DISTINCT (p->>'produto_id')::INTEGER ORDER BY (p->>'produto_id')::INTEGER) INTO v_produtos
    FROM jsonb_array_elements(v_servicos) s,
         jsonb_array_elements(CASE WHEN v_aprovado AND jsonb_typeof(s->'pecas') = 'array' THEN s->'pecas' ELSE '[]'::JSONB END) p;
    PERFORM 1 FROM public.produtos WHERE id = ANY (COALESCE(v_produtos, ARRAY[]::INTEGER[]))
        AND empresa_id = v_e.empresa_id ORDER BY id FOR UPDATE;

    FOR v_servico IN SELECT value FROM jsonb_array_elements(v_servicos) LOOP
        INSERT INTO public.orcamento_servicos_decisao (verificacao_id, servico_id, empresa_id, decisao)
        VALUES (v_ver.id, v_servico->>'id', v_e.empresa_id, CASE WHEN v_aprovado THEN 'APROVADO' ELSE 'REPROVADO' END)
        ON CONFLICT (verificacao_id, servico_id) DO UPDATE
        SET decisao = EXCLUDED.decisao, decidido_em = NOW();

        IF NOT v_aprovado THEN
            UPDATE public.orcamento_consumos SET quantidade_aprovada = quantidade_baixada
            WHERE verificacao_id = v_ver.id AND servico_id = v_servico->>'id';
            CONTINUE;
        END IF;

        FOR v_item IN
            SELECT (p->>'produto_id')::INTEGER AS produto_id, sum((p->>'quantidade')::INTEGER)::INTEGER AS quantidade
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_servico->'pecas') = 'array' THEN v_servico->'pecas' ELSE '[]'::JSONB END) p
            GROUP BY 1 ORDER BY 1
        LOOP
            SELECT quantidade_aprovada, quantidade_baixada INTO v_anterior
            FROM public.orcamento_consumos
            WHERE verificacao_id = v_ver.id AND servico_id = v_servico->>'id' AND produto_id = v_item.produto_id
            FOR UPDATE;
            v_nova := GREATEST(v_item.quantidade, COALESCE(v_anterior.quantidade_baixada, 0));
            INSERT INTO public.orcamento_consumos
                (verificacao_id, servico_id, produto_id, empresa_id, quantidade_aprovada, quantidade_baixada)
            VALUES (v_ver.id, v_servico->>'id', v_item.produto_id, v_e.empresa_id, v_nova, 0)
            ON CONFLICT (verificacao_id, servico_id, produto_id)
            DO UPDATE SET quantidade_aprovada = EXCLUDED.quantidade_aprovada;

            v_restante := GREATEST(v_nova - COALESCE(v_anterior.quantidade_aprovada, 0), 0);
            IF v_restante > 0 THEN
                -- baixar_disponivel: nunca negativo; o que faltar fica como pendência.
                SELECT COALESCE(quantidade_estoque, 0) INTO v_saldo FROM public.produtos
                WHERE id = v_item.produto_id AND empresa_id = v_e.empresa_id AND ativo = TRUE FOR UPDATE;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'PORTAL_EFETIVACAO:PRODUTO_INDISPONIVEL';
                END IF;
                v_baixa := LEAST(GREATEST(v_saldo, 0), v_restante);
                IF v_baixa > 0 THEN
                    UPDATE public.produtos SET quantidade_estoque = quantidade_estoque - v_baixa, atualizado_em = NOW()
                    WHERE id = v_item.produto_id AND empresa_id = v_e.empresa_id;
                    INSERT INTO public.movimentacoes_estoque
                        (produto_id, tipo, quantidade, origem, referencia, usuario, data_hora, empresa_id)
                    VALUES (v_item.produto_id, 'SAIDA', v_baixa, 'MANUTENCAO',
                            format('verificacao:%s;servico:%s', v_ver.id, v_servico->>'id'), 'AutoOS', NOW(), v_e.empresa_id);
                    UPDATE public.orcamento_consumos SET quantidade_baixada = quantidade_baixada + v_baixa
                    WHERE verificacao_id = v_ver.id AND servico_id = v_servico->>'id' AND produto_id = v_item.produto_id;
                END IF;
                v_baixadas := v_baixadas + v_baixa;
                v_pendentes := v_pendentes + (v_restante - v_baixa);
            END IF;
        END LOOP;

        FOR v_peca IN SELECT value FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(v_servico->'pecas') = 'array' THEN v_servico->'pecas' ELSE '[]'::JSONB END) LOOP
            v_pecas_aceitas := v_pecas_aceitas || jsonb_build_array(jsonb_build_object(
                'id', (v_servico->>'id') || ':' || (v_peca->>'produto_id')::INTEGER,
                'nome', COALESCE(v_peca->>'nome', 'Peça'),
                'quantidade', (v_peca->>'quantidade')::INTEGER,
                'valorUnitario', COALESCE((v_peca->>'valor_unitario')::NUMERIC, 0),
                'valorTotal', (v_peca->>'quantidade')::INTEGER * COALESCE((v_peca->>'valor_unitario')::NUMERIC, 0)
            ));
        END LOOP;
    END LOOP;

    IF v_aprovado THEN
        v_status := 'APROVADO';
        v_total := v_v.valor_total;
        IF jsonb_array_length(v_servicos) = 0 THEN
            v_pecas_aceitas := v_pecas_antigas;
        END IF;
    ELSE
        v_status := 'REPROVADO';
        v_pecas_aceitas := v_pecas_antigas;
        v_total := COALESCE(NULLIF(v_e.valor_orcamento, 0), NULLIF(v_ver.custo_total::NUMERIC, 0),
                            v_e.valor_orcamento, v_ver.custo_total::NUMERIC, 0);
    END IF;
    IF v_total IS NULL OR v_total < 0 THEN
        RAISE EXCEPTION 'PORTAL_EFETIVACAO:TOTAL_INVALIDO';
    END IF;

    UPDATE public.verificacoes
    SET forma_pagamento_codigo = CASE WHEN v_aprovado THEN COALESCE(forma_pagamento_codigo, 'A_COMBINAR') ELSE forma_pagamento_codigo END,
        empresa_id = COALESCE(empresa_id, v_e.empresa_id),
        servicos_orcamento_original = COALESCE(servicos_orcamento_original, servicos_necessarios::JSONB),
        pecas_orcamento_original = COALESCE(pecas_orcamento_original, pecas_necessarias::JSONB),
        valor_orcamento_original = COALESCE(valor_orcamento_original, custo_total),
        servicos_necessarios = v_servicos::TEXT,
        pecas_necessarias = v_pecas_aceitas::TEXT,
        custo_total = v_total
    WHERE id = v_ver.id AND equipamento_id = v_e.id AND (empresa_id = v_e.empresa_id OR empresa_id IS NULL);

    UPDATE public.equipamentos
    SET status = v_status, valor_orcamento = v_total,
        data_aprovacao = CASE WHEN v_aprovado THEN NOW()::TEXT ELSE data_aprovacao END,
        data_reprovacao = CASE WHEN NOT v_aprovado THEN NOW()::TEXT ELSE data_reprovacao END,
        atualizado_em = NOW(),
        ultima_atividade_cliente_em = CURRENT_TIMESTAMP
    WHERE id = v_e.id AND empresa_id = v_e.empresa_id;

    INSERT INTO public.security_audit_log (event_type, profile_id, profile_name, details, success, empresa_id)
    VALUES (
        CASE WHEN v_aprovado THEN 'BUDGET_APPROVED' ELSE 'BUDGET_REJECTED' END,
        NULL,
        left('Portal do cliente: ' || COALESCE(v_r.contato_nome, 'contato'), 120),
        format('empresa_id=%s; equipamento_id=%s; verificacao_id=%s; pagamento_codigo=%s; status_anterior=AGUARDANDO_APROVACAO; status=%s; motivo=%s; origem=PORTAL_CLIENTE; resposta_id=%s; contato_id=%s; versao=%s; valor=%s; pecas_baixadas=%s; pecas_pendentes=%s',
               v_e.empresa_id, v_e.id, v_ver.id, CASE WHEN v_aprovado THEN 'A_COMBINAR_SE_VAZIO' ELSE '' END,
               v_status, CASE WHEN v_aprovado THEN 'Orçamento aceito pelo cliente no portal.' ELSE 'Orçamento recusado pelo cliente no portal.' END,
               v_r.id, v_r.contato_id, v_v.versao, v_total, v_baixadas, v_pendentes),
        TRUE,
        v_e.empresa_id
    );

    v_rotulo := COALESCE(NULLIF(public.autoos_portal_rotulo_equipamento(v_e.tipo, v_e.marca, v_e.modelo), ''), 'Equipamento')
        || ' (série ' || left(v_e.serial_number, 60) || ')';
    PERFORM public.autoos_portal_alerta(
        v_e.empresa_id, v_e.id, 'DECISAO_EFETIVADA',
        CASE WHEN v_aprovado THEN 'Orçamento APROVADO pelo cliente (efetivado)' ELSE 'Orçamento REPROVADO pelo cliente (efetivado)' END,
        format('%s. Orçamento v%s, R$ %s. Resposta de %s (protocolo R-%s) efetivada após o prazo de correção.%s',
               v_rotulo, v_v.versao, public.autoos_portal_moeda(v_total), v_r.contato_nome, v_r.id,
               CASE WHEN v_pendentes > 0 THEN format(' %s peça(s) sem saldo ficaram pendentes.', v_pendentes)
                    WHEN v_aprovado THEN ' Forma de pagamento: a combinar, se não havia outra.' ELSE '' END),
        v_r.id, NULL, v_r.contato_id);
    RETURN 'EFETIVADA';
END;
$$;

-- Processa respostas cujo prazo de correção terminou. Cada uma em sua subtransação: uma falha
-- não impede as demais. Falha de regra para de tentar e avisa a equipe; falha transitória
-- (bloqueio, conexão) é repetida até 3 vezes. Chamado pelo pg_cron e pela Edge Function.
CREATE OR REPLACE FUNCTION public.portal_efetivar_respostas_vencidas(
    p_limite INTEGER DEFAULT 20,
    p_empresa_id INTEGER DEFAULT NULL,
    p_cliente_id INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_id BIGINT;
    v_resultado TEXT;
    v_erro TEXT;
    v_motivo TEXT;
    v_definitiva BOOLEAN;
    v_tentativas INTEGER;
    v_r RECORD;
    v_efetivadas INTEGER := 0;
    v_falhas INTEGER := 0;
BEGIN
    SET LOCAL lock_timeout = '5s';
    FOR v_id IN
        SELECT r.id
        FROM public.orcamento_respostas r
        JOIN public.equipamentos e ON e.id = r.equipamento_id AND e.empresa_id = r.empresa_id
        WHERE r.origem = 'PORTAL_CLIENTE' AND r.decisao IN ('APROVAR', 'RECUSAR')
          AND r.aplicada_em IS NULL AND r.efetivacao_falhou_em IS NULL
          AND r.registrada_em + make_interval(mins => public.autoos_portal_janela_minutos()) <= clock_timestamp()
          AND r.id = (SELECT max(r2.id) FROM public.orcamento_respostas r2 WHERE r2.versao_id = r.versao_id)
          AND (p_empresa_id IS NULL OR r.empresa_id = p_empresa_id)
          AND (p_cliente_id IS NULL OR e.cliente_id = p_cliente_id
               OR EXISTS (SELECT 1 FROM public.cliente_contatos c WHERE c.id = r.contato_id AND c.cliente_id = p_cliente_id))
        ORDER BY r.registrada_em
        LIMIT LEAST(GREATEST(p_limite, 1), 100)
    LOOP
        BEGIN
            v_resultado := public.portal_efetivar_resposta(v_id);
            IF v_resultado = 'EFETIVADA' THEN
                v_efetivadas := v_efetivadas + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
            v_definitiva := v_erro LIKE 'PORTAL_EFETIVACAO:%';
            v_motivo := CASE WHEN v_definitiva THEN substr(v_erro, 19) ELSE 'FALHA_TEMPORARIA' END;
            UPDATE public.orcamento_respostas
            SET efetivacao_tentativas = efetivacao_tentativas + 1,
                efetivacao_erro = left(CASE WHEN v_definitiva THEN v_motivo ELSE 'FALHA_TEMPORARIA: ' || v_erro END, 300),
                efetivacao_falhou_em = CASE WHEN v_definitiva OR efetivacao_tentativas + 1 >= 3
                                            THEN clock_timestamp() ELSE NULL END
            WHERE id = v_id
            RETURNING efetivacao_tentativas, efetivacao_falhou_em IS NOT NULL AS falhou, equipamento_id, empresa_id,
                      contato_id, contato_nome, decisao
            INTO v_r;
            IF v_r.falhou THEN
                v_falhas := v_falhas + 1;
                PERFORM public.autoos_portal_alerta(
                    v_r.empresa_id,
                    (SELECT id FROM public.equipamentos WHERE id = v_r.equipamento_id AND empresa_id = v_r.empresa_id),
                    'EFETIVACAO_FALHOU',
                    'Resposta do cliente NÃO efetivada — ação da equipe necessária',
                    format('%s %s o orçamento (protocolo R-%s), mas o sistema não conseguiu efetivar: %s. A resposta continua pendente; confira e aplique pelo AutoOS ou fale com o cliente.',
                           v_r.contato_nome, CASE WHEN v_r.decisao = 'APROVAR' THEN 'aceitou' ELSE 'recusou' END, v_id,
                           CASE v_motivo
                               WHEN 'ETAPA_ALTERADA' THEN 'a etapa do equipamento mudou'
                               WHEN 'PROPOSTA_ALTERADA' THEN 'o orçamento foi alterado'
                               WHEN 'ATENDIMENTO_TRANSFERIDO' THEN 'o atendimento foi transferido de cliente'
                               WHEN 'PECAS_SEM_SERVICO' THEN 'há peças antigas sem serviço vinculado'
                               WHEN 'PRODUTO_INDISPONIVEL' THEN 'um produto do orçamento está inativo ou é de outra empresa'
                               WHEN 'ORCAMENTO_INVALIDO' THEN 'os itens do orçamento estão inválidos'
                               ELSE lower(replace(v_motivo, '_', ' ')) END),
                    v_id, NULL, v_r.contato_id);
            END IF;
        END;
    END LOOP;
    RETURN jsonb_build_object('efetivadas', v_efetivadas, 'falhas', v_falhas);
END;
$$;

-- Provedor de WhatsApp da empresa para o código de acesso. Ao contrário do processador de
-- eventos (0033), vale também no modo LOCAL: o código precisa sair com o desktop fechado.
-- Nenhum segredo aqui; o token fica em `WHATSAPP_TOKENS` da Edge Function.
CREATE OR REPLACE FUNCTION public.portal_config_envio_whatsapp(p_empresa_id INTEGER)
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
    WHERE c.empresa_id = p_empresa_id
      AND ((c.provedor = 'EVOLUTION' AND c.evolution_api_url ~ '^https://')
           OR (c.provedor = 'CLOUD_API' AND c.cloud_phone_number_id ~ '^[0-9]+$'));
$$;

-- ─── RLS e privilégios ───────────────────────────────────────────────────────
ALTER TABLE public.portal_cliente_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_contato_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_codigos ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_alertas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_contato_empresa_empresa ON portal_contato_empresa;
CREATE POLICY portal_contato_empresa_empresa ON portal_contato_empresa FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);
DROP POLICY IF EXISTS portal_codigos_empresa ON portal_codigos;
CREATE POLICY portal_codigos_empresa ON portal_codigos FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);
DROP POLICY IF EXISTS portal_sessoes_empresa ON portal_sessoes;
CREATE POLICY portal_sessoes_empresa ON portal_sessoes FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);
DROP POLICY IF EXISTS portal_alertas_empresa ON portal_alertas;
CREATE POLICY portal_alertas_empresa ON portal_alertas FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);

DO $$
DECLARE
    v_role TEXT;
    v_tabela TEXT;
    v_funcao TEXT;
    v_publicas TEXT[] := ARRAY[
        'public.portal_criar_desafio(TEXT, TEXT, UUID, TEXT)',
        'public.portal_criar_desafio_sessao(TEXT, TEXT, UUID, TEXT)',
        'public.portal_registrar_entrega_codigo(BIGINT, TEXT, TEXT)',
        'public.portal_verificar_codigo(UUID, TEXT, TEXT, TEXT)',
        'public.portal_encerrar_sessao(TEXT)',
        'public.portal_listar_atendimentos(TEXT)',
        'public.portal_detalhe_atendimento(TEXT, INTEGER)',
        'public.portal_registrar_resposta(TEXT, INTEGER, BIGINT, TEXT, BIGINT)',
        'public.portal_registrar_solicitacao(TEXT, INTEGER, BIGINT, TEXT, TEXT)',
        'public.portal_efetivar_respostas_vencidas(INTEGER, INTEGER, INTEGER)',
        'public.portal_config_envio_whatsapp(INTEGER)'
    ];
    v_internas TEXT[] := ARRAY[
        'public.portal_efetivar_resposta(BIGINT)',
        'public.autoos_portal_sessao(TEXT)',
        'public.autoos_portal_alerta(INTEGER, INTEGER, TEXT, TEXT, TEXT, BIGINT, BIGINT, INTEGER)'
    ];
BEGIN
    FOREACH v_funcao IN ARRAY v_publicas || v_internas LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_funcao);
    END LOOP;
    FOREACH v_tabela IN ARRAY ARRAY['public.portal_cliente_config', 'public.portal_contato_empresa',
                                     'public.portal_codigos', 'public.portal_sessoes', 'public.portal_alertas'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC', v_tabela);
    END LOOP;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
            FOREACH v_tabela IN ARRAY ARRAY['public.portal_cliente_config', 'public.portal_contato_empresa',
                                             'public.portal_codigos', 'public.portal_sessoes', 'public.portal_alertas'] LOOP
                EXECUTE format('REVOKE ALL ON TABLE %s FROM %I', v_tabela, v_role);
            END LOOP;
            FOREACH v_funcao IN ARRAY v_publicas || v_internas LOOP
                EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_funcao, v_role);
            END LOOP;
        END IF;
    END LOOP;
    -- A Edge Function `portal-cliente` chega ao banco só por estas funções.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        FOREACH v_funcao IN ARRAY v_publicas LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_funcao);
        END LOOP;
    END IF;
END;
$$;
