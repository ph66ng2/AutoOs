-- Contrato SQL do Portal das Impressoras do Cliente (migrations 0035, 0036, 0038 e 0039).
-- Execute num banco descartável com as migrations SQLx aplicadas (nome iniciando por autoos_stock_test):
--   psql --set ON_ERROR_STOP=1 --file=supabase/tests/portal_cliente_contract.sql
-- Tudo roda numa transação desfeita no final; dados sintéticos TESTE-PORTAL.

BEGIN;

CREATE TEMP TABLE t (k TEXT PRIMARY KEY, v TEXT);

-- Espera que `p_sql` falhe com a mensagem `p_esperado`.
CREATE FUNCTION pg_temp.espera_erro(p_sql TEXT, p_esperado TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> p_esperado THEN
            RAISE EXCEPTION 'Esperava % e veio %', p_esperado, SQLERRM;
        END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'Esperava % mas a chamada passou: %', p_esperado, p_sql;
END;
$$;
CREATE FUNCTION pg_temp.g(p_k TEXT) RETURNS TEXT LANGUAGE sql AS $$ SELECT v FROM t WHERE k = p_k $$;
CREATE FUNCTION pg_temp.ok(p_cond BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_cond IS NOT TRUE THEN RAISE EXCEPTION 'Falhou: %', p_msg; END IF;
END;
$$;
-- Simula a passagem do prazo de correção sem relaxar a imutabilidade em produção.
CREATE FUNCTION pg_temp.envelhecer_resposta(p_id BIGINT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    ALTER TABLE orcamento_respostas DISABLE TRIGGER trg_orcamento_respostas_imutavel;
    UPDATE orcamento_respostas SET registrada_em = registrada_em - INTERVAL '16 minutes' WHERE id = p_id;
    ALTER TABLE orcamento_respostas ENABLE TRIGGER trg_orcamento_respostas_imutavel;
END;
$$;

-- ─── Cenário ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    ea INTEGER; eb INTEGER; ca INTEGER; cb INTEGER;
    decisor INTEGER; decisor2 INTEGER; acompanha INTEGER; sem_acesso INTEGER;
    e1 INTEGER; e2 INTEGER; e3 INTEGER; e4 INTEGER; e5 INTEGER; e6 INTEGER;
    prod INTEGER; v_ver INTEGER;
    servicos TEXT;
BEGIN
    INSERT INTO empresas (nome, email, status) VALUES ('TESTE-PORTAL A', 'portal-a@teste.invalid', 'ativo') RETURNING id INTO ea;
    INSERT INTO empresas (nome, email, status) VALUES ('TESTE-PORTAL B', 'portal-b@teste.invalid', 'ativo') RETURNING id INTO eb;
    -- Chaves por empresa (0038): as duas ligadas; a separação entre empresas é testada no fim.
    INSERT INTO portal_config_empresa (empresa_id, portal_enabled, respostas_enabled)
        VALUES (ea, TRUE, TRUE), (eb, TRUE, TRUE)
        ON CONFLICT (empresa_id) DO UPDATE SET portal_enabled = TRUE, respostas_enabled = TRUE;
    INSERT INTO clientes (empresa_id, nome, tipo_pessoa, documento) VALUES (ea, 'TESTE-PORTAL Cliente A', 'PJ', '11222333000181') RETURNING id INTO ca;
    INSERT INTO clientes (empresa_id, nome, tipo_pessoa, documento) VALUES (eb, 'TESTE-PORTAL Cliente B', 'PJ', '99888777000166') RETURNING id INTO cb;

    INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, telefone, email, portal_acesso)
        VALUES (ea, ca, 'Ana Decisora', '(71) 98888-7777', 'ana@cliente.invalid', 'DECIDIR') RETURNING id INTO decisor;
    INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, telefone, portal_acesso)
        VALUES (ea, ca, 'Bruno Decisor', '71977776666', 'DECIDIR') RETURNING id INTO decisor2;
    INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, email, portal_acesso)
        VALUES (ea, ca, 'Carla Acompanha', 'carla@cliente.invalid', 'ACOMPANHAR') RETURNING id INTO acompanha;
    INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, telefone)
        VALUES (ea, ca, 'Davi Sem Acesso', '71966665555') RETURNING id INTO sem_acesso;

    INSERT INTO produtos (codigo, nome, categoria, quantidade_estoque, preco_custo, preco_venda, empresa_id)
        VALUES ('TP-FUSOR', 'Fusor teste', 'PEÇA', 1, 10, 20, ea) RETURNING id INTO prod;
    servicos := format('[{"id":"s1","descricao":"Troca do fusor","valor":100,"pecas":[{"produto_id":%s,"nome":"Fusor","quantidade":2,"valor_unitario":50}]}]', prod);

    -- E1: aguardando aprovação, com peças (estoque 1, precisa de 2).
    INSERT INTO equipamentos (serial_number, marca, modelo, tipo, data_entrada, defeito_relatado, empresa_id, cliente_id, status, valor_orcamento, prazo_aprovacao)
        VALUES ('SER-123', 'Zebra', 'ZT230', 'Impressora', '2026-10-01', 'Falha', ea, ca, 'AGUARDANDO_APROVACAO', 200, '2099-12-31') RETURNING id INTO e1;
    INSERT INTO verificacoes (equipamento_id, tecnico_nome, problema_relatado, servicos_necessarios, pecas_necessarias, custo_total, empresa_id)
        VALUES (e1, 'Téc', 'Falha', servicos, '[]', 200, ea) RETURNING id INTO v_ver;
    INSERT INTO orcamento_versoes (empresa_id, equipamento_id, verificacao_id, versao, snapshot, valor_total, valido_ate)
        VALUES (ea, e1, v_ver, 1, jsonb_build_object('equipamento', jsonb_build_object('tipo','Impressora','marca','Zebra','modelo','ZT230'),
                'servicos', servicos::JSONB, 'pecas', '[]'::JSONB, 'valorTotal', 200), 200, '2100-01-01');
    INSERT INTO t VALUES ('v1_ver', v_ver::TEXT);

    -- E2: histórico (entregue).
    INSERT INTO equipamentos (serial_number, marca, modelo, tipo, data_entrada, defeito_relatado, empresa_id, cliente_id, status)
        VALUES ('SER-OLD', 'Epson', 'L3250', 'Impressora', '2026-01-01', 'Falha', ea, ca, 'ENTREGUE') RETURNING id INTO e2;
    -- E3: outra empresa, MESMO número de série e mesmo nome de cliente: nunca pode aparecer.
    INSERT INTO equipamentos (serial_number, marca, modelo, tipo, data_entrada, defeito_relatado, empresa_id, cliente_id, cliente_nome, status)
        VALUES ('SER-123', 'Zebra', 'ZT230', 'Impressora', '2026-10-01', 'Falha', eb, cb, 'TESTE-PORTAL Cliente A', 'RECEBIDO') RETURNING id INTO e3;
    -- E4: mesma empresa, só o nome do cliente digitado (sem vínculo): também não aparece.
    INSERT INTO equipamentos (serial_number, marca, modelo, tipo, data_entrada, defeito_relatado, empresa_id, cliente_nome, status)
        VALUES ('SER-NOME', 'HP', 'M404', 'Impressora', '2026-10-01', 'Falha', ea, 'TESTE-PORTAL Cliente A', 'RECEBIDO') RETURNING id INTO e4;
    -- E5: será alterado pela equipe depois da resposta (falha de efetivação).
    INSERT INTO equipamentos (serial_number, marca, modelo, tipo, data_entrada, defeito_relatado, empresa_id, cliente_id, status, valor_orcamento)
        VALUES ('SER-555', 'Argox', 'OS-214', 'Impressora', '2026-10-02', 'Falha', ea, ca, 'AGUARDANDO_APROVACAO', 80) RETURNING id INTO e5;
    INSERT INTO verificacoes (equipamento_id, tecnico_nome, problema_relatado, servicos_necessarios, pecas_necessarias, custo_total, empresa_id)
        VALUES (e5, 'Téc', 'Falha', '[{"id":"x","descricao":"Limpeza","valor":80}]', '[]', 80, ea) RETURNING id INTO v_ver;
    INSERT INTO orcamento_versoes (empresa_id, equipamento_id, verificacao_id, versao, snapshot, valor_total)
        VALUES (ea, e5, v_ver, 1, '{"servicos":[{"id":"x","descricao":"Limpeza","valor":80}],"pecas":[]}', 80);
    -- E6: será recusado.
    INSERT INTO equipamentos (serial_number, marca, modelo, tipo, data_entrada, defeito_relatado, empresa_id, cliente_id, status, valor_orcamento)
        VALUES ('SER-666', 'Elgin', 'L42', 'Impressora', '2026-10-03', 'Falha', ea, ca, 'AGUARDANDO_APROVACAO', 300) RETURNING id INTO e6;
    INSERT INTO verificacoes (equipamento_id, tecnico_nome, problema_relatado, servicos_necessarios, pecas_necessarias, custo_total, empresa_id)
        VALUES (e6, 'Téc', 'Falha', servicos, '[]', 300, ea) RETURNING id INTO v_ver;
    INSERT INTO orcamento_versoes (empresa_id, equipamento_id, verificacao_id, versao, snapshot, valor_total)
        VALUES (ea, e6, v_ver, 1, jsonb_build_object('servicos', servicos::JSONB, 'pecas', '[]'::JSONB), 300);

    INSERT INTO t VALUES ('ea', ea), ('eb', eb), ('ca', ca), ('decisor', decisor), ('decisor2', decisor2),
        ('acompanha', acompanha), ('sem_acesso', sem_acesso), ('prod', prod),
        ('e1', e1), ('e2', e2), ('e3', e3), ('e4', e4), ('e5', e5), ('e6', e6);
    INSERT INTO t SELECT 'v_e1', id::TEXT FROM orcamento_versoes WHERE equipamento_id = e1;
    INSERT INTO t SELECT 'v_e5', id::TEXT FROM orcamento_versoes WHERE equipamento_id = e5;
    INSERT INTO t SELECT 'v_e6', id::TEXT FROM orcamento_versoes WHERE equipamento_id = e6;
