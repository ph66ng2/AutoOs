-- Somente banco descartável com migrations SQLx; transação sempre revertida.
BEGIN;
CREATE FUNCTION pg_temp.ok(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'Falhou: %', p_msg; END IF; END $$;
CREATE FUNCTION pg_temp.erro(p_sql TEXT, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    BEGIN EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = p_msg THEN RETURN; END IF;
        RAISE;
    END;
    RAISE EXCEPTION 'Esperava erro %', p_msg;
END $$;
DO $$
DECLARE ea INTEGER; eb INTEGER; ca INTEGER; cb INTEGER; co INTEGER; e INTEGER; outro INTEGER;
    v1 BIGINT; v2 BIGINT; outro_cliente INTEGER; mesma_empresa INTEGER; token TIMESTAMPTZ; caminho TEXT; retorno TEXT; docs JSONB;
BEGIN
    INSERT INTO empresas(nome, email, status) VALUES ('TESTE PDF A','pdf-a@teste.invalid','ativo') RETURNING id INTO ea;
    INSERT INTO empresas(nome, email, status) VALUES ('TESTE PDF B','pdf-b@teste.invalid','ativo') RETURNING id INTO eb;
    INSERT INTO portal_config_empresa(empresa_id,portal_enabled,respostas_enabled) VALUES(ea,TRUE,TRUE);
    INSERT INTO clientes(empresa_id,nome,tipo_pessoa,documento) VALUES(ea,'PDF cliente A','PJ','11222333000181') RETURNING id INTO ca;
    INSERT INTO clientes(empresa_id,nome,tipo_pessoa,documento) VALUES(eb,'PDF cliente B','PJ','99888777000166') RETURNING id INTO cb;
    INSERT INTO cliente_contatos(empresa_id,cliente_id,nome,portal_acesso) VALUES(ea,ca,'Contato PDF','ACOMPANHAR') RETURNING id INTO co;
    INSERT INTO portal_sessoes(token_hash,empresa_id,cliente_id,contato_id,expira_em,verificada_em,metodo)
    VALUES(repeat('a',64),ea,ca,co,now()+interval '1 hour',now(),'SENHA');
    INSERT INTO equipamentos(serial_number,marca,modelo,tipo,data_entrada,status,empresa_id,cliente_id,defeito_relatado)
    VALUES('PDF A','Marca','Modelo','Impressora','2026-11-10','RECEBIDO',ea,ca,'Falha') RETURNING id,atualizado_em INTO e,token;
    INSERT INTO equipamentos(serial_number,marca,modelo,tipo,data_entrada,status,empresa_id,cliente_id,defeito_relatado)
    VALUES('PDF B','Marca','Modelo','Impressora','2026-11-10','RECEBIDO',eb,cb,'Falha') RETURNING id INTO outro;
    INSERT INTO clientes(empresa_id,nome,tipo_pessoa,documento) VALUES(ea,'Outro cliente','PJ','22333444000155') RETURNING id INTO outro_cliente;
    INSERT INTO equipamentos(serial_number,marca,modelo,tipo,data_entrada,status,empresa_id,cliente_id,defeito_relatado)
    VALUES('PDF C','Marca','Modelo','Impressora','2026-11-10','RECEBIDO',ea,outro_cliente,'Falha') RETURNING id INTO mesma_empresa;
    PERFORM pg_temp.erro(format('SELECT portal_documentos_atendimento(%L,%s)',repeat('a',64),mesma_empresa),'ATENDIMENTO_INDISPONIVEL');
    PERFORM pg_temp.ok(portal_documentos_atendimento(repeat('a',64),e)='[]'::JSONB,'legado sem arquivo');
    caminho := ea||'/'||e||'/ORDEM_SERVICO/0/'||repeat('1',64)||'.pdf';
    retorno := autoos_registrar_documento_oficial(ea,e,'ORDEM_SERVICO',NULL,token,caminho,repeat('1',64),100);
    PERFORM pg_temp.ok(retorno=caminho,'registra OS');
    retorno := autoos_registrar_documento_oficial(ea,e,'ORDEM_SERVICO',NULL,token,
        ea||'/'||e||'/ORDEM_SERVICO/0/'||repeat('2',64)||'.pdf',repeat('2',64),100);
    PERFORM pg_temp.ok(retorno=caminho,'reimpressão usa os mesmos bytes canônicos');
    INSERT INTO orcamento_versoes(empresa_id,equipamento_id,versao,snapshot,valor_total)
    VALUES(ea,e,1,'{}',100) RETURNING id INTO v1;
    caminho := ea||'/'||e||'/ORCAMENTO/'||v1||'/'||repeat('3',64)||'.pdf';
    PERFORM autoos_registrar_documento_oficial(ea,e,'ORCAMENTO',v1,token,caminho,repeat('3',64),100);
    INSERT INTO orcamento_versoes(empresa_id,equipamento_id,versao,snapshot,valor_total)
    VALUES(ea,e,2,'{}',150) RETURNING id INTO v2;
    caminho := ea||'/'||e||'/ORCAMENTO/'||v2||'/'||repeat('4',64)||'.pdf';
    PERFORM autoos_registrar_documento_oficial(ea,e,'ORCAMENTO',v2,token,caminho,repeat('4',64),100);
    caminho := ea||'/'||e||'/ORCAMENTO_AJUSTADO/'||v2||'/'||repeat('5',64)||'.pdf';
    PERFORM autoos_registrar_documento_oficial(ea,e,'ORCAMENTO_AJUSTADO',v2,token,caminho,repeat('5',64),100);
    docs := portal_documentos_atendimento(repeat('a',64),e);
    PERFORM pg_temp.ok(jsonb_array_length(docs)=4,'OS, v1, v2 e ajustado separados');
    PERFORM pg_temp.erro(format('SELECT portal_documentos_atendimento(%L,%s)',repeat('a',64),outro),'ATENDIMENTO_INDISPONIVEL');
    PERFORM pg_temp.erro(format('SELECT portal_documentos_atendimento(%L,%s)',repeat('f',64),e),'SESSAO_INVALIDA');
    PERFORM pg_temp.erro(format('SELECT autoos_registrar_documento_oficial(%s,%s,%L,NULL,%L,%L,%L,100)',
        ea,e,'ORDEM_SERVICO',token-interval '1 second',caminho,repeat('5',64)),'DOCUMENTO_DESATUALIZADO');
    PERFORM pg_temp.erro(format('SELECT autoos_registrar_documento_oficial(%s,%s,%L,%s,%L,%L,%L,100)',
        ea,e,'ORCAMENTO',v1,token,caminho,repeat('5',64)),'DOCUMENTO_DESATUALIZADO');
    UPDATE equipamentos SET atualizado_em=token+interval '1 second' WHERE id=e;
    token := token+interval '1 second';
    caminho := ea||'/'||e||'/ORCAMENTO_AJUSTADO/'||v2||'/'||repeat('6',64)||'.pdf';
    retorno := autoos_registrar_documento_oficial(ea,e,'ORCAMENTO_AJUSTADO',v2,token,caminho,repeat('6',64),100);
    PERFORM pg_temp.ok(retorno=caminho,'ajustado avança com a revisão');
    PERFORM pg_temp.ok((SELECT sha256=repeat('4',64) FROM portal_documentos_oficiais WHERE equipamento_id=e AND tipo='ORCAMENTO' AND versao_id=v2),'ajustado preserva original');
    UPDATE portal_config_empresa SET portal_enabled=FALSE WHERE empresa_id=ea;
    PERFORM pg_temp.erro(format('SELECT portal_documentos_atendimento(%L,%s)',repeat('a',64),e),'PORTAL_PAUSADO');
    UPDATE portal_config_empresa SET portal_enabled=TRUE WHERE empresa_id=ea;
    UPDATE portal_sessoes SET encerrada_em=now() WHERE token_hash=repeat('a',64);
    PERFORM pg_temp.erro(format('SELECT portal_documentos_atendimento(%L,%s)',repeat('a',64),e),'SESSAO_INVALIDA');
    UPDATE portal_sessoes SET encerrada_em=NULL, criada_em=now()-interval '2 hours', expira_em=now()-interval '1 hour' WHERE token_hash=repeat('a',64);
    PERFORM pg_temp.erro(format('SELECT portal_documentos_atendimento(%L,%s)',repeat('a',64),e),'SESSAO_INVALIDA');
    -- Troca de cliente: o novo cliente não vê documentos emitidos para o anterior.
    INSERT INTO cliente_contatos(empresa_id,cliente_id,nome,portal_acesso) VALUES(ea,outro_cliente,'Contato novo','ACOMPANHAR') RETURNING id INTO co;
    INSERT INTO portal_sessoes(token_hash,empresa_id,cliente_id,contato_id,expira_em,verificada_em,metodo)
    VALUES(repeat('b',64),ea,outro_cliente,co,now()+interval '1 hour',now(),'SENHA');
    UPDATE equipamentos SET cliente_id=outro_cliente, atualizado_em=token+interval '1 second' WHERE id=e RETURNING atualizado_em INTO token;
    PERFORM pg_temp.ok(portal_documentos_atendimento(repeat('b',64),e)='[]'::JSONB,'novo cliente não vê PDFs do anterior');
    caminho := ea||'/'||e||'/ORDEM_SERVICO/0/'||repeat('7',64)||'.pdf';
    retorno := autoos_registrar_documento_oficial(ea,e,'ORDEM_SERVICO',NULL,token,caminho,repeat('7',64),100);
    PERFORM pg_temp.ok(retorno=caminho,'nova OS canônica para o novo cliente');
    docs := portal_documentos_atendimento(repeat('b',64),e);
    PERFORM pg_temp.ok(jsonb_array_length(docs)=1 AND docs->0->>'caminho'=caminho,'novo cliente vê só a própria OS');
    PERFORM pg_temp.ok((SELECT count(*) FROM portal_documentos_oficiais WHERE equipamento_id=e AND cliente_id=ca)=4,'emissões do anterior preservadas');
    PERFORM pg_temp.ok(NOT has_function_privilege('public','public.portal_documentos_atendimento(text,integer)','EXECUTE'),'PUBLIC sem RPC');
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
        PERFORM pg_temp.ok(NOT has_function_privilege('anon','public.portal_documentos_atendimento(text,integer)','EXECUTE'),'anon sem RPC');
        PERFORM pg_temp.ok(NOT has_table_privilege('anon','public.portal_documentos_oficiais','SELECT'),'anon sem referências');
        PERFORM pg_temp.ok(NOT has_table_privilege('authenticated','public.portal_documentos_oficiais','INSERT'),'authenticated sem escrita');
        PERFORM pg_temp.ok(has_function_privilege('service_role','public.portal_documentos_atendimento(text,integer)','EXECUTE'),'edge com RPC');
    END IF;
END $$;
SELECT 'portal_documentos_contract: OK' AS resultado;
ROLLBACK;
