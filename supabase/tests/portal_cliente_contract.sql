-- Contrato SQL do Portal das Impressoras do Cliente (migrations 0034 e 0035).
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
    UPDATE portal_cliente_config SET portal_enabled = TRUE;
    UPDATE orcamento_aceite_config SET online_enabled = TRUE;

    INSERT INTO empresas (nome, email, status) VALUES ('TESTE-PORTAL A', 'portal-a@teste.invalid', 'ativo') RETURNING id INTO ea;
    INSERT INTO empresas (nome, email, status) VALUES ('TESTE-PORTAL B', 'portal-b@teste.invalid', 'ativo') RETURNING id INTO eb;
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

-- ─── Login: CPF/CNPJ sozinho não basta ──────────────────────────────────────
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM portal_criar_desafio('11.222.333/0001-81', '71900000000',
    gen_random_uuid(), repeat('a', 64))), 'telefone errado não gera código');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM portal_criar_desafio('11.222.333/0001-81', '71966665555',
    gen_random_uuid(), repeat('a', 64))), 'contato sem acesso ao portal não gera código');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM portal_criar_desafio('99.888.777/0001-66', '71988887777',
    gen_random_uuid(), repeat('a', 64))), 'contato de outro cliente não gera código');

INSERT INTO t SELECT 'desafio_velho', desafio_id::TEXT
FROM portal_criar_desafio('11.222.333/0001-81', '+55 71 98888-7777', '00000000-0000-0000-0000-0000000000a0', repeat('b', 64));
INSERT INTO t SELECT 'desafio_ana', desafio_id::TEXT || '|' || canal || '|' || destino
FROM portal_criar_desafio('11222333000181', '71988887777', '00000000-0000-0000-0000-0000000000a1', repeat('c', 64));
SELECT pg_temp.ok(split_part(pg_temp.g('desafio_ana'), '|', 2) = 'WHATSAPP' AND split_part(pg_temp.g('desafio_ana'), '|', 3) = '71988887777',
    'canal e destino completo só para o servidor');
SELECT pg_temp.ok((portal_verificar_codigo('00000000-0000-0000-0000-0000000000a0', repeat('b', 64), repeat('1', 64))->>'resultado') = 'CODIGO_INDISPONIVEL',
    'código anterior é invalidado pelo novo');
SELECT pg_temp.ok((portal_verificar_codigo('00000000-0000-0000-0000-0000000000a1', repeat('d', 64), repeat('1', 64))->>'tentativasRestantes') = '4',
    'código errado consome tentativa');
SELECT pg_temp.ok((portal_verificar_codigo('00000000-0000-0000-0000-0000000000a1', repeat('c', 64), repeat('1', 64))->>'resultado') = 'OK',
    'código certo cria sessão');
SELECT pg_temp.ok((portal_verificar_codigo('00000000-0000-0000-0000-0000000000a1', repeat('c', 64), repeat('9', 64))->>'resultado') = 'CODIGO_INDISPONIVEL',
    'código é de uso único');

-- Entrega que falhou gera alerta persistente.
INSERT INTO t SELECT 'desafio_carla', desafio_id::TEXT
FROM portal_criar_desafio('11222333000181', 'Carla@Cliente.invalid', '00000000-0000-0000-0000-0000000000c1', repeat('e', 64));
SELECT portal_registrar_entrega_codigo(pg_temp.g('desafio_carla')::BIGINT, 'FALHOU', 'Provedor recusou');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM portal_alertas WHERE tipo = 'CODIGO_NAO_ENTREGUE' AND contato_id = pg_temp.g('acompanha')::INTEGER),
    'alerta de código não entregue');
SELECT pg_temp.ok((portal_verificar_codigo('00000000-0000-0000-0000-0000000000c1', repeat('e', 64), repeat('3', 64))->>'resultado') = 'CODIGO_INDISPONIVEL',
    'código não entregue não vale');
