-- 0045: portal do cliente — rótulo de preparação e PDF da OS parcialmente aprovada.
--
-- 1. portal_listar_atendimentos passa a devolver `orcamentoPublicado` (há versão aberta). Com as
--    respostas online desligadas `aguardaResposta` é falso mesmo com orçamento publicado, e o portal
--    mostrava "Orçamento em preparação" por engano.
-- 2. portal_detalhe_atendimento marca cada serviço do orçamento com `aprovado` (decisão por serviço
--    da verificação atual), para a ordem de serviço em PDF listar só o que foi aceito.
-- Só funções (CREATE OR REPLACE, mesmas assinaturas e privilégios da 0039). Idempotente.

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
            -- Orçamento publicado e aberto, independente de o aceite online estar ligado: o rótulo
            -- "em preparação" só vale quando não há versão aberta.
            'orcamentoPublicado', v.id IS NOT NULL AND v.encerrada_em IS NULL,
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
    v_ver_id INTEGER;
    v_tem_decisao BOOLEAN := FALSE;
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

        -- Decisão por serviço da verificação atual (a mais recente do equipamento).
        SELECT ve.id INTO v_ver_id FROM public.verificacoes ve
        WHERE ve.equipamento_id = v_e.id AND ve.empresa_id = v_e.empresa_id
        ORDER BY ve.id DESC LIMIT 1;
        IF v_ver_id IS NOT NULL THEN
            SELECT EXISTS (SELECT 1 FROM public.orcamento_servicos_decisao d
                           WHERE d.verificacao_id = v_ver_id AND d.empresa_id = v_e.empresa_id)
            INTO v_tem_decisao;
        END IF;

        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'descricao', left(COALESCE(NULLIF(s->>'descricao', ''), NULLIF(s->>'nome', ''), 'Serviço'), 200),
            'valor', COALESCE((s->>'valor')::NUMERIC, 0),
            -- NULL = sem decisão registrada (ainda aberto ou legado); false = serviço recusado.
            'aprovado', CASE WHEN NOT v_tem_decisao THEN NULL ELSE EXISTS (
                SELECT 1 FROM public.orcamento_servicos_decisao d
                WHERE d.verificacao_id = v_ver_id AND d.empresa_id = v_e.empresa_id
                  AND d.servico_id = s->>'id' AND d.decisao = 'APROVADO') END,
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

