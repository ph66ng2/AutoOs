-- 0039: Portal do Cliente com dados ampliados (tudo aditivo).
--
-- 1. Schema: `clientes.exige_ordem_compra`, `orcamento_respostas.ordem_compra`, telefone/email informados
--    em `orcamento_solicitacoes`, endereço e mapa no cartão de contato da empresa.
-- 2. `portal_detalhe_atendimento` devolve também cliente, defeito relatado, valores, etapas (datas
--    conhecidas), fotos (caminho no Storage; a Edge Function monta a URL) e o histórico completo do que
--    o cliente fez no orçamento. As chaves antigas continuam iguais.
-- 3. `portal_registrar_resposta` ganha `p_ordem_compra` (obrigatória ao APROVAR quando o cliente exige).
-- 4. `portal_registrar_solicitacao` ganha telefone/email para retorno e, opcionalmente, grava-os no
--    contato que está logado (só campos vazios).
-- 5. `portal_listar_atendimentos` ganha `valorAtual` por item.
--
-- Os parâmetros novos têm DEFAULT: a Edge Function antiga continua chamando com os nomes de antes. As
-- funções redefinidas são cópias das versões da 0038; mudam só as partes descritas acima.

-- ─── Schema ──────────────────────────────────────────────────────────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS exige_ordem_compra BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orcamento_respostas ADD COLUMN IF NOT EXISTS ordem_compra TEXT;
DO $$ BEGIN
    ALTER TABLE orcamento_respostas ADD CONSTRAINT chk_orcamento_respostas_ordem_compra
        CHECK (ordem_compra IS NULL OR char_length(btrim(ordem_compra)) BETWEEN 1 AND 60);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE orcamento_solicitacoes
    ADD COLUMN IF NOT EXISTS contato_telefone TEXT,
    ADD COLUMN IF NOT EXISTS contato_email TEXT;
DO $$ BEGIN
    ALTER TABLE orcamento_solicitacoes ADD CONSTRAINT chk_orcamento_solicitacoes_contato_retorno
        CHECK (char_length(COALESCE(contato_telefone, '')) <= 20 AND char_length(COALESCE(contato_email, '')) <= 200);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE portal_contato_empresa
    ADD COLUMN IF NOT EXISTS endereco TEXT,
    ADD COLUMN IF NOT EXISTS maps_url TEXT;
DO $$ BEGIN
    ALTER TABLE portal_contato_empresa ADD CONSTRAINT chk_portal_contato_endereco
        CHECK (char_length(COALESCE(endereco, '')) <= 300);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE portal_contato_empresa ADD CONSTRAINT chk_portal_contato_maps_url
        CHECK (maps_url IS NULL OR (maps_url ~* '^https://[^[:space:]]+$' AND char_length(maps_url) <= 500));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN clientes.exige_ordem_compra IS
    'Quando verdadeiro, o cliente precisa informar a ordem de compra para aprovar um orçamento pelo portal.';

-- A ordem de compra e o contato de retorno também não podem ser reescritos depois de gravados.
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
       OR NEW.ordem_compra IS DISTINCT FROM OLD.ordem_compra
       OR (OLD.contato_id IS NOT NULL AND NEW.contato_id IS NOT NULL AND NEW.contato_id <> OLD.contato_id)
       OR (OLD.aplicada_em IS NOT NULL
           AND (NEW.aplicada_em IS DISTINCT FROM OLD.aplicada_em
                OR NEW.aplicada_pelo_sistema IS DISTINCT FROM OLD.aplicada_pelo_sistema)) THEN
        RAISE EXCEPTION 'Resposta de orçamento é imutável';
    END IF;
    RETURN NEW;
END;
$$;

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
       OR NEW.contato_telefone IS DISTINCT FROM OLD.contato_telefone
       OR NEW.contato_email IS DISTINCT FROM OLD.contato_email
       OR (OLD.tratado_em IS NOT NULL AND NEW.tratado_em IS DISTINCT FROM OLD.tratado_em) THEN
        RAISE EXCEPTION 'Mensagem do cliente é imutável';
    END IF;
    RETURN NEW;