END $$;

-- ─── Login com senha: sessões de trabalho ───────────────────────────────────
-- 1 = Ana (decide), 2 = Bruno (decide), 3 = Carla (só acompanha). O login por código não existe mais.
SELECT portal_definir_senha_contato(pg_temp.g('ea')::INTEGER, pg_temp.g('decisor')::INTEGER, 'Ana-Inicial-1', NULL);
SELECT portal_definir_senha_contato(pg_temp.g('ea')::INTEGER, pg_temp.g('decisor2')::INTEGER, 'Bruno-Inicial-2', NULL);
SELECT portal_definir_senha_contato(pg_temp.g('ea')::INTEGER, pg_temp.g('acompanha')::INTEGER, 'Carla-Inicial-3', NULL);
SELECT pg_temp.ok((portal_entrar_senha('11.222.333/0001-81', 'Ana-Inicial-1', repeat('1', 64))->>'resultado') = 'OK', 'Ana entra');
SELECT pg_temp.ok((portal_entrar_senha('11222333000181', 'Bruno-Inicial-2', repeat('2', 64))->>'resultado') = 'OK', 'segundo decisor entra');
SELECT pg_temp.ok((portal_entrar_senha('11222333000181', 'Carla-Inicial-3', repeat('3', 64))->>'acesso') = 'ACOMPANHAR', 'acompanhante entra');
SELECT pg_temp.ok((portal_entrar_senha('11222333000181', 'Davi-Inicial-4', repeat('4', 64))->>'resultado') = 'INVALIDO',
    'contato sem acesso ao portal não entra');

-- Sem login por código (0038): funções removidas, sessão por código antiga não vale.
SELECT pg_temp.ok(to_regprocedure('public.portal_criar_desafio(text,text,uuid,text)') IS NULL
    AND to_regprocedure('public.portal_verificar_codigo(uuid,text,text,text)') IS NULL
    AND to_regprocedure('public.portal_criar_desafio_sessao(text,text,uuid,text)') IS NULL
    AND to_regprocedure('public.portal_metodo_sessao(text)') IS NULL, 'funções do código removidas');
INSERT INTO portal_sessoes (token_hash, empresa_id, cliente_id, contato_id, expira_em, verificada_em, metodo)
VALUES (repeat('c', 64), pg_temp.g('ea')::INTEGER, pg_temp.g('ca')::INTEGER, pg_temp.g('decisor')::INTEGER,
        now() + INTERVAL '1 hour', now(), 'CODIGO');
SELECT pg_temp.espera_erro(format('SELECT portal_listar_atendimentos(%L)', repeat('c', 64)), 'SESSAO_INVALIDA');

-- ─── Isolamento da lista ────────────────────────────────────────────────────
DO $$
DECLARE
    lista JSONB := portal_listar_atendimentos(repeat('1', 64));
    ids INTEGER[];
BEGIN
    SELECT array_agg((x->>'id')::INTEGER) INTO ids FROM jsonb_array_elements(lista->'atendimentos') x;
    PERFORM pg_temp.ok(pg_temp.g('e1')::INTEGER = ANY (ids) AND pg_temp.g('e2')::INTEGER = ANY (ids), 'lista traz os atendimentos do cliente');
    PERFORM pg_temp.ok(NOT (pg_temp.g('e3')::INTEGER = ANY (ids)), 'mesmo número de série em outra empresa não aparece');
    PERFORM pg_temp.ok(NOT (pg_temp.g('e4')::INTEGER = ANY (ids)), 'mesmo nome de cliente sem vínculo não aparece');
    PERFORM pg_temp.ok((SELECT (x->>'historico')::BOOLEAN FROM jsonb_array_elements(lista->'atendimentos') x
                        WHERE (x->>'id')::INTEGER = pg_temp.g('e2')::INTEGER), 'entregue vai para o histórico');
    PERFORM pg_temp.ok((SELECT (x->>'aguardaResposta')::BOOLEAN FROM jsonb_array_elements(lista->'atendimentos') x
                        WHERE (x->>'id')::INTEGER = pg_temp.g('e1')::INTEGER), 'orçamento publicado aguarda resposta');
END $$;
SELECT pg_temp.espera_erro(format('SELECT portal_detalhe_atendimento(%L, %s)', repeat('1', 64), pg_temp.g('e3')), 'ATENDIMENTO_INDISPONIVEL');
SELECT pg_temp.espera_erro(format('SELECT portal_detalhe_atendimento(%L, %s)', repeat('1', 64), pg_temp.g('e4')), 'ATENDIMENTO_INDISPONIVEL');
SELECT pg_temp.ok((portal_detalhe_atendimento(repeat('1', 64), pg_temp.g('e1')::INTEGER)->'orcamento'->>'estado') = 'ABERTA',
    'detalhe mostra a proposta aberta');

