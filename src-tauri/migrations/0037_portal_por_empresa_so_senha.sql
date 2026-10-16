-- 0037: Portal do Cliente por empresa e só com senha.
--
-- 1. As chaves "Portal ligado" e "Clientes podem responder orçamentos" passam a ser de cada
--    empresa (`portal_config_empresa`). As colunas globais `portal_cliente_config.portal_enabled`
--    e `orcamento_aceite_config.online_enabled` deixam de ser lidas; o valor delas é copiado para
--    todas as empresas existentes. Empresa sem linha = tudo desligado.
-- 2. O login por código (WhatsApp/email) sai: entrada e reconfirmação só com a senha que a equipe
--    cria. As funções de código são removidas, sessões abertas por código são encerradas e
--    `autoos_portal_sessao` só aceita sessões por senha. `portal_codigos` fica como histórico.
-- 3. Trocar telefone ou email do contato não retira mais o acesso nem apaga a senha: a regra existia
--    porque o código ia para esses canais. Desativar o contato ou movê-lo de cliente/empresa continua
--    retirando o acesso. Passar a DECIDIR apaga a senha anterior: senha de quem decide orçamento só
--    é criada por quem tem a permissão financeira (o desktop exige isso ao criar a senha).
-- 4. Lista: "aguarda sua resposta" só com versão aberta e respostas ligadas; o limite de 300
--    atendimentos pega os mais recentes. Negociar exige as respostas ligadas.
--
-- As funções redefinidas abaixo são cópias das versões da 0034/0035; mudam só as linhas das chaves
-- (e, na sessão, o método). O portal pausado continua respondendo PORTAL_PAUSADO, agora conferido
-- pela empresa da sessão ou do contato que entrou.

CREATE TABLE IF NOT EXISTS portal_config_empresa (
    empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    portal_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    respostas_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL
);

INSERT INTO portal_config_empresa (empresa_id, portal_enabled, respostas_enabled)
SELECT e.id,
       COALESCE((SELECT portal_enabled FROM public.portal_cliente_config WHERE singleton = TRUE), FALSE),
       COALESCE((SELECT online_enabled FROM public.orcamento_aceite_config WHERE singleton = TRUE), FALSE)
FROM empresas e
ON CONFLICT (empresa_id) DO NOTHING;

COMMENT ON TABLE portal_config_empresa IS
    'Chaves do Portal do Cliente por empresa: login/consulta (portal_enabled) e respostas a orçamentos (respostas_enabled).';
COMMENT ON COLUMN public.portal_cliente_config.portal_enabled IS
    'Sem uso desde a 0037: a chave é por empresa (portal_config_empresa.portal_enabled).';
COMMENT ON COLUMN public.orcamento_aceite_config.online_enabled IS
    'Sem uso desde a 0037: a chave é por empresa (portal_config_empresa.respostas_enabled).';

ALTER TABLE portal_config_empresa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS portal_config_empresa_empresa ON portal_config_empresa;
CREATE POLICY portal_config_empresa_empresa ON portal_config_empresa FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);