SELECT 1 FROM portal_criar_desafio('11222333000181', 'carla@cliente.invalid', '00000000-0000-0000-0000-0000000000c2', repeat('f', 64));
SELECT pg_temp.ok((portal_verificar_codigo('00000000-0000-0000-0000-0000000000c2', repeat('f', 64), repeat('3', 64))->>'acesso') = 'ACOMPANHAR',
    'acompanhante entra');

SELECT 1 FROM portal_criar_desafio('11222333000181', '71977776666', '00000000-0000-0000-0000-0000000000b1', repeat('0', 63) || '1');
SELECT pg_temp.ok((portal_verificar_codigo('00000000-0000-0000-0000-0000000000b1', repeat('0', 63) || '1', repeat('2', 64))->>'resultado') = 'OK',
    'segundo decisor entra');

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
INSERT INTO t SELECT 'reverif', desafio_id::TEXT FROM portal_criar_desafio_sessao(repeat('1', 64), 'EMAIL', '00000000-0000-0000-0000-0000000000a2', repeat('7', 64));
SELECT pg_temp.ok((portal_verificar_codigo('00000000-0000-0000-0000-0000000000a2', repeat('7', 64), NULL, repeat('2', 64))->>'resultado') = 'CODIGO_INDISPONIVEL',
    'reverificação não serve para outra sessão');
INSERT INTO t SELECT 'reverif2', desafio_id::TEXT FROM portal_criar_desafio_sessao(repeat('1', 64), 'EMAIL', '00000000-0000-0000-0000-0000000000a3', repeat('8', 64));
SELECT pg_temp.ok((portal_verificar_codigo('00000000-0000-0000-0000-0000000000a3', repeat('8', 64), NULL, repeat('1', 64))->>'reverificada') = 'true',
    'reverificação renova a própria sessão');

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
UPDATE cliente_contatos SET telefone = '71911112222' WHERE id = pg_temp.g('decisor2')::INTEGER;
SELECT pg_temp.ok((SELECT portal_acesso FROM cliente_contatos WHERE id = pg_temp.g('decisor2')::INTEGER) = 'NENHUM', 'trocar telefone retira acesso');
SELECT pg_temp.espera_erro(format('SELECT portal_listar_atendimentos(%L)', repeat('2', 64)), 'SESSAO_INVALIDA');

-- ─── Imutabilidade e leitura de alertas ─────────────────────────────────────
SELECT pg_temp.espera_erro('UPDATE portal_alertas SET titulo = ''x''', 'Alerta do portal é imutável; só a leitura pode ser registrada');
UPDATE portal_alertas SET lido_em = now() WHERE tipo = 'NEGOCIACAO_SOLICITADA';
SELECT pg_temp.espera_erro('DELETE FROM portal_alertas', 'Alertas do portal não podem ser apagados');

-- ─── Senha definida pelo operador (0035) ────────────────────────────────────
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
    PERFORM pg_temp.ok((r->>'trocarSenha')::BOOLEAN, 'senha do operador é provisória');
END $$;
SELECT pg_temp.ok((portal_entrar_senha('11222333000181', 'Carla-2026', repeat('6', 64))->>'acesso') = 'ACOMPANHAR', 'a senha identifica o contato');
SELECT pg_temp.ok(portal_metodo_sessao(repeat('5', 64)) = 'SENHA', 'método da sessão');

-- ─── Senha provisória: troca obrigatória antes de qualquer outra coisa (0037) ─
SELECT pg_temp.espera_erro(format('SELECT portal_listar_atendimentos(%L)', repeat('5', 64)), 'TROCA_SENHA_PENDENTE');
SELECT pg_temp.espera_erro(format('SELECT portal_trocar_senha(%L, ''curta'')', repeat('5', 64)), 'SENHA_FRACA');
SELECT pg_temp.espera_erro(format('SELECT portal_trocar_senha(%L, ''Ana-Senha-2026'')', repeat('5', 64)), 'SENHA_IGUAL');
SELECT pg_temp.espera_erro(format('SELECT portal_trocar_senha(%L, ''Carla-2026'')', repeat('5', 64)), 'SENHA_REPETIDA');
SELECT pg_temp.ok(portal_trocar_senha(repeat('5', 64), 'Ana-Propria-99') = 'OK', 'contato cria a própria senha');
SELECT pg_temp.ok((SELECT NOT portal_senha_provisoria AND portal_senha_definida_por_profile_id IS NULL
    FROM cliente_contatos WHERE id = pg_temp.g('decisor')::INTEGER), 'senha deixa de ser provisória e não é do operador');