-- ─── Permissões de decisão ──────────────────────────────────────────────────
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_resposta(%L, %s, %s, ''APROVAR'', 0)', repeat('3', 64), pg_temp.g('e1'), pg_temp.g('v_e1')),
    'SEM_PERMISSAO_DECISAO');
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_solicitacao(%L, %s, %s, ''NEGOCIAR'', '''')', repeat('3', 64), pg_temp.g('e1'), pg_temp.g('v_e1')),
    'SEM_PERMISSAO_DECISAO');
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_resposta(%L, %s, %s, ''APROVAR'', 0)', repeat('1', 64), pg_temp.g('e3'), pg_temp.g('v_e1')),
    'ATENDIMENTO_INDISPONIVEL');

-- Verificação recente exigida para decidir.
UPDATE portal_sessoes SET verificada_em = verificada_em - INTERVAL '1 hour' WHERE token_hash = repeat('1', 64);
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_resposta(%L, %s, %s, ''APROVAR'', 0)', repeat('1', 64), pg_temp.g('e1'), pg_temp.g('v_e1')),
    'VERIFICACAO_NECESSARIA');
SELECT pg_temp.ok(NOT portal_reverificar_senha(repeat('1', 64), 'Bruno-Inicial-2'), 'reverificação não aceita senha de outro contato');
SELECT pg_temp.ok(portal_reverificar_senha(repeat('1', 64), 'Ana-Inicial-1'), 'reverificação com a senha renova a própria sessão');

-- ─── Resposta, cliques repetidos, duas abas, dois contatos ──────────────────
INSERT INTO t SELECT 'r1', (portal_registrar_resposta(repeat('1', 64), pg_temp.g('e1')::INTEGER, pg_temp.g('v_e1')::BIGINT, 'APROVAR', 0))->>'id';
SELECT pg_temp.ok((portal_registrar_resposta(repeat('1', 64), pg_temp.g('e1')::INTEGER, pg_temp.g('v_e1')::BIGINT, 'APROVAR', 0))->>'id' = pg_temp.g('r1'),
    'clique repetido devolve o mesmo comprovante');
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_resposta(%L, %s, %s, ''RECUSAR'', 0)', repeat('1', 64), pg_temp.g('e1'), pg_temp.g('v_e1')),
    'RESPOSTA_DESATUALIZADA');
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_resposta(%L, %s, %s, ''RECUSAR'', %s)', repeat('2', 64), pg_temp.g('e1'), pg_temp.g('v_e1'), pg_temp.g('r1')),
    'RESPOSTA_DE_OUTRO_CONTATO');
SELECT pg_temp.ok((SELECT count(*) FROM orcamento_respostas WHERE equipamento_id = pg_temp.g('e1')::INTEGER) = 1, 'nenhuma decisão duplicada');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM portal_alertas WHERE tipo = 'RESPOSTA_RECEBIDA' AND resposta_id = pg_temp.g('r1')::BIGINT AND lido_em IS NULL),
    'alerta persistente da resposta');
SELECT pg_temp.ok((SELECT ultima_atividade_cliente_em IS NOT NULL FROM equipamentos WHERE id = pg_temp.g('e1')::INTEGER), 'atividade recente marcada');
SELECT pg_temp.ok((portal_detalhe_atendimento(repeat('1', 64), pg_temp.g('e1')::INTEGER)->'orcamento'->'resposta'->>'estado') = 'EM_CORRECAO',
    'cliente vê prazo de correção');
SELECT pg_temp.ok((portal_detalhe_atendimento(repeat('2', 64), pg_temp.g('e1')::INTEGER)->'orcamento'->'resposta'->>'propria') = 'false',
    'outro contato vê a resposta como de outra pessoa');

-- Mudei de ideia: trocar e cancelar.
INSERT INTO t SELECT 'r2', (portal_registrar_resposta(repeat('1', 64), pg_temp.g('e1')::INTEGER, pg_temp.g('v_e1')::BIGINT, 'RECUSAR', pg_temp.g('r1')::BIGINT))->>'id';
INSERT INTO t SELECT 'r3', (portal_registrar_resposta(repeat('1', 64), pg_temp.g('e1')::INTEGER, pg_temp.g('v_e1')::BIGINT, 'DESFEITA', pg_temp.g('r2')::BIGINT))->>'id';
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM portal_alertas WHERE tipo = 'RESPOSTA_ALTERADA' AND resposta_id = pg_temp.g('r2')::BIGINT)
    AND EXISTS (SELECT 1 FROM portal_alertas WHERE tipo = 'RESPOSTA_CANCELADA' AND resposta_id = pg_temp.g('r3')::BIGINT), 'alertas de troca e cancelamento');
-- Depois do cancelamento, outro decisor pode responder.
INSERT INTO t SELECT 'r4', (portal_registrar_resposta(repeat('2', 64), pg_temp.g('e1')::INTEGER, pg_temp.g('v_e1')::BIGINT, 'APROVAR', pg_temp.g('r3')::BIGINT))->>'id';

-- Negociar não é decisão.
SELECT pg_temp.ok((portal_registrar_solicitacao(repeat('1', 64), pg_temp.g('e5')::INTEGER, pg_temp.g('v_e5')::BIGINT, 'NEGOCIAR', ''))->>'tipo' = 'NEGOCIAR',
    'negociação registrada');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM orcamento_respostas WHERE equipamento_id = pg_temp.g('e5')::INTEGER), 'negociar não cria resposta');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM portal_alertas WHERE tipo = 'NEGOCIACAO_SOLICITADA' AND equipamento_id = pg_temp.g('e5')::INTEGER), 'alerta de negociação');

-- ─── Efetivação ─────────────────────────────────────────────────────────────
SELECT pg_temp.ok((portal_efetivar_respostas_vencidas()->>'efetivadas') = '0', 'nada é efetivado dentro do prazo');
SELECT pg_temp.ok((SELECT status FROM equipamentos WHERE id = pg_temp.g('e1')::INTEGER) = 'AGUARDANDO_APROVACAO', 'status inalterado no prazo');
SELECT pg_temp.envelhecer_resposta(pg_temp.g('r4')::BIGINT);
SELECT pg_temp.ok((SELECT autoos_portal_estado_resposta(origem, decisao, registrada_em, aplicada_em, efetivacao_falhou_em, FALSE)
                    FROM orcamento_respostas WHERE id = pg_temp.g('r4')::BIGINT) = 'PROCESSANDO',
    'após o prazo e antes da efetivação: processando (nunca aprovado falso)');
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_resposta(%L, %s, %s, ''DESFEITA'', %s)', repeat('2', 64), pg_temp.g('e1'), pg_temp.g('v_e1'), pg_temp.g('r4')),
    'PRAZO_CORRECAO_ENCERRADO');

-- E5: resposta e, antes de efetivar, a equipe muda a etapa.
INSERT INTO t SELECT 'r5', (portal_registrar_resposta(repeat('1', 64), pg_temp.g('e5')::INTEGER, pg_temp.g('v_e5')::BIGINT, 'APROVAR', 0))->>'id';
SELECT pg_temp.envelhecer_resposta(pg_temp.g('r5')::BIGINT);
UPDATE equipamentos SET status = 'ORCAMENTO_VENCIDO' WHERE id = pg_temp.g('e5')::INTEGER;
-- E6: recusa.
INSERT INTO t SELECT 'r6', (portal_registrar_resposta(repeat('1', 64), pg_temp.g('e6')::INTEGER, pg_temp.g('v_e6')::BIGINT, 'RECUSAR', 0))->>'id';
SELECT pg_temp.envelhecer_resposta(pg_temp.g('r6')::BIGINT);

SELECT pg_temp.ok((portal_efetivar_respostas_vencidas() = '{"efetivadas": 2, "falhas": 1}'::JSONB), 'duas efetivadas e uma falha');

DO $$
DECLARE
    e1 INTEGER := pg_temp.g('e1')::INTEGER;
    eq RECORD;
    ver RECORD;
BEGIN
    SELECT * INTO eq FROM equipamentos WHERE id = e1;
    PERFORM pg_temp.ok(eq.status = 'APROVADO' AND eq.valor_orcamento = 200 AND eq.data_aprovacao IS NOT NULL, 'E1 aprovado com o valor da versão');
    SELECT * INTO ver FROM verificacoes WHERE equipamento_id = e1;
    PERFORM pg_temp.ok(ver.forma_pagamento_codigo = 'A_COMBINAR' AND ver.custo_total = 200 AND ver.servicos_orcamento_original IS NOT NULL,
        'pagamento a combinar e orçamento original preservado');
    PERFORM pg_temp.ok((SELECT quantidade_estoque FROM produtos WHERE id = pg_temp.g('prod')::INTEGER) = 0, 'estoque nunca negativo');
    PERFORM pg_temp.ok((SELECT quantidade_aprovada = 2 AND quantidade_baixada = 1 FROM orcamento_consumos WHERE verificacao_id = ver.id),
        'falta de saldo vira pendência');
    PERFORM pg_temp.ok((SELECT count(*) FROM movimentacoes_estoque WHERE produto_id = pg_temp.g('prod')::INTEGER AND tipo = 'SAIDA' AND quantidade = 1) = 1,
        'uma saída de estoque');
    PERFORM pg_temp.ok((SELECT decisao FROM orcamento_servicos_decisao WHERE verificacao_id = ver.id AND servico_id = 's1') = 'APROVADO',
        'serviço aprovado registrado');
    PERFORM pg_temp.ok((SELECT aplicada_em IS NOT NULL AND aplicada_pelo_sistema FROM orcamento_respostas WHERE id = pg_temp.g('r4')::BIGINT),
        'resposta marcada como aplicada pelo sistema');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM security_audit_log WHERE event_type = 'BUDGET_APPROVED' AND details LIKE '%origem=PORTAL_CLIENTE%'
        AND details LIKE format('%%resposta_id=%s;%%', pg_temp.g('r4')) AND profile_name = 'Portal do cliente: Bruno Decisor'), 'auditoria atribui ao contato');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM portal_alertas WHERE tipo = 'DECISAO_EFETIVADA' AND resposta_id = pg_temp.g('r4')::BIGINT), 'alerta de efetivação');

    PERFORM pg_temp.ok((SELECT status FROM equipamentos WHERE id = pg_temp.g('e5')::INTEGER) = 'ORCAMENTO_VENCIDO', 'E5 não foi aprovado');
    PERFORM pg_temp.ok((SELECT efetivacao_falhou_em IS NOT NULL AND aplicada_em IS NULL AND efetivacao_erro = 'ETAPA_ALTERADA'
                        FROM orcamento_respostas WHERE id = pg_temp.g('r5')::BIGINT), 'falha registrada e resposta pendente');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM portal_alertas WHERE tipo = 'EFETIVACAO_FALHOU' AND resposta_id = pg_temp.g('r5')::BIGINT), 'alerta de falha');

    PERFORM pg_temp.ok((SELECT status FROM equipamentos WHERE id = pg_temp.g('e6')::INTEGER) = 'REPROVADO', 'E6 reprovado');
    PERFORM pg_temp.ok((SELECT count(*) FROM movimentacoes_estoque WHERE referencia LIKE format('verificacao:%s;%%',
        (SELECT id FROM verificacoes WHERE equipamento_id = pg_temp.g('e6')::INTEGER))) = 0, 'recusa não baixa estoque');
END $$;

SELECT pg_temp.ok((portal_efetivar_respostas_vencidas() = '{"efetivadas": 0, "falhas": 0}'::JSONB), 'reprocessar não repete nada');
SELECT pg_temp.ok((SELECT count(*) FROM movimentacoes_estoque WHERE produto_id = pg_temp.g('prod')::INTEGER) = 1, 'sem baixa em dobro');
SELECT pg_temp.ok((portal_detalhe_atendimento(repeat('1', 64), pg_temp.g('e1')::INTEGER)->'orcamento'->'resposta'->>'estado') = 'EFETIVADA',
    'cliente vê efetivada');
SELECT pg_temp.ok((portal_detalhe_atendimento(repeat('1', 64), pg_temp.g('e5')::INTEGER)->'orcamento'->'resposta'->>'estado') = 'PENDENTE_EQUIPE',
    'cliente vê pendente da equipe, não aprovação');
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_resposta(%L, %s, %s, ''RECUSAR'', %s)', repeat('2', 64), pg_temp.g('e1'), pg_temp.g('v_e1'), pg_temp.g('r4')),
    'RESPOSTA_JA_EFETIVADA');
SELECT pg_temp.ok((portal_registrar_solicitacao(repeat('1', 64), pg_temp.g('e1')::INTEGER, pg_temp.g('v_e1')::BIGINT, 'MUDANCA', 'Errei'))->>'tipo' = 'MUDANCA',
    'solicitar correção após efetivação');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM portal_alertas WHERE tipo = 'CORRECAO_SOLICITADA'), 'alerta de correção');
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_solicitacao(%L, %s, %s, ''NEGOCIAR'', '''')', repeat('1', 64), pg_temp.g('e1'), pg_temp.g('v_e1')),
    'PROPOSTA_ALTERADA');

-- ─── Proposta alterada com a página aberta ─────────────────────────────────
DO $$
DECLARE
    e INTEGER; vv INTEGER; v_id BIGINT;
BEGIN
    INSERT INTO equipamentos (serial_number, marca, modelo, tipo, data_entrada, defeito_relatado, empresa_id, cliente_id, status, valor_orcamento)
        VALUES ('SER-777', 'Zebra', 'GC420', 'Impressora', '2026-10-04', 'Falha', pg_temp.g('ea')::INTEGER, pg_temp.g('ca')::INTEGER, 'AGUARDANDO_APROVACAO', 50)
        RETURNING id INTO e;
    INSERT INTO verificacoes (equipamento_id, tecnico_nome, problema_relatado, servicos_necessarios, pecas_necessarias, custo_total, empresa_id)
        VALUES (e, 'Téc', 'Falha', '[]', '[]', 50, pg_temp.g('ea')::INTEGER) RETURNING id INTO vv;
    INSERT INTO orcamento_versoes (empresa_id, equipamento_id, verificacao_id, versao, snapshot, valor_total)
        VALUES (pg_temp.g('ea')::INTEGER, e, vv, 1, '{"servicos":[],"pecas":[]}', 50) RETURNING id INTO v_id;
    INSERT INTO t VALUES ('e7', e), ('v_e7', v_id);
    UPDATE verificacoes SET custo_total = 45 WHERE id = vv;