CREATE OR REPLACE FUNCTION public.autoos_portal_ligado(p_empresa_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
    SELECT COALESCE((SELECT portal_enabled FROM public.portal_config_empresa WHERE empresa_id = p_empresa_id), FALSE)
$$;

-- Responder exige as duas chaves: sem portal não há onde responder.
CREATE OR REPLACE FUNCTION public.autoos_portal_respostas_ligadas(p_empresa_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
    SELECT COALESCE((SELECT portal_enabled AND respostas_enabled
                     FROM public.portal_config_empresa WHERE empresa_id = p_empresa_id), FALSE)
$$;

-- ─── Login por código removido ───────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.portal_criar_desafio(TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.portal_criar_desafio_sessao(TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.portal_registrar_entrega_codigo(BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.portal_verificar_codigo(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.portal_config_envio_whatsapp(INTEGER);
DROP FUNCTION IF EXISTS public.portal_metodo_sessao(TEXT);

UPDATE portal_sessoes
SET encerrada_em = statement_timestamp(), encerrada_motivo = 'LOGIN_POR_CODIGO_REMOVIDO'
WHERE metodo = 'CODIGO' AND encerrada_em IS NULL;

COMMENT ON TABLE portal_codigos IS 'Histórico do login por código, removido na 0037.';

-- ─── Acesso do contato sem depender de telefone/email ───────────────────────
CREATE OR REPLACE FUNCTION autoos_portal_revisar_acesso_contato()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF OLD.portal_acesso <> 'NENHUM'
       AND (NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
            OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
            OR NOT NEW.ativo) THEN
        NEW.portal_acesso := 'NENHUM';
    END IF;
    IF NEW.portal_acesso = 'NENHUM'
       OR (NEW.portal_acesso = 'DECIDIR' AND OLD.portal_acesso IS DISTINCT FROM 'DECIDIR') THEN
        NEW.portal_senha_hash := NULL;
        NEW.portal_senha_definida_em := NULL;
        NEW.portal_senha_definida_por_profile_id := NULL;
    END IF;
    IF NEW.portal_acesso IS DISTINCT FROM OLD.portal_acesso
       OR NEW.portal_senha_hash IS DISTINCT FROM OLD.portal_senha_hash THEN
        UPDATE public.portal_sessoes
        SET encerrada_em = statement_timestamp(), encerrada_motivo = 'ACESSO_ALTERADO'
        WHERE contato_id = NEW.id AND encerrada_em IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- ─── Funções que liam as chaves globais ──────────────────────────────────────
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
    v_respostas BOOLEAN;
BEGIN
    SELECT * INTO v_s FROM public.autoos_portal_sessao(p_sessao_hash);
    v_respostas := public.autoos_portal_respostas_ligadas(v_s.s_empresa_id);
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
            'aguardaResposta', e.status = 'AGUARDANDO_APROVACAO' AND v.id IS NOT NULL AND v.encerrada_em IS NULL
                AND v_respostas
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
        -- Os 300 mais recentes, não 300 quaisquer.
        ORDER BY GREATEST(COALESCE(e.atualizado_em, e.criado_em), COALESCE(e.ultima_atividade_cliente_em, e.criado_em)) DESC NULLS LAST, e.id DESC
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
BEGIN
    IF p_tipo NOT IN ('NEGOCIAR', 'DUVIDA', 'MUDANCA') THEN
        RAISE EXCEPTION 'TIPO_INVALIDO';
    END IF;
    SELECT * INTO v_s FROM public.autoos_portal_sessao(p_sessao_hash);
    IF p_tipo IN ('NEGOCIAR', 'MUDANCA') AND v_s.s_acesso <> 'DECIDIR' THEN
        RAISE EXCEPTION 'SEM_PERMISSAO_DECISAO';
    END IF;
    -- Negociar faz parte das respostas: com elas desligadas, o cliente fala pelos canais da equipe.
    IF p_tipo = 'NEGOCIAR' AND NOT public.autoos_portal_respostas_ligadas(v_s.s_empresa_id) THEN
        RAISE EXCEPTION 'ACEITE_PAUSADO';
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

    PERFORM public.autoos_portal_alerta(
        v_v.empresa_id, v_v.equipamento_id,
        CASE p_tipo WHEN 'NEGOCIAR' THEN 'NEGOCIACAO_SOLICITADA' WHEN 'MUDANCA' THEN 'CORRECAO_SOLICITADA' ELSE 'DUVIDA_RECEBIDA' END,
        CASE p_tipo WHEN 'NEGOCIAR' THEN 'Cliente quer negociar'
                    WHEN 'MUDANCA' THEN 'Cliente pediu correção'
                    ELSE 'Nova dúvida do cliente' END,
        public.autoos_portal_linha_alerta(v_e.id, v_e.empresa_id, v_v.valor_total, v_s.s_contato_nome)
            || chr(10) || '“' || left(v_mensagem, 140) || CASE WHEN char_length(v_mensagem) > 140 THEN '…' ELSE '' END || '”',
        NULL, v_id, v_s.s_contato_id);

    RETURN jsonb_build_object('id', v_id, 'protocolo', 'S-' || v_id, 'tipo', p_tipo, 'criadoEm', v_agora);
END;
$$;
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
      AND s.metodo = 'SENHA'
      AND c.id = s.contato_id AND c.empresa_id = s.empresa_id AND c.cliente_id = s.cliente_id
      AND c.ativo AND c.portal_acesso <> 'NENHUM'
      AND cl.id = s.cliente_id AND cl.empresa_id = s.empresa_id AND COALESCE(cl.ativo, TRUE)
    RETURNING s.id, s.empresa_id, s.cliente_id, s.contato_id, c.nome, c.portal_acesso, s.verificada_em;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'SESSAO_INVALIDA';
    END IF;
    -- A empresa da sessão desligou o portal: a exceção desfaz o `ultimo_acesso_em` acima.
    IF NOT public.autoos_portal_ligado((SELECT s.empresa_id FROM public.portal_sessoes s WHERE s.token_hash = p_sessao_hash)) THEN
        RAISE EXCEPTION 'PORTAL_PAUSADO';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_entrar_senha(
    p_documento TEXT,
    p_senha TEXT,
    p_nova_sessao_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_config RECORD;
    v_doc TEXT := public.autoos_portal_digitos(p_documento);
    v_c RECORD;
    v_achado RECORD;
    v_achados INTEGER := 0;
    v_candidatos INTEGER := 0;
    v_expira TIMESTAMPTZ;
    v_agora TIMESTAMPTZ := statement_timestamp();
BEGIN
    SELECT * INTO v_config FROM public.portal_cliente_config WHERE singleton = TRUE;
    IF p_nova_sessao_hash IS NULL OR p_nova_sessao_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'SESSAO_INVALIDA';
    END IF;
    IF length(v_doc) NOT IN (11, 14) OR p_senha IS NULL OR octet_length(p_senha) > 72 THEN
        RETURN jsonb_build_object('resultado', 'INVALIDO');
    END IF;

    FOR v_c IN
        SELECT c.id, c.empresa_id, c.cliente_id, c.nome, c.portal_acesso, c.portal_senha_hash
        FROM public.clientes cl
        JOIN public.cliente_contatos c ON c.cliente_id = cl.id AND c.empresa_id = cl.empresa_id
        WHERE COALESCE(cl.ativo, TRUE) AND cl.empresa_id IS NOT NULL
          AND (public.autoos_portal_digitos(cl.documento) = v_doc OR public.autoos_portal_digitos(cl.cpf_cnpj) = v_doc)
          AND c.ativo AND c.portal_acesso <> 'NENHUM' AND c.portal_senha_hash IS NOT NULL
    LOOP
        v_candidatos := v_candidatos + 1;
        IF crypt(p_senha, v_c.portal_senha_hash) = v_c.portal_senha_hash THEN
            v_achados := v_achados + 1;
            v_achado := v_c;
        END IF;
    END LOOP;
    -- Mesmo custo de bcrypt quando o documento não tem senha cadastrada.
    IF v_candidatos = 0 THEN
        PERFORM crypt(p_senha, '$2a$10$Sp6ULFbzsJ7.LiOcTg5M1uMGnl3N8Lxhivn6tUB.I9uJ0NymrU8Sy');
    END IF;
    IF v_achados <> 1 THEN
        RETURN jsonb_build_object('resultado', 'INVALIDO');
    END IF;
    -- Só depois da senha conferida: o aviso de pausa não revela nada a quem não a conhece.
    IF NOT public.autoos_portal_ligado(v_achado.empresa_id) THEN
        RAISE EXCEPTION 'PORTAL_PAUSADO';
    END IF;

    INSERT INTO public.portal_sessoes
        (token_hash, empresa_id, cliente_id, contato_id, expira_em, verificada_em, ultimo_acesso_em, metodo)
    VALUES
        (p_nova_sessao_hash, v_achado.empresa_id, v_achado.cliente_id, v_achado.id,
         v_agora + make_interval(hours => v_config.sessao_horas), v_agora, v_agora, 'SENHA')
    RETURNING expira_em INTO v_expira;

    RETURN jsonb_build_object(
        'resultado', 'OK',
        'contato', v_achado.nome,
        'acesso', v_achado.portal_acesso,
        'expiraEm', v_expira,
        'metodo', 'SENHA'
    );
END;
$$;

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
    v_aceite := public.autoos_portal_respostas_ligadas(v_e.empresa_id);

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
    IF NOT public.autoos_portal_respostas_ligadas(v_s.s_empresa_id) THEN
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

        v_tipo_alerta := CASE
            WHEN p_decisao = 'DESFEITA' THEN 'RESPOSTA_CANCELADA'
            WHEN v_atual.id IS NOT NULL AND v_atual.decisao <> 'DESFEITA' THEN 'RESPOSTA_ALTERADA'
            ELSE 'RESPOSTA_RECEBIDA' END;
        PERFORM public.autoos_portal_alerta(
            v_v.empresa_id, v_v.equipamento_id, v_tipo_alerta,
            CASE p_decisao
                WHEN 'APROVAR' THEN format('Aceite recebido — confirma às %s',
                    to_char((v_agora + make_interval(mins => v_janela)) AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'))
                WHEN 'RECUSAR' THEN format('Recusa recebida — confirma às %s',
                    to_char((v_agora + make_interval(mins => v_janela)) AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'))
                ELSE 'Cliente desfez a resposta' END,
            public.autoos_portal_linha_alerta(v_e.id, v_e.empresa_id, v_v.valor_total, v_s.s_contato_nome)
                || CASE WHEN p_decisao = 'DESFEITA' THEN chr(10) || 'O orçamento voltou a aguardar resposta.' ELSE '' END,
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

DO $$
DECLARE
    v_role TEXT;
    v_funcao TEXT;
    v_internas TEXT[] := ARRAY[
        'public.autoos_portal_ligado(INTEGER)',
        'public.autoos_portal_respostas_ligadas(INTEGER)'
    ];
BEGIN
    FOREACH v_funcao IN ARRAY v_internas LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_funcao);
    END LOOP;
    EXECUTE 'REVOKE ALL ON TABLE public.portal_config_empresa FROM PUBLIC';
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE public.portal_config_empresa FROM %I', v_role);
            FOREACH v_funcao IN ARRAY v_internas LOOP
                EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_funcao, v_role);
            END LOOP;
        END IF;
    END LOOP;
END;
$$;