END;
$$;

-- ─── Auxiliar: data de coluna TEXT (legado) para timestamptz ─────────────────
-- As datas de etapa de `equipamentos` são texto: 'AAAA-MM-DD', 'AAAA-MM-DD HH:MM:SS+00' ou ISO com 'T'/'Z'.
-- Só data: meio-dia de Brasília (não muda de dia ao exibir). Sem fuso: UTC, como o resto do histórico.
-- Texto fora desses formatos vira NULL (etapa sem data conhecida), nunca erro.
CREATE OR REPLACE FUNCTION public.autoos_portal_ts(p_valor TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    t TEXT := btrim(COALESCE(p_valor, ''));
BEGIN
    IF t ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RETURN (t::DATE + TIME '12:00') AT TIME ZONE 'America/Sao_Paulo';
    END IF;
    IF t ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)? ?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN
        RETURN t::TIMESTAMPTZ;
    END IF;
    IF t ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?$' THEN
        RETURN t::TIMESTAMP AT TIME ZONE 'UTC';
    END IF;
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- ─── Lista: valor atual por item ─────────────────────────────────────────────
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
            'valorAtual', COALESCE(e.valor_final, e.valor_orcamento),
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

-- ─── Detalhe ─────────────────────────────────────────────────────────────────
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
    v_cliente JSONB;
    v_etapas JSONB;
    v_fotos JSONB;
    v_historico JSONB;
    v_tem_telefone BOOLEAN;
    v_tem_email BOOLEAN;
    v_recebido TIMESTAMPTZ;
    v_ini_verif TIMESTAMPTZ;
    v_fim_verif TIMESTAMPTZ;
    v_publicado TIMESTAMPTZ;
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
                'protocolo', 'R-' || v_r.id,
                'ordemCompra', v_r.ordem_compra
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
                              'telefone', pc.telefone, 'horario', pc.horario,
                              'endereco', pc.endereco, 'mapsUrl', pc.maps_url)
    INTO v_contato
    FROM public.portal_contato_empresa pc WHERE pc.empresa_id = v_e.empresa_id;

    -- Cliente: o mesmo nome da lista e o documento (só dígitos) que o próprio cliente usa para entrar.
    SELECT jsonb_build_object(
        'nome', COALESCE(NULLIF(btrim(cl.nome_fantasia), ''), NULLIF(btrim(cl.razao_social), ''), cl.nome),
        'documento', CASE
            WHEN length(public.autoos_portal_digitos(cl.documento)) IN (11, 14) THEN public.autoos_portal_digitos(cl.documento)
            WHEN length(public.autoos_portal_digitos(cl.cpf_cnpj)) IN (11, 14) THEN public.autoos_portal_digitos(cl.cpf_cnpj)
        END,
        'exigeOrdemCompra', COALESCE(cl.exige_ordem_compra, FALSE))
    INTO v_cliente
    FROM public.clientes cl WHERE cl.id = v_e.cliente_id AND cl.empresa_id = v_e.empresa_id;

    SELECT length(public.autoos_portal_digitos(c.telefone)) >= 10, btrim(COALESCE(c.email, '')) <> ''
    INTO v_tem_telefone, v_tem_email
    FROM public.cliente_contatos c WHERE c.id = v_s.s_contato_id AND c.empresa_id = v_s.s_empresa_id;

    -- Etapas com data conhecida. Fontes: cadastro (criado_em), verificações, 1ª versão publicada e as
    -- colunas de data do equipamento (texto legado). Etapa sem coluna própria (manutenção, peça) só
    -- aparece como a etapa atual, com a data da última mudança de status. Nada da auditoria interna.
    v_recebido := COALESCE(v_e.criado_em AT TIME ZONE 'UTC', public.autoos_portal_ts(v_e.data_entrada));
    SELECT min(ve.data_inicio) AT TIME ZONE 'UTC', max(ve.data_fim) AT TIME ZONE 'UTC'
    INTO v_ini_verif, v_fim_verif
    FROM public.verificacoes ve WHERE ve.equipamento_id = v_e.id AND ve.empresa_id = v_e.empresa_id;
    SELECT min(ov.criado_em) INTO v_publicado
    FROM public.orcamento_versoes ov WHERE ov.equipamento_id = v_e.id AND ov.empresa_id = v_e.empresa_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('status', x.status, 'em', x.em) ORDER BY x.em, x.ord), '[]'::JSONB)
    INTO v_etapas
    FROM (
        SELECT t.status, t.ord,
               COALESCE(t.em, CASE WHEN v_e.status = t.status THEN v_e.status_alterado_em END) AS em
        FROM (VALUES
            ('RECEBIDO', 1, v_recebido),
            ('EM_VERIFICACAO', 2, v_ini_verif),
            ('VERIFICADO', 3, COALESCE(public.autoos_portal_ts(v_e.data_verificacao), v_fim_verif)),
            ('AGUARDANDO_APROVACAO', 4, v_publicado),
            ('APROVADO', 5, public.autoos_portal_ts(v_e.data_aprovacao)),
            ('REPROVADO', 5, public.autoos_portal_ts(v_e.data_reprovacao)),
            ('EM_MANUTENCAO', 6, NULL::TIMESTAMPTZ),
            ('AGUARDANDO_PECA', 7, NULL::TIMESTAMPTZ),
            ('PRONTO', 8, public.autoos_portal_ts(v_e.data_pronto)),
            ('ENTREGUE', 9, public.autoos_portal_ts(v_e.data_saida))
        ) AS t(status, ord, em)
    ) x
    -- Data anterior ao cadastro é dado legado errado: a etapa fica sem data (e some).
    WHERE x.em IS NOT NULL AND (x.status = 'RECEBIDO' OR v_recebido IS NULL OR x.em >= v_recebido);

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', f.id, 'categoria', f.categoria, 'caminho', f.storage_path, 'largura', f.largura, 'altura', f.altura
    ) ORDER BY CASE f.categoria WHEN 'ENTRADA' THEN 1 WHEN 'VERIFICACAO' THEN 2 ELSE 3 END, f.ordem, f.id), '[]'::JSONB)
    INTO v_fotos
    FROM (SELECT i.* FROM public.equipamento_imagens i
          WHERE i.equipamento_id = v_e.id AND i.empresa_id = v_e.empresa_id
            AND NULLIF(btrim(i.storage_path), '') IS NOT NULL AND i.storage_path !~* '^data:'
          ORDER BY CASE i.categoria WHEN 'ENTRADA' THEN 1 WHEN 'VERIFICACAO' THEN 2 ELSE 3 END, i.ordem, i.id
          LIMIT 60) f;

    -- Tudo que o cliente fez neste orçamento, em todas as versões, do mais recente ao mais antigo.
    SELECT COALESCE(jsonb_agg(h.item ORDER BY h.em DESC, h.ord DESC, h.rid DESC), '[]'::JSONB)
    INTO v_historico
    FROM (
        SELECT u.* FROM (
            SELECT jsonb_build_object(
                       'tipo', 'RESPOSTA',
                       'subtipo', r.decisao,
                       'versao', ov.versao,
                       'valor', ov.valor_total,
                       'em', r.registrada_em,
                       'contato', CASE WHEN r.origem = 'PORTAL_CLIENTE' THEN r.contato_nome END,
                       'protocolo', 'R-' || r.id,
                       'mensagem', NULL,
                       'situacao', CASE
                           WHEN r.decisao = 'DESFEITA' THEN 'DESFEITA'
                           WHEN EXISTS (SELECT 1 FROM public.orcamento_respostas r2 WHERE r2.versao_id = r.versao_id AND r2.id > r.id)
                               THEN 'SUBSTITUIDA'
                           -- Versão antiga que a equipe já trocou por outra sem efetivar a resposta.
                           WHEN r.aplicada_em IS NULL AND EXISTS (SELECT 1 FROM public.orcamento_versoes ov2
                                WHERE ov2.equipamento_id = ov.equipamento_id AND ov2.empresa_id = ov.empresa_id AND ov2.versao > ov.versao)
                               THEN 'SUBSTITUIDA'
                           ELSE public.autoos_portal_estado_resposta(r.origem, r.decisao, r.registrada_em, r.aplicada_em,
                                r.efetivacao_falhou_em, ov.encerrada_em IS NOT NULL AND r.aplicada_em IS NULL)
                       END,
                       'ordemCompra', r.ordem_compra
                   ) AS item,
                   r.registrada_em AS em, 1 AS ord, r.id AS rid
            FROM public.orcamento_respostas r
            JOIN public.orcamento_versoes ov ON ov.id = r.versao_id AND ov.empresa_id = r.empresa_id
            WHERE r.equipamento_id = v_e.id AND r.empresa_id = v_e.empresa_id
            UNION ALL
            SELECT jsonb_build_object(
                       'tipo', 'SOLICITACAO',
                       'subtipo', so.tipo,
                       'versao', ov.versao,
                       'valor', ov.valor_total,
                       'em', so.criado_em,
                       'contato', so.contato_nome,
                       'protocolo', 'S-' || so.id,
                       'mensagem', left(so.mensagem, 500),
                       'situacao', CASE WHEN so.tratado_em IS NOT NULL THEN 'TRATADA' ELSE 'AGUARDANDO' END,
                       'ordemCompra', NULL
                   ),
                   so.criado_em, 2, so.id
            FROM public.orcamento_solicitacoes so
            JOIN public.orcamento_versoes ov ON ov.id = so.versao_id AND ov.empresa_id = so.empresa_id
            WHERE so.equipamento_id = v_e.id AND so.empresa_id = v_e.empresa_id
        ) u
        ORDER BY u.em DESC, u.ord DESC, u.rid DESC
        LIMIT 100
    ) h;

    RETURN jsonb_build_object(
        'id', v_e.id,
        'equipamento', COALESCE(NULLIF(public.autoos_portal_rotulo_equipamento(v_e.tipo, v_e.marca, v_e.modelo), ''), 'Equipamento'),
        'serie', left(v_e.serial_number, 60),
        'patrimonio', left(NULLIF(btrim(v_e.patrimonio), ''), 60),
        'status', v_e.status,
        'statusAlteradoEm', v_e.status_alterado_em,
        'entradaEm', v_e.criado_em,
        'cliente', v_cliente,
        'defeitoRelatado', left(NULLIF(btrim(v_e.defeito_relatado), ''), 1000),
        'valores', jsonb_build_object(
            'orcamento', v_e.valor_orcamento,
            'final', v_e.valor_final,
            'atual', COALESCE(v_e.valor_final, v_e.valor_orcamento)),
        'etapas', v_etapas,
        'fotos', v_fotos,
        'historico', v_historico,
        'orcamento', v_orcamento,
        'solicitacoes', v_solicitacoes,
        'contatoEmpresa', v_contato,
        'podeDecidir', v_s.s_acesso = 'DECIDIR',
        'verificacaoRecente', v_s.s_verificada_em > statement_timestamp() - make_interval(mins => v_config.reverificacao_minutos),
        'contato', v_s.s_contato_nome,
        'temTelefone', COALESCE(v_tem_telefone, FALSE),
        'temEmail', COALESCE(v_tem_email, FALSE)
    );