END $$;
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_resposta(%L, %s, %s, ''APROVAR'', 0)', repeat('1', 64), pg_temp.g('e7'), pg_temp.g('v_e7')),
    'PROPOSTA_ALTERADA');
SELECT pg_temp.ok((portal_detalhe_atendimento(repeat('1', 64), pg_temp.g('e7')::INTEGER)->'orcamento'->>'estado') = 'EM_REVISAO',
    'proposta alterada aparece em revisão');

-- Atendimento transferido para outro cliente deixa de aparecer.
UPDATE equipamentos SET cliente_id = NULL WHERE id = pg_temp.g('e7')::INTEGER;
SELECT pg_temp.espera_erro(format('SELECT portal_detalhe_atendimento(%L, %s)', repeat('1', 64), pg_temp.g('e7')), 'ATENDIMENTO_INDISPONIVEL');

-- ─── Mudança no contato derruba o acesso ───────────────────────────────────
UPDATE cliente_contatos SET telefone = '71911112222', email = 'bruno@cliente.invalid' WHERE id = pg_temp.g('decisor2')::INTEGER;
SELECT pg_temp.ok((SELECT portal_acesso = 'DECIDIR' AND portal_senha_hash IS NOT NULL FROM cliente_contatos WHERE id = pg_temp.g('decisor2')::INTEGER),
    'corrigir telefone/email não retira o acesso nem a senha (0038)');
SELECT pg_temp.ok(jsonb_array_length(portal_listar_atendimentos(repeat('2', 64))->'atendimentos') > 0, 'sessão continua após corrigir o telefone');
UPDATE cliente_contatos SET ativo = FALSE WHERE id = pg_temp.g('decisor2')::INTEGER;
SELECT pg_temp.ok((SELECT portal_acesso = 'NENHUM' AND portal_senha_hash IS NULL FROM cliente_contatos WHERE id = pg_temp.g('decisor2')::INTEGER),
    'desativar o contato retira acesso e senha');
SELECT pg_temp.espera_erro(format('SELECT portal_listar_atendimentos(%L)', repeat('2', 64)), 'SESSAO_INVALIDA');

-- ─── Imutabilidade e leitura de alertas ─────────────────────────────────────
SELECT pg_temp.espera_erro('UPDATE portal_alertas SET titulo = ''x''', 'Alerta do portal é imutável; só a leitura pode ser registrada');
UPDATE portal_alertas SET lido_em = now() WHERE tipo = 'NEGOCIACAO_SOLICITADA';
SELECT pg_temp.espera_erro('DELETE FROM portal_alertas', 'Alertas do portal não podem ser apagados');

-- ─── Senha definida pelo operador (0036) ────────────────────────────────────
SELECT pg_temp.espera_erro(format('SELECT portal_definir_senha_contato(%s, %s, ''abc'', NULL)', pg_temp.g('ea'), pg_temp.g('decisor')), 'SENHA_FRACA');
SELECT pg_temp.espera_erro(format('SELECT portal_definir_senha_contato(%s, %s, ''Senha1234'', NULL)', pg_temp.g('ea'), pg_temp.g('sem_acesso')), 'CONTATO_SEM_ACESSO');
SELECT pg_temp.espera_erro(format('SELECT portal_definir_senha_contato(%s, %s, ''Senha1234'', NULL)', pg_temp.g('eb'), pg_temp.g('decisor')), 'CONTATO_INDISPONIVEL');
SELECT portal_definir_senha_contato(pg_temp.g('ea')::INTEGER, pg_temp.g('decisor')::INTEGER, 'Ana-Senha-2026', NULL);
SELECT pg_temp.ok((SELECT portal_senha_hash LIKE '$2%' AND portal_senha_hash NOT LIKE '%Ana-Senha%' FROM cliente_contatos WHERE id = pg_temp.g('decisor')::INTEGER),
    'só o hash bcrypt é gravado');
SELECT pg_temp.espera_erro(format('SELECT portal_definir_senha_contato(%s, %s, ''Ana-Senha-2026'', NULL)', pg_temp.g('ea'), pg_temp.g('acompanha')), 'SENHA_REPETIDA');
SELECT portal_definir_senha_contato(pg_temp.g('ea')::INTEGER, pg_temp.g('acompanha')::INTEGER, 'Carla-2026', NULL);

SELECT pg_temp.ok((portal_entrar_senha('11.222.333/0001-81', 'errada123', repeat('5', 64))->>'resultado') = 'INVALIDO', 'senha errada');
SELECT pg_temp.ok((portal_entrar_senha('99.888.777/0001-66', 'Ana-Senha-2026', repeat('5', 64))->>'resultado') = 'INVALIDO',
    'senha certa com CNPJ de outro cliente');
SELECT pg_temp.ok((portal_entrar_senha('00.000.000/0001-91', 'Ana-Senha-2026', repeat('5', 64))->>'resultado') = 'INVALIDO',
    'CNPJ sem cadastro responde igual');
DO $$
DECLARE r JSONB := portal_entrar_senha('11.222.333/0001-81', 'Ana-Senha-2026', repeat('5', 64));
BEGIN
    PERFORM pg_temp.ok(r->>'resultado' = 'OK' AND r->>'acesso' = 'DECIDIR' AND r->>'metodo' = 'SENHA', 'senha da decisora entra como ela');
END $$;
SELECT pg_temp.ok((portal_entrar_senha('11222333000181', 'Carla-2026', repeat('6', 64))->>'acesso') = 'ACOMPANHAR', 'a senha identifica o contato');
SELECT pg_temp.ok(jsonb_array_length(portal_listar_atendimentos(repeat('5', 64))->'atendimentos') > 0, 'sessão por senha lista atendimentos');

UPDATE portal_sessoes SET verificada_em = verificada_em - INTERVAL '1 hour' WHERE token_hash = repeat('5', 64);
SELECT pg_temp.ok(NOT portal_reverificar_senha(repeat('5', 64), 'Carla-2026'), 'reverificação não aceita senha de outro contato');
SELECT pg_temp.ok(portal_reverificar_senha(repeat('5', 64), 'Ana-Senha-2026'), 'reverificação com a própria senha');
SELECT pg_temp.ok((SELECT verificada_em > now() - INTERVAL '1 minute' FROM portal_sessoes WHERE token_hash = repeat('5', 64)), 'verificação renovada');

-- Trocar a senha derruba as sessões; retirar o acesso apaga a senha.
SELECT portal_definir_senha_contato(pg_temp.g('ea')::INTEGER, pg_temp.g('decisor')::INTEGER, 'Nova-Senha-77', NULL);
SELECT pg_temp.espera_erro(format('SELECT portal_listar_atendimentos(%L)', repeat('5', 64)), 'SESSAO_INVALIDA');
UPDATE cliente_contatos SET portal_acesso = 'NENHUM' WHERE id = pg_temp.g('acompanha')::INTEGER;
SELECT pg_temp.ok((SELECT portal_senha_hash IS NULL FROM cliente_contatos WHERE id = pg_temp.g('acompanha')::INTEGER), 'sem acesso, sem senha');
SELECT pg_temp.ok((portal_entrar_senha('11222333000181', 'Carla-2026', repeat('7', 64))->>'resultado') = 'INVALIDO', 'senha removida não entra');

-- ─── Dados ampliados (0039) ─────────────────────────────────────────────────
-- Ana (sessão b) e o cliente A passam a exigir ordem de compra; Gil é outro decisor do mesmo cliente.
UPDATE clientes SET exige_ordem_compra = TRUE WHERE id = pg_temp.g('ca')::INTEGER;
SELECT pg_temp.ok((portal_entrar_senha('11222333000181', 'Nova-Senha-77', repeat('b', 64))->>'resultado') = 'OK', '0039: Ana entra');

DO $$
DECLARE
    ea INTEGER := pg_temp.g('ea')::INTEGER;
    ca INTEGER := pg_temp.g('ca')::INTEGER;
    e INTEGER; vv INTEGER; v1 BIGINT; c INTEGER;
BEGIN
    -- Orçamento com duas versões: a 1 (R$ 100) fica no passado, a 2 (R$ 120) está aberta.
    INSERT INTO equipamentos (serial_number, marca, modelo, tipo, data_entrada, defeito_relatado, empresa_id, cliente_id, status, valor_orcamento)
        VALUES ('SER-OC', 'Zebra', 'ZT411', 'Impressora', '2026-10-06', 'Não imprime a etiqueta', ea, ca, 'AGUARDANDO_APROVACAO', 120)
        RETURNING id INTO e;
    INSERT INTO verificacoes (equipamento_id, tecnico_nome, problema_relatado, servicos_necessarios, pecas_necessarias, custo_total, empresa_id)
        VALUES (e, 'Téc', 'Falha', '[]', '[]', 100, ea) RETURNING id INTO vv;
    INSERT INTO orcamento_versoes (empresa_id, equipamento_id, verificacao_id, versao, snapshot, valor_total)
        VALUES (ea, e, vv, 1, '{"servicos":[],"pecas":[]}', 100) RETURNING id INTO v1;
    INSERT INTO t VALUES ('eoc', e), ('v1_eoc', v1);

    -- Gil: decisor sem telefone cadastrado (só e-mail).
    INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, email, portal_acesso)
        VALUES (ea, ca, 'Gil Sem Telefone', 'gil@cliente.invalid', 'DECIDIR') RETURNING id INTO c;
    PERFORM portal_definir_senha_contato(ea, c, 'Gil-Senha-0039', NULL);
    INSERT INTO t VALUES ('gil', c);