SELECT pg_temp.ok(jsonb_array_length(portal_listar_atendimentos(repeat('5', 64))->'atendimentos') > 0, 'a mesma sessão segue depois da troca');
SELECT pg_temp.espera_erro(format('SELECT portal_listar_atendimentos(%L)', repeat('6', 64)), 'TROCA_SENHA_PENDENTE');
SELECT pg_temp.ok((portal_entrar_senha('11222333000181', 'Ana-Senha-2026', repeat('8', 64))->>'resultado') = 'INVALIDO', 'provisória não vale mais');
SELECT pg_temp.ok(NOT ((portal_entrar_senha('11222333000181', 'Ana-Propria-99', repeat('8', 64))->>'trocarSenha')::BOOLEAN), 'nova senha entra direto');
-- Troca voluntária (esqueci a senha) exige verificação recente.
UPDATE portal_sessoes SET verificada_em = verificada_em - INTERVAL '1 hour' WHERE token_hash = repeat('8', 64);
SELECT pg_temp.espera_erro(format('SELECT portal_trocar_senha(%L, ''Outra-Senha-1'')', repeat('8', 64)), 'VERIFICACAO_NECESSARIA');

UPDATE portal_sessoes SET verificada_em = verificada_em - INTERVAL '1 hour' WHERE token_hash = repeat('5', 64);
SELECT pg_temp.ok(NOT portal_reverificar_senha(repeat('5', 64), 'Carla-2026'), 'reverificação não aceita senha de outro contato');
SELECT pg_temp.ok(portal_reverificar_senha(repeat('5', 64), 'Ana-Propria-99'), 'reverificação com a própria senha');
SELECT pg_temp.ok((SELECT verificada_em > now() - INTERVAL '1 minute' FROM portal_sessoes WHERE token_hash = repeat('5', 64)), 'verificação renovada');

-- Trocar a senha derruba as sessões; retirar o acesso apaga a senha.
SELECT portal_definir_senha_contato(pg_temp.g('ea')::INTEGER, pg_temp.g('decisor')::INTEGER, 'Nova-Senha-77', NULL);
SELECT pg_temp.espera_erro(format('SELECT portal_listar_atendimentos(%L)', repeat('5', 64)), 'SESSAO_INVALIDA');
UPDATE cliente_contatos SET portal_acesso = 'NENHUM' WHERE id = pg_temp.g('acompanha')::INTEGER;
SELECT pg_temp.ok((SELECT portal_senha_hash IS NULL FROM cliente_contatos WHERE id = pg_temp.g('acompanha')::INTEGER), 'sem acesso, sem senha');
SELECT pg_temp.ok((portal_entrar_senha('11222333000181', 'Carla-2026', repeat('7', 64))->>'resultado') = 'INVALIDO', 'senha removida não entra');

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
    PERFORM pg_temp.ok(NOT has_function_privilege('anon', 'public.portal_listar_atendimentos(text)', 'EXECUTE'), 'anon sem acesso');
    PERFORM pg_temp.ok(has_function_privilege('service_role', 'public.portal_entrar_senha(text,text,text)', 'EXECUTE'), 'service_role entra com senha');
    PERFORM pg_temp.ok(has_function_privilege('service_role', 'public.portal_trocar_senha(text,text)', 'EXECUTE'), 'service_role troca senha');
    PERFORM pg_temp.ok(NOT has_function_privilege('service_role', 'public.portal_definir_senha_contato(integer,integer,text,integer)', 'EXECUTE'),
        'só o desktop define senha');
    PERFORM pg_temp.ok(NOT has_column_privilege('service_role', 'public.cliente_contatos', 'portal_senha_hash', 'SELECT'), 'hash fora do alcance da função');
END $$;

SELECT 'portal_cliente_contract: OK' AS resultado;
ROLLBACK;