END;
$$;

-- ─── Resposta com ordem de compra ────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.portal_registrar_resposta(TEXT, INTEGER, BIGINT, TEXT, BIGINT);
CREATE OR REPLACE FUNCTION public.portal_registrar_resposta(
    p_sessao_hash TEXT,
    p_equipamento_id INTEGER,
    p_versao_id BIGINT,
    p_decisao TEXT,
    p_resposta_vigente_id BIGINT,
    p_ordem_compra TEXT DEFAULT NULL
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
    v_oc TEXT := NULLIF(btrim(regexp_replace(COALESCE(p_ordem_compra, ''), '[[:cntrl:]]', ' ', 'g')), '');
    v_exige_oc BOOLEAN;
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
        -- Ordem de compra: só faz sentido ao aprovar; obrigatória quando o cliente exige.
        IF p_decisao = 'APROVAR' THEN
            SELECT COALESCE(cl.exige_ordem_compra, FALSE) INTO v_exige_oc
            FROM public.clientes cl WHERE cl.id = v_e.cliente_id AND cl.empresa_id = v_e.empresa_id;
            IF COALESCE(v_exige_oc, FALSE) AND (v_oc IS NULL OR char_length(v_oc) > 60) THEN
                RAISE EXCEPTION 'ORDEM_COMPRA_OBRIGATORIA';
            END IF;
            v_oc := left(v_oc, 60);
        ELSE
            v_oc := NULL;
        END IF;
        SELECT count(*) INTO v_trocas FROM public.orcamento_respostas
        WHERE versao_id = v_v.id AND origem = 'PORTAL_CLIENTE';
        IF v_trocas >= 10 THEN
            RAISE EXCEPTION 'LIMITE_RESPOSTAS';
        END IF;

        INSERT INTO public.orcamento_respostas
            (empresa_id, equipamento_id, versao_id, origem, decisao, registrada_em, contato_id, contato_nome, sessao_id, ordem_compra)
        VALUES
            (v_v.empresa_id, v_v.equipamento_id, v_v.id, 'PORTAL_CLIENTE', p_decisao, v_agora,
             v_s.s_contato_id, v_s.s_contato_nome, v_s.s_id, v_oc)
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
                || CASE WHEN p_decisao = 'DESFEITA' THEN chr(10) || 'O orçamento voltou a aguardar resposta.' ELSE '' END
                || CASE WHEN v_oc IS NOT NULL THEN chr(10) || 'Ordem de compra: ' || v_oc ELSE '' END,
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
        'ordemCompra', v_atual.ordem_compra,
        'repetida', v_atual.registrada_em < v_agora
    );