END $$;

-- Versão 1: Ana recusa e depois tira uma dúvida.
INSERT INTO t SELECT 'oc_r1', (portal_registrar_resposta(repeat('b', 64), pg_temp.g('eoc')::INTEGER, pg_temp.g('v1_eoc')::BIGINT, 'RECUSAR', 0))->>'id';
SELECT pg_temp.ok((SELECT ordem_compra IS NULL FROM orcamento_respostas WHERE id = pg_temp.g('oc_r1')::BIGINT), 'recusa não guarda ordem de compra');
SELECT portal_registrar_solicitacao(repeat('b', 64), pg_temp.g('eoc')::INTEGER, pg_temp.g('v1_eoc')::BIGINT, 'DUVIDA', 'O fusor está incluso?');
-- A equipe revisa o orçamento: a versão 1 é encerrada e a 2 é publicada.
UPDATE orcamento_versoes SET encerrada_em = now(), encerrada_motivo = 'ORCAMENTO_ALTERADO' WHERE id = pg_temp.g('v1_eoc')::BIGINT;
WITH n AS (
    INSERT INTO orcamento_versoes (empresa_id, equipamento_id, verificacao_id, versao, snapshot, valor_total)
        SELECT empresa_id, equipamento_id, verificacao_id, 2, '{"servicos":[],"pecas":[]}', 120
        FROM orcamento_versoes WHERE id = pg_temp.g('v1_eoc')::BIGINT
        RETURNING id)
INSERT INTO t SELECT 'v2_eoc', id::TEXT FROM n;

-- Ordem de compra: cliente que exige não aprova sem ela.
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_resposta(%L, %s, %s, ''APROVAR'', 0)', repeat('b', 64), pg_temp.g('eoc'), pg_temp.g('v2_eoc')),
    'ORDEM_COMPRA_OBRIGATORIA');
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_resposta(%L, %s, %s, ''APROVAR'', 0, ''   '')', repeat('b', 64), pg_temp.g('eoc'), pg_temp.g('v2_eoc')),
    'ORDEM_COMPRA_OBRIGATORIA');
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_resposta(%L, %s, %s, ''APROVAR'', 0, %L)', repeat('b', 64), pg_temp.g('eoc'), pg_temp.g('v2_eoc'), repeat('9', 61)),
    'ORDEM_COMPRA_OBRIGATORIA');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM orcamento_respostas WHERE versao_id = pg_temp.g('v2_eoc')::BIGINT), 'recusas por falta de OC não gravam resposta');
-- Recusar não pede OC; mudar de ideia para aprovar pede.
INSERT INTO t SELECT 'oc_r2', (portal_registrar_resposta(repeat('b', 64), pg_temp.g('eoc')::INTEGER, pg_temp.g('v2_eoc')::BIGINT, 'RECUSAR', 0))->>'id';
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_resposta(%L, %s, %s, ''APROVAR'', %s)', repeat('b', 64), pg_temp.g('eoc'), pg_temp.g('v2_eoc'), pg_temp.g('oc_r2')),
    'ORDEM_COMPRA_OBRIGATORIA');
DO $$
DECLARE comp JSONB;
BEGIN
    comp := portal_registrar_resposta(repeat('b', 64), pg_temp.g('eoc')::INTEGER, pg_temp.g('v2_eoc')::BIGINT, 'APROVAR',
                pg_temp.g('oc_r2')::BIGINT, '  PO-2026/0042  ');
    INSERT INTO t VALUES ('oc_r3', comp->>'id');
    PERFORM pg_temp.ok(comp->>'ordemCompra' = 'PO-2026/0042', 'comprovante traz a ordem de compra sem espaços');
    PERFORM pg_temp.ok((SELECT ordem_compra FROM orcamento_respostas WHERE id = (comp->>'id')::BIGINT) = 'PO-2026/0042', 'ordem de compra gravada');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM portal_alertas WHERE resposta_id = (comp->>'id')::BIGINT AND detalhe LIKE '%Ordem de compra: PO-2026/0042%'),
        'alerta da equipe mostra a ordem de compra');
    -- Clique repetido devolve o mesmo comprovante.
    PERFORM pg_temp.ok((portal_registrar_resposta(repeat('b', 64), pg_temp.g('eoc')::INTEGER, pg_temp.g('v2_eoc')::BIGINT, 'APROVAR',
        pg_temp.g('oc_r2')::BIGINT, 'PO-2026/0042')->>'id') = comp->>'id', 'clique repetido não duplica');
END $$;
SELECT pg_temp.espera_erro('UPDATE orcamento_respostas SET ordem_compra = ''OUTRA'' WHERE ordem_compra IS NOT NULL', 'Resposta de orçamento é imutável');

-- Cliente sem exigência aprova sem ordem de compra.
DO $$
DECLARE
    ea INTEGER := pg_temp.g('ea')::INTEGER;
    cn INTEGER; c INTEGER; e INTEGER; vv INTEGER; v1 BIGINT; r JSONB;
BEGIN
    INSERT INTO clientes (empresa_id, nome, tipo_pessoa, documento) VALUES (ea, 'TESTE-PORTAL Cliente Livre', 'PJ', '12345678000195') RETURNING id INTO cn;
    INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, telefone, portal_acesso)
        VALUES (ea, cn, 'Hugo Livre', '71900001111', 'DECIDIR') RETURNING id INTO c;
    PERFORM portal_definir_senha_contato(ea, c, 'Hugo-Senha-0039', NULL);
    INSERT INTO equipamentos (serial_number, marca, modelo, tipo, data_entrada, defeito_relatado, empresa_id, cliente_id, status, valor_orcamento)
        VALUES ('SER-LIVRE', 'Epson', 'L805', 'Impressora', '2026-10-06', 'Falha', ea, cn, 'AGUARDANDO_APROVACAO', 70) RETURNING id INTO e;
    INSERT INTO verificacoes (equipamento_id, tecnico_nome, problema_relatado, servicos_necessarios, pecas_necessarias, custo_total, empresa_id)
        VALUES (e, 'Téc', 'Falha', '[]', '[]', 70, ea) RETURNING id INTO vv;
    INSERT INTO orcamento_versoes (empresa_id, equipamento_id, verificacao_id, versao, snapshot, valor_total)
        VALUES (ea, e, vv, 1, '{"servicos":[],"pecas":[]}', 70) RETURNING id INTO v1;
    PERFORM pg_temp.ok((portal_entrar_senha('12345678000195', 'Hugo-Senha-0039', repeat('e', 64))->>'resultado') = 'OK', 'Hugo entra');
    r := portal_registrar_resposta(repeat('e', 64), e, v1, 'APROVAR', 0);
    PERFORM pg_temp.ok(r->>'decisao' = 'APROVAR' AND r->'ordemCompra' = 'null'::JSONB, 'sem exigência, aprova sem ordem de compra');
    PERFORM pg_temp.ok((portal_detalhe_atendimento(repeat('e', 64), e)->'cliente'->>'exigeOrdemCompra') = 'false', 'cliente livre não exige OC');
END $$;

-- Cliente, defeito, valores.
DO $$
DECLARE d JSONB := portal_detalhe_atendimento(repeat('b', 64), pg_temp.g('eoc')::INTEGER);
BEGIN
    PERFORM pg_temp.ok(d->'cliente' = '{"nome": "TESTE-PORTAL Cliente A", "documento": "11222333000181", "exigeOrdemCompra": true}'::JSONB,
        'cliente no detalhe: ' || (d->'cliente')::TEXT);
    PERFORM pg_temp.ok(d->>'defeitoRelatado' = 'Não imprime a etiqueta', 'defeito relatado');
    PERFORM pg_temp.ok(d->'valores' = '{"orcamento": 120, "final": null, "atual": 120}'::JSONB, 'valores: ' || (d->'valores')::TEXT);
    PERFORM pg_temp.ok(d->'orcamento'->'resposta'->>'ordemCompra' = 'PO-2026/0042', 'resposta vigente traz a ordem de compra');
    PERFORM pg_temp.ok(d ? 'fotos' AND d ? 'etapas' AND d ? 'historico' AND d ? 'solicitacoes', 'chaves novas e antigas presentes');
END $$;

-- Histórico: respostas e solicitações das duas versões, do mais recente ao mais antigo.
SELECT portal_registrar_solicitacao(repeat('b', 64), pg_temp.g('eoc')::INTEGER, pg_temp.g('v2_eoc')::BIGINT, 'NEGOCIAR', 'Consegue desconto?');
DO $$
DECLARE
    h JSONB := portal_detalhe_atendimento(repeat('b', 64), pg_temp.g('eoc')::INTEGER)->'historico';
BEGIN
    PERFORM pg_temp.ok(jsonb_array_length(h) = 5, 'histórico traz 5 itens (3 da versão 2 e 2 da versão 1): ' || jsonb_array_length(h));
    PERFORM pg_temp.ok(h->0->>'tipo' = 'SOLICITACAO' AND h->0->>'subtipo' = 'NEGOCIAR' AND (h->0->>'versao')::INT = 2
        AND (h->0->>'valor')::NUMERIC = 120 AND h->0->>'mensagem' = 'Consegue desconto?' AND h->0->>'situacao' = 'AGUARDANDO'
        AND h->0->>'protocolo' LIKE 'S-%' AND h->0->>'contato' = 'Ana Decisora', 'item mais recente é a negociação');
    PERFORM pg_temp.ok(h->1->>'tipo' = 'RESPOSTA' AND h->1->>'subtipo' = 'APROVAR' AND h->1->>'ordemCompra' = 'PO-2026/0042'
        AND h->1->>'protocolo' = 'R-' || pg_temp.g('oc_r3') AND h->1->>'situacao' = 'EM_CORRECAO' AND h->1->'mensagem' = 'null'::JSONB,
        'aprovação com ordem de compra e prazo de correção');
    PERFORM pg_temp.ok(h->2->>'subtipo' = 'RECUSAR' AND (h->2->>'versao')::INT = 2 AND h->2->>'situacao' = 'SUBSTITUIDA', 'recusa trocada aparece como substituída');
    PERFORM pg_temp.ok(h->3->>'tipo' = 'SOLICITACAO' AND h->3->>'subtipo' = 'DUVIDA' AND (h->3->>'versao')::INT = 1 AND (h->3->>'valor')::NUMERIC = 100,
        'dúvida da versão 1');
    PERFORM pg_temp.ok(h->4->>'tipo' = 'RESPOSTA' AND h->4->>'subtipo' = 'RECUSAR' AND (h->4->>'versao')::INT = 1 AND h->4->>'situacao' = 'SUBSTITUIDA',
        'recusa da versão 1 (trocada por uma nova versão sem efetivar)');
END $$;
SELECT pg_temp.ok(jsonb_array_length(portal_detalhe_atendimento(repeat('b', 64), pg_temp.g('eoc')::INTEGER)->'solicitacoes') = 2, 'chave antiga solicitacoes continua');

-- Contato de retorno: validação, alerta para a equipe e gravação só nos campos vazios.
SELECT pg_temp.ok((portal_detalhe_atendimento(repeat('b', 64), pg_temp.g('eoc')::INTEGER)->>'temTelefone') = 'true', 'Ana tem telefone');
SELECT pg_temp.ok((portal_entrar_senha('11222333000181', 'Gil-Senha-0039', repeat('d', 64))->>'resultado') = 'OK', 'Gil entra');
SELECT pg_temp.ok((portal_detalhe_atendimento(repeat('d', 64), pg_temp.g('eoc')::INTEGER)->>'temTelefone') = 'false'
    AND (portal_detalhe_atendimento(repeat('d', 64), pg_temp.g('eoc')::INTEGER)->>'temEmail') = 'true', 'Gil: sem telefone, com e-mail');
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_solicitacao(%L, %s, %s, ''DUVIDA'', ''Oi'', ''12345'', NULL, FALSE)', repeat('d', 64), pg_temp.g('eoc'), pg_temp.g('v2_eoc')),
    'CONTATO_INVALIDO');
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_solicitacao(%L, %s, %s, ''DUVIDA'', ''Oi'', NULL, ''sem-arroba'', FALSE)', repeat('d', 64), pg_temp.g('eoc'), pg_temp.g('v2_eoc')),
    'CONTATO_INVALIDO');
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_solicitacao(%L, %s, %s, ''DUVIDA'', ''Oi'', NULL, %L, FALSE)', repeat('d', 64), pg_temp.g('eoc'), pg_temp.g('v2_eoc'), repeat('a', 200) || '@x.com'),
    'CONTATO_INVALIDO');
-- Sem marcar "salvar", o cadastro do contato não muda.
INSERT INTO t SELECT 's_gil1', (portal_registrar_solicitacao(repeat('d', 64), pg_temp.g('eoc')::INTEGER, pg_temp.g('v2_eoc')::BIGINT, 'DUVIDA',
    'Podem me ligar?', '(71) 91234-5678', 'Outro@Empresa.invalid', FALSE))->>'id';
SELECT pg_temp.ok((SELECT contato_telefone = '71912345678' AND contato_email = 'outro@empresa.invalid' FROM orcamento_solicitacoes WHERE id = pg_temp.g('s_gil1')::BIGINT),
    'solicitação guarda telefone (dígitos) e e-mail (minúsculo)');
SELECT pg_temp.ok((SELECT telefone IS NULL AND email = 'gil@cliente.invalid' FROM cliente_contatos WHERE id = pg_temp.g('gil')::INTEGER), 'sem marcar salvar, o cadastro não muda');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM portal_alertas WHERE solicitacao_id = pg_temp.g('s_gil1')::BIGINT
    AND detalhe LIKE '%Telefone: (71) 91234-5678%' AND detalhe LIKE '%E-mail: outro@empresa.invalid%'), 'alerta da equipe mostra telefone formatado e e-mail');
-- Fixo de 10 dígitos com DDI 55 (12 dígitos): o alerta tira o 55 e usa 4+4.
INSERT INTO t SELECT 's_gil_ddi', (portal_registrar_solicitacao(repeat('d', 64), pg_temp.g('eoc')::INTEGER, pg_temp.g('v2_eoc')::BIGINT, 'DUVIDA',
    'Ligar no fixo', '+55 (71) 3333-4444', NULL, FALSE))->>'id';
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM portal_alertas WHERE solicitacao_id = pg_temp.g('s_gil_ddi')::BIGINT AND detalhe LIKE '%Telefone: (71) 3333-4444%' AND detalhe NOT LIKE '%Telefone: 55%'),
    'alerta tira o DDI 55 de telefone fixo');
-- Marcando "salvar": telefone vazio é preenchido, e-mail já existente é preservado.
SELECT portal_registrar_solicitacao(repeat('d', 64), pg_temp.g('eoc')::INTEGER, pg_temp.g('v2_eoc')::BIGINT, 'DUVIDA',
    'Podem me ligar?', '(71) 91234-5678', 'outro@empresa.invalid', TRUE);
SELECT pg_temp.ok((SELECT telefone = '(71) 91234-5678' AND email = 'gil@cliente.invalid' FROM cliente_contatos WHERE id = pg_temp.g('gil')::INTEGER),
    'salvar preenche só o campo vazio');
INSERT INTO t SELECT 's_gil_ddi2', (portal_registrar_solicitacao(repeat('d', 64), pg_temp.g('eoc')::INTEGER, pg_temp.g('v2_eoc')::BIGINT, 'DUVIDA',
    'Mudei o número', '5571900000000', NULL, TRUE))->>'id';
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM portal_alertas WHERE solicitacao_id = pg_temp.g('s_gil_ddi2')::BIGINT AND detalhe LIKE '%Telefone: (71) 90000-0000%'),
    'alerta tira o DDI 55 de celular (13 dígitos)');
SELECT pg_temp.ok((SELECT telefone = '(71) 91234-5678' FROM cliente_contatos WHERE id = pg_temp.g('gil')::INTEGER), 'salvar nunca sobrescreve');
SELECT pg_temp.ok((portal_detalhe_atendimento(repeat('d', 64), pg_temp.g('eoc')::INTEGER)->>'temTelefone') = 'true', 'Gil agora tem telefone');
SELECT pg_temp.ok((SELECT portal_acesso = 'DECIDIR' AND portal_senha_hash IS NOT NULL FROM cliente_contatos WHERE id = pg_temp.g('gil')::INTEGER), 'salvar contato não tira o acesso');

-- Etapas e valores: datas conhecidas, em ordem; sem data (ou anterior ao cadastro) não aparece.
DO $$
DECLARE
    ea INTEGER := pg_temp.g('ea')::INTEGER;
    ca INTEGER := pg_temp.g('ca')::INTEGER;
    base TIMESTAMP := (now() AT TIME ZONE 'UTC') - INTERVAL '10 days';
    e INTEGER; vv INTEGER; d JSONB;
BEGIN
    INSERT INTO equipamentos (serial_number, marca, modelo, tipo, data_entrada, defeito_relatado, empresa_id, cliente_id, status,
                              valor_orcamento, valor_final, criado_em, data_aprovacao, data_reprovacao, data_pronto)
        VALUES ('SER-ETAPAS', 'Argox', 'OS-2140', 'Impressora', '2026-10-01', 'Falha', ea, ca, 'PRONTO',
                150, 90, base,
                (base + INTERVAL '5 days')::TEXT || '+00',
                '2000-01-01',
                to_char(base + INTERVAL '8 days', 'YYYY-MM-DD'))
        RETURNING id INTO e;
    INSERT INTO verificacoes (equipamento_id, tecnico_nome, problema_relatado, servicos_necessarios, pecas_necessarias, custo_total, empresa_id, data_inicio, data_fim)
        VALUES (e, 'Téc', 'Falha', '[]', '[]', 150, ea, base + INTERVAL '1 day', base + INTERVAL '2 days') RETURNING id INTO vv;
    INSERT INTO orcamento_versoes (empresa_id, equipamento_id, verificacao_id, versao, snapshot, valor_total, criado_em)
        VALUES (ea, e, vv, 1, '{"servicos":[],"pecas":[]}', 150, (base + INTERVAL '3 days') AT TIME ZONE 'UTC');
    INSERT INTO t VALUES ('eet', e);

    d := portal_detalhe_atendimento(repeat('b', 64), e);
    PERFORM pg_temp.ok((SELECT string_agg(x->>'status', ',' ORDER BY ord) FROM jsonb_array_elements(d->'etapas') WITH ORDINALITY AS a(x, ord))
        = 'RECEBIDO,EM_VERIFICACAO,VERIFICADO,AGUARDANDO_APROVACAO,APROVADO,PRONTO',
        'etapas com data conhecida (reprovação anterior ao cadastro some): ' || (d->'etapas')::TEXT);
    PERFORM pg_temp.ok((SELECT bool_and((x->>'em')::TIMESTAMPTZ >= lag_em) FROM (
        SELECT x, lag((x->>'em')::TIMESTAMPTZ, 1, '-infinity') OVER (ORDER BY ord) AS lag_em
        FROM jsonb_array_elements(d->'etapas') WITH ORDINALITY AS a(x, ord)) z), 'etapas em ordem cronológica');
    PERFORM pg_temp.ok(d->'valores' = '{"orcamento": 150, "final": 90, "atual": 90}'::JSONB, 'valor atual prefere o final: ' || (d->'valores')::TEXT);
    PERFORM pg_temp.ok((SELECT (x->>'valorAtual')::NUMERIC FROM jsonb_array_elements(portal_listar_atendimentos(repeat('b', 64))->'atendimentos') x
                        WHERE (x->>'id')::INTEGER = e) = 90, 'lista traz valorAtual');
    PERFORM pg_temp.ok((SELECT (x->>'valorAtual')::NUMERIC FROM jsonb_array_elements(portal_listar_atendimentos(repeat('b', 64))->'atendimentos') x
                        WHERE (x->>'id')::INTEGER = pg_temp.g('eoc')::INTEGER) = 120, 'lista: sem valor final, vale o do orçamento');

    -- Etapa atual sem coluna própria usa a data da última mudança de status.
    INSERT INTO equipamentos (serial_number, marca, modelo, tipo, data_entrada, defeito_relatado, empresa_id, cliente_id, status, criado_em, status_alterado_em)
        VALUES ('SER-MANUT', 'Argox', 'OS-214', 'Impressora', '2026-10-01', 'Falha', ea, ca, 'EM_MANUTENCAO', base, (base + INTERVAL '4 days') AT TIME ZONE 'UTC')
        RETURNING id INTO e;
    d := portal_detalhe_atendimento(repeat('b', 64), e);
    PERFORM pg_temp.ok((SELECT string_agg(x->>'status', ',' ORDER BY ord) FROM jsonb_array_elements(d->'etapas') WITH ORDINALITY AS a(x, ord)) = 'RECEBIDO,EM_MANUTENCAO',
        'etapa atual sem coluna usa status_alterado_em: ' || (d->'etapas')::TEXT);
    PERFORM pg_temp.ok(d->'valores' = '{"orcamento": null, "final": null, "atual": null}'::JSONB, 'valores nulos quando não há');