END;
$$;

-- ─── Solicitação com telefone/email de retorno ───────────────────────────────
DROP FUNCTION IF EXISTS public.portal_registrar_solicitacao(TEXT, INTEGER, BIGINT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.portal_registrar_solicitacao(
    p_sessao_hash TEXT,
    p_equipamento_id INTEGER,
    p_versao_id BIGINT,
    p_tipo TEXT,
    p_mensagem TEXT,
    p_telefone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_salvar_no_contato BOOLEAN DEFAULT FALSE
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
    v_tel TEXT;
    v_tel_fmt TEXT;
    v_email TEXT;
    v_retorno TEXT;
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

    -- Contato de retorno (opcional): telefone com 10 a 13 dígitos, e-mail em formato simples.
    IF btrim(COALESCE(p_telefone, '')) <> '' THEN
        v_tel := public.autoos_portal_digitos(p_telefone);
        IF length(v_tel) NOT BETWEEN 10 AND 13 THEN
            RAISE EXCEPTION 'CONTATO_INVALIDO';
        END IF;
    END IF;
    IF btrim(COALESCE(p_email, '')) <> '' THEN
        v_email := lower(btrim(p_email));
        IF char_length(v_email) > 200
           OR v_email !~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+\.[^@[:space:][:cntrl:]]+$' THEN
            RAISE EXCEPTION 'CONTATO_INVALIDO';
        END IF;
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
        (empresa_id, equipamento_id, versao_id, tipo, mensagem, criado_em, contato_id, contato_nome, contato_telefone, contato_email)
    VALUES
        (v_v.empresa_id, v_v.equipamento_id, v_v.id, p_tipo, v_mensagem, v_agora, v_s.s_contato_id, v_s.s_contato_nome, v_tel, v_email)
    RETURNING id INTO v_id;

    -- Guardar no cadastro do contato que está logado: só preenche o que estiver vazio, nunca sobrescreve.
    IF COALESCE(p_salvar_no_contato, FALSE) AND (v_tel IS NOT NULL OR v_email IS NOT NULL) THEN
        v_tel_fmt := CASE
            WHEN length(v_tel) = 11 THEN format('(%s) %s-%s', left(v_tel, 2), substr(v_tel, 3, 5), substr(v_tel, 8))
            WHEN length(v_tel) = 10 THEN format('(%s) %s-%s', left(v_tel, 2), substr(v_tel, 3, 4), substr(v_tel, 7))
            ELSE v_tel END;
        UPDATE public.cliente_contatos c
        SET telefone = CASE WHEN NULLIF(btrim(COALESCE(c.telefone, '')), '') IS NULL AND v_tel_fmt IS NOT NULL THEN v_tel_fmt ELSE c.telefone END,
            email = CASE WHEN NULLIF(btrim(COALESCE(c.email, '')), '') IS NULL AND v_email IS NOT NULL THEN v_email ELSE c.email END,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE c.id = v_s.s_contato_id AND c.empresa_id = v_s.s_empresa_id AND c.cliente_id = v_s.s_cliente_id
          AND ((NULLIF(btrim(COALESCE(c.telefone, '')), '') IS NULL AND v_tel_fmt IS NOT NULL)
               OR (NULLIF(btrim(COALESCE(c.email, '')), '') IS NULL AND v_email IS NOT NULL));
    END IF;

    UPDATE public.equipamentos SET ultima_atividade_cliente_em = CURRENT_TIMESTAMP
    WHERE id = v_e.id AND empresa_id = v_e.empresa_id;

    -- O operador vê, no alerta, por onde o cliente quer ser contatado.
    v_retorno := NULLIF(concat_ws(' · ',
        CASE WHEN v_tel IS NOT NULL THEN 'Telefone: ' || v_tel END,
        CASE WHEN v_email IS NOT NULL THEN 'E-mail: ' || v_email END), '');

    PERFORM public.autoos_portal_alerta(
        v_v.empresa_id, v_v.equipamento_id,
        CASE p_tipo WHEN 'NEGOCIAR' THEN 'NEGOCIACAO_SOLICITADA' WHEN 'MUDANCA' THEN 'CORRECAO_SOLICITADA' ELSE 'DUVIDA_RECEBIDA' END,
        CASE p_tipo WHEN 'NEGOCIAR' THEN 'Cliente quer negociar'
                    WHEN 'MUDANCA' THEN 'Cliente pediu correção'
                    ELSE 'Nova dúvida do cliente' END,
        public.autoos_portal_linha_alerta(v_e.id, v_e.empresa_id, v_v.valor_total, v_s.s_contato_nome)
            || CASE WHEN v_retorno IS NOT NULL THEN chr(10) || v_retorno ELSE '' END
            || chr(10) || '“' || left(v_mensagem, 140) || CASE WHEN char_length(v_mensagem) > 140 THEN '…' ELSE '' END || '”',
        NULL, v_id, v_s.s_contato_id);

    RETURN jsonb_build_object('id', v_id, 'protocolo', 'S-' || v_id, 'tipo', p_tipo, 'criadoEm', v_agora);
END;
$$;

-- ─── Privilégios ─────────────────────────────────────────────────────────────
-- As funções recriadas (nova assinatura) voltam ao padrão: só service_role executa, como na 0035.
DO $$
DECLARE
    v_role TEXT;
    v_funcao TEXT;
    v_publicas TEXT[] := ARRAY[
        'public.portal_registrar_resposta(TEXT, INTEGER, BIGINT, TEXT, BIGINT, TEXT)',
        'public.portal_registrar_solicitacao(TEXT, INTEGER, BIGINT, TEXT, TEXT, TEXT, TEXT, BOOLEAN)'
    ];
    v_internas TEXT[] := ARRAY['public.autoos_portal_ts(TEXT)'];
BEGIN
    FOREACH v_funcao IN ARRAY v_publicas || v_internas LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_funcao);
    END LOOP;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
            FOREACH v_funcao IN ARRAY v_publicas || v_internas LOOP
                EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_funcao, v_role);
            END LOOP;
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        FOREACH v_funcao IN ARRAY v_publicas LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_funcao);
        END LOOP;
    END IF;
END;
$$;