END $$;

-- Fotos: só do equipamento e da empresa da sessão, por categoria e ordem.
DO $$
DECLARE
    ea INTEGER := pg_temp.g('ea')::INTEGER;
    eb INTEGER := pg_temp.g('eb')::INTEGER;
    e INTEGER := pg_temp.g('eoc')::INTEGER;
    fotos JSONB;
BEGIN
    INSERT INTO equipamento_imagens (equipamento_id, empresa_id, categoria, filename, mime_type, tamanho_bytes, largura, altura, ordem, storage_path) VALUES
        (e, ea, 'SAIDA', 's0.jpg', 'image/jpeg', 10, 800, 600, 0, 'equipamento-imagens/1/1/saida0.jpg'),
        (e, ea, 'ENTRADA', 'e1.jpg', 'image/jpeg', 10, 800, 600, 1, 'equipamento-imagens/1/1/entrada1.jpg'),
        (e, ea, 'ENTRADA', 'e0.jpg', 'image/jpeg', 10, 640, 480, 0, 'equipamento-imagens/1/1/entrada0.jpg'),
        (e, ea, 'VERIFICACAO', 'v0.png', 'image/png', 10, NULL, NULL, 0, 'https://cdn.exemplo.invalid/verif0.png'),
        (e, ea, 'ENTRADA', 'legado.jpg', 'image/jpeg', 10, 100, 100, 5, NULL),
        (e, eb, 'ENTRADA', 'outra-empresa.jpg', 'image/jpeg', 10, 100, 100, 0, 'equipamento-imagens/2/9/secreta.jpg');
    -- Foto de um equipamento da empresa B nunca aparece para o cliente da empresa A.
    INSERT INTO equipamento_imagens (equipamento_id, empresa_id, categoria, filename, mime_type, tamanho_bytes, ordem, storage_path)
        VALUES (pg_temp.g('e3')::INTEGER, eb, 'ENTRADA', 'b.jpg', 'image/jpeg', 10, 0, 'equipamento-imagens/2/3/b.jpg');

    fotos := portal_detalhe_atendimento(repeat('b', 64), e)->'fotos';
    PERFORM pg_temp.ok(jsonb_array_length(fotos) = 4, 'só as 4 fotos válidas da empresa: ' || fotos::TEXT);
    PERFORM pg_temp.ok((SELECT string_agg(x->>'caminho', ' | ' ORDER BY ord) FROM jsonb_array_elements(fotos) WITH ORDINALITY AS a(x, ord))
        = 'equipamento-imagens/1/1/entrada0.jpg | equipamento-imagens/1/1/entrada1.jpg | https://cdn.exemplo.invalid/verif0.png | equipamento-imagens/1/1/saida0.jpg',
        'ordem: categoria, ordem, id');
    PERFORM pg_temp.ok(fotos->0 ?& ARRAY['id', 'categoria', 'caminho', 'largura', 'altura'] AND fotos->0->>'categoria' = 'ENTRADA'
        AND (fotos->0->>'largura')::INT = 640 AND (fotos->0->>'altura')::INT = 480, 'campos da foto');
    PERFORM pg_temp.ok(fotos->2->'largura' = 'null'::JSONB, 'largura desconhecida vira null');
    PERFORM pg_temp.ok(NOT (fotos::TEXT LIKE '%secreta%' OR fotos::TEXT LIKE '%/3/b.jpg%'), 'foto de outra empresa não vaza');
    PERFORM pg_temp.ok(jsonb_array_length(portal_detalhe_atendimento(repeat('b', 64), pg_temp.g('e1')::INTEGER)->'fotos') = 0, 'equipamento sem foto: lista vazia');
END $$;

-- Cartão de contato da empresa: endereço e mapa (somente https).
INSERT INTO portal_contato_empresa (empresa_id, nome_exibicao, endereco, maps_url)
    VALUES (pg_temp.g('ea')::INTEGER, 'BMI TAG Teste', 'Rua Teste, 10 - Salvador/BA', 'https://maps.example.invalid/?q=bmitag')
    ON CONFLICT (empresa_id) DO UPDATE SET endereco = EXCLUDED.endereco, maps_url = EXCLUDED.maps_url, nome_exibicao = EXCLUDED.nome_exibicao;
SELECT pg_temp.ok((portal_detalhe_atendimento(repeat('b', 64), pg_temp.g('eoc')::INTEGER)->'contatoEmpresa'->>'endereco') = 'Rua Teste, 10 - Salvador/BA'
    AND (portal_detalhe_atendimento(repeat('b', 64), pg_temp.g('eoc')::INTEGER)->'contatoEmpresa'->>'mapsUrl') = 'https://maps.example.invalid/?q=bmitag',
    'contato da empresa com endereço e mapa');
SELECT pg_temp.espera_erro(format('UPDATE portal_contato_empresa SET maps_url = %L WHERE empresa_id = %s', 'http://inseguro.invalid/', pg_temp.g('ea')),
    'new row for relation "portal_contato_empresa" violates check constraint "chk_portal_contato_maps_url"');
SELECT pg_temp.espera_erro(format('UPDATE portal_contato_empresa SET endereco = %L WHERE empresa_id = %s', repeat('x', 301), pg_temp.g('ea')),
    'new row for relation "portal_contato_empresa" violates check constraint "chk_portal_contato_endereco"');

-- ─── Chaves por empresa (0038) ──────────────────────────────────────────────
DO $$
DECLARE
    cb_contato INTEGER;
BEGIN
    INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, telefone, portal_acesso)
        SELECT pg_temp.g('eb')::INTEGER, id, 'Beto Empresa B', '71955554444', 'DECIDIR' FROM clientes WHERE documento = '99888777000166'
        RETURNING id INTO cb_contato;
    PERFORM portal_definir_senha_contato(pg_temp.g('eb')::INTEGER, cb_contato, 'Beto-Senha-B1', NULL);
    UPDATE portal_config_empresa SET portal_enabled = FALSE WHERE empresa_id = pg_temp.g('eb')::INTEGER;
END $$;
SELECT pg_temp.espera_erro(format('SELECT portal_entrar_senha(%L, %L, %L)', '99888777000166', 'Beto-Senha-B1', repeat('8', 64)), 'PORTAL_PAUSADO');
SELECT pg_temp.ok((portal_entrar_senha('99888777000166', 'errada-B1', repeat('8', 64))->>'resultado') = 'INVALIDO',
    'pausa só aparece para quem acerta a senha');
SELECT pg_temp.ok((portal_entrar_senha('11222333000181', 'Nova-Senha-77', repeat('9', 64))->>'resultado') = 'OK', 'Ana entra de novo');
SELECT pg_temp.ok(jsonb_array_length(portal_listar_atendimentos(repeat('9', 64))->'atendimentos') > 0,
    'empresa B desligada não afeta a empresa A');
DO $$
DECLARE e INTEGER; v BIGINT;
BEGIN
    INSERT INTO equipamentos (serial_number, marca, modelo, tipo, data_entrada, defeito_relatado, empresa_id, cliente_id, status, valor_orcamento)
        VALUES ('SER-888', 'Zebra', 'ZD220', 'Impressora', '2026-10-05', 'Falha', pg_temp.g('ea')::INTEGER, pg_temp.g('ca')::INTEGER, 'AGUARDANDO_APROVACAO', 50)
        RETURNING id INTO e;
    INSERT INTO orcamento_versoes (empresa_id, equipamento_id, versao, snapshot, valor_total)
        VALUES (pg_temp.g('ea')::INTEGER, e, 1, '{"servicos":[],"pecas":[]}', 50) RETURNING id INTO v;
    INSERT INTO t VALUES ('e8', e), ('v_e8', v);
END $$;
CREATE FUNCTION pg_temp.aguarda(p_sessao TEXT, p_e INTEGER) RETURNS BOOLEAN LANGUAGE sql AS $$
    SELECT (x->>'aguardaResposta')::BOOLEAN FROM jsonb_array_elements(portal_listar_atendimentos(p_sessao)->'atendimentos') x
    WHERE (x->>'id')::INTEGER = p_e
$$;
SELECT pg_temp.ok(pg_temp.aguarda(repeat('9', 64), pg_temp.g('e8')::INTEGER), 'versão aberta aguarda resposta');
UPDATE portal_config_empresa SET respostas_enabled = FALSE WHERE empresa_id = pg_temp.g('ea')::INTEGER;
SELECT pg_temp.ok(NOT pg_temp.aguarda(repeat('9', 64), pg_temp.g('e8')::INTEGER), 'respostas desligadas: lista não pede resposta');
SELECT pg_temp.espera_erro(format('SELECT portal_registrar_solicitacao(%L, %s, %s, ''NEGOCIAR'', '''')', repeat('9', 64), pg_temp.g('e8'), pg_temp.g('v_e8')),
    'ACEITE_PAUSADO');
SELECT pg_temp.ok((portal_detalhe_atendimento(repeat('9', 64), pg_temp.g('e1')::INTEGER)->'orcamento'->>'aceiteOnline') = 'false',
    'respostas desligadas na empresa A');
UPDATE portal_config_empresa SET portal_enabled = FALSE, respostas_enabled = TRUE WHERE empresa_id = pg_temp.g('ea')::INTEGER;
SELECT pg_temp.ok(NOT autoos_portal_respostas_ligadas(pg_temp.g('ea')::INTEGER), 'respostas exigem o portal ligado');
SELECT pg_temp.espera_erro(format('SELECT portal_listar_atendimentos(%L)', repeat('9', 64)), 'PORTAL_PAUSADO');
UPDATE portal_config_empresa SET portal_enabled = TRUE WHERE empresa_id = pg_temp.g('ea')::INTEGER;
UPDATE orcamento_versoes SET encerrada_em = now(), encerrada_motivo = 'ORCAMENTO_ALTERADO' WHERE id = pg_temp.g('v_e8')::BIGINT;
SELECT pg_temp.ok(NOT pg_temp.aguarda(repeat('9', 64), pg_temp.g('e8')::INTEGER), 'versão encerrada: lista não pede resposta');

-- Passar a decidir apaga a senha antiga (criada sem a permissão financeira).
DO $$
DECLARE c INTEGER;
BEGIN
    INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, portal_acesso)
        VALUES (pg_temp.g('ea')::INTEGER, pg_temp.g('ca')::INTEGER, 'Elis Acompanha', 'ACOMPANHAR') RETURNING id INTO c;
    PERFORM portal_definir_senha_contato(pg_temp.g('ea')::INTEGER, c, 'Elis-Senha-5', NULL);
    UPDATE cliente_contatos SET portal_acesso = 'DECIDIR' WHERE id = c;
    PERFORM pg_temp.ok((SELECT portal_senha_hash IS NULL FROM cliente_contatos WHERE id = c), 'promoção a DECIDIR apaga a senha anterior');
END $$;
SELECT pg_temp.ok((portal_entrar_senha('11222333000181', 'Elis-Senha-5', repeat('a', 64))->>'resultado') = 'INVALIDO',
    'senha anterior à promoção não entra');

DELETE FROM portal_config_empresa WHERE empresa_id = pg_temp.g('ea')::INTEGER;
SELECT pg_temp.ok(NOT autoos_portal_ligado(pg_temp.g('ea')::INTEGER), 'empresa sem configuração: portal desligado');

-- ─── Privilégios: a Edge Function só alcança as funções públicas ──────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        RAISE NOTICE 'service_role ausente: privilégios não verificados';
        RETURN;
    END IF;
    PERFORM pg_temp.ok(has_function_privilege('service_role', 'public.portal_listar_atendimentos(text)', 'EXECUTE'), 'service_role lista');
    PERFORM pg_temp.ok(NOT has_function_privilege('service_role', 'public.portal_efetivar_resposta(bigint)', 'EXECUTE'), 'efetivação unitária interna');
    PERFORM pg_temp.ok(NOT has_table_privilege('service_role', 'public.portal_sessoes', 'SELECT'), 'sem leitura direta de sessões');
    PERFORM pg_temp.ok(NOT has_table_privilege('service_role', 'public.portal_codigos', 'SELECT'), 'sem leitura direta de códigos');
    PERFORM pg_temp.ok(NOT has_table_privilege('service_role', 'public.portal_config_empresa', 'SELECT'), 'sem leitura direta das chaves');
    PERFORM pg_temp.ok(NOT has_function_privilege('anon', 'public.portal_listar_atendimentos(text)', 'EXECUTE'), 'anon sem acesso');
    PERFORM pg_temp.ok(has_function_privilege('service_role', 'public.portal_entrar_senha(text,text,text)', 'EXECUTE'), 'service_role entra com senha');
    -- 0039: assinaturas novas (parâmetros com DEFAULT), sem sobrar a antiga, e o auxiliar interno fechado.
    PERFORM pg_temp.ok(has_function_privilege('service_role', 'public.portal_registrar_resposta(text,integer,bigint,text,bigint,text)', 'EXECUTE'),
        'service_role responde com ordem de compra');
    PERFORM pg_temp.ok(has_function_privilege('service_role', 'public.portal_registrar_solicitacao(text,integer,bigint,text,text,text,text,boolean)', 'EXECUTE'),
        'service_role solicita com contato de retorno');
    PERFORM pg_temp.ok(NOT has_function_privilege('anon', 'public.portal_registrar_resposta(text,integer,bigint,text,bigint,text)', 'EXECUTE'), 'anon sem resposta');
    PERFORM pg_temp.ok(NOT has_function_privilege('service_role', 'public.autoos_portal_ts(text)', 'EXECUTE'), 'auxiliar de datas é interno');
    PERFORM pg_temp.ok(to_regprocedure('public.portal_registrar_resposta(text,integer,bigint,text,bigint)') IS NULL
        AND to_regprocedure('public.portal_registrar_solicitacao(text,integer,bigint,text,text)') IS NULL, 'assinaturas antigas removidas');
    PERFORM pg_temp.ok(NOT has_function_privilege('service_role', 'public.portal_definir_senha_contato(integer,integer,text,integer)', 'EXECUTE'),
        'só o desktop define senha');
    PERFORM pg_temp.ok(NOT has_column_privilege('service_role', 'public.cliente_contatos', 'portal_senha_hash', 'SELECT'), 'hash fora do alcance da função');
END $$;

-- ─── Endereço no link público (0044) ─────────────────────────────────────────
DO $$
DECLARE
    v_hash TEXT := repeat('d', 64);
    v_hash_rev TEXT := repeat('e', 64);
    v_hash_exp TEXT := repeat('f', 64);
    v_eq INTEGER := pg_temp.g('eoc')::INTEGER;
    v_emp INTEGER := pg_temp.g('ea')::INTEGER;
    r JSONB;
BEGIN
    INSERT INTO links_status_publico (empresa_id, equipamento_id, token_hash, criado_em, expira_em)
        VALUES (v_emp, v_eq, v_hash, statement_timestamp() - INTERVAL '1 hour', statement_timestamp() + INTERVAL '1 day');
    INSERT INTO links_status_publico (empresa_id, equipamento_id, token_hash, criado_em, expira_em, revogado_em)
        VALUES (v_emp, v_eq, v_hash_rev, statement_timestamp() - INTERVAL '1 hour', statement_timestamp() + INTERVAL '1 day', statement_timestamp());
    INSERT INTO links_status_publico (empresa_id, equipamento_id, token_hash, criado_em, expira_em)
        VALUES (v_emp, v_eq, v_hash_exp, statement_timestamp() - INTERVAL '2 hours', statement_timestamp() - INTERVAL '1 hour');

    UPDATE equipamentos SET status = 'EM_VERIFICACAO' WHERE id = v_eq;
    PERFORM pg_temp.ok(status_publico_retirada(v_hash) IS NULL, 'fora de PRONTO: sem endereço');

    UPDATE equipamentos SET status = 'PRONTO' WHERE id = v_eq;
    r := status_publico_retirada(v_hash);
    PERFORM pg_temp.ok(r IS NOT NULL AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r) k) = ARRAY['endereco', 'mapsUrl', 'nome'],
        'PRONTO: só nome, endereco e mapsUrl');
    PERFORM pg_temp.ok(r->>'endereco' = 'Rua Teste, 10 - Salvador/BA' AND r->>'nome' = 'BMI TAG Teste'
        AND r->>'mapsUrl' = 'https://maps.example.invalid/?q=bmitag', 'PRONTO: valores do cartão da empresa');
    PERFORM pg_temp.ok(status_publico_retirada(v_hash_rev) IS NULL, 'link revogado: sem endereço');
    PERFORM pg_temp.ok(status_publico_retirada(v_hash_exp) IS NULL, 'link expirado: sem endereço');
    PERFORM pg_temp.ok(status_publico_retirada(repeat('0', 64)) IS NULL, 'hash desconhecido: sem endereço');

    PERFORM pg_temp.ok(NOT has_function_privilege('public', 'public.status_publico_retirada(text)', 'EXECUTE'), 'PUBLIC sem acesso ao endereço');
    -- Papéis do Supabase não existem no Postgres puro do CI.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        PERFORM pg_temp.ok(NOT has_function_privilege('anon', 'public.status_publico_retirada(text)', 'EXECUTE'), 'anon sem acesso ao endereço');
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        PERFORM pg_temp.ok(has_function_privilege('service_role', 'public.status_publico_retirada(text)', 'EXECUTE'), 'service_role lê o endereço');
    END IF;
END $$;

SELECT 'portal_cliente_contract: OK' AS resultado;
ROLLBACK;
