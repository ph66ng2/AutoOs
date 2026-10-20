//! Integração real. Executar somente em autoos_stock_test* com migrations aplicadas.
#[path = "../commands/mod.rs"] mod commands;
#[path = "../db.rs"] mod db;
#[path = "../test_support/memory_keyring.rs"] mod memory_keyring;
use commands::{auth, equipamentos, orcamento_correcao, orcamento_decisao, portal_cliente, verificacoes, orcamento_estoque, produtos, servicos};
use commands::types::*;
use anyhow::{Result, anyhow};

#[tokio::main]
async fn main() -> Result<()> {
    let url = std::env::var("AUTOOS_STOCK_TEST_DATABASE_URL")?;
    let guard = sqlx::PgPool::connect(&url).await?;
    let name: String = sqlx::query_scalar("SELECT current_database()").fetch_one(&guard).await?;
    assert!(name.starts_with("autoos_stock_test"));
    std::env::set_var("DATABASE_URL", url);
    memory_keyring::install();
    let pool = db::init_database().await?;
    let suffix = chrono::Utc::now().timestamp_nanos_opt().unwrap().to_string();
    let empresa: i32 = sqlx::query_scalar("INSERT INTO empresas(nome,email,status) VALUES ('Teste',$1,'ativo') RETURNING id")
        .bind(format!("cmd-{suffix}@example.test")).fetch_one(&pool).await?;
    let profile: i32 = sqlx::query_scalar("INSERT INTO security_profiles(nome,role,permissions,empresa_id,ativo,is_default) VALUES ($1,'ADMIN',$2,$3,true,false) RETURNING id")
        .bind(format!("Stock {suffix}")).bind(serde_json::to_string(&[auth::PERMISSION_STOCK_CONTROL, auth::PERMISSION_FINANCIAL_ACTIONS, auth::PERMISSION_MANAGE_STATUS_LINKS])?).bind(empresa).fetch_one(&pool).await?;
    // Perfis exigem PIN por padrão (0030): o perfil sintético usa um PIN real de fixture.
    auth::store_profile_pin(profile, "1357").map_err(|e| anyhow!(e))?;
    auth::set_active_security_profile(profile, "1357".into(), Some("1357".into())).await.map_err(|e| anyhow!(e))?;
    auth::unlock_sensitive_access("1357".into()).await.map_err(|e| anyhow!(e))?;
    let produto = produtos::criar_produto(ProdutoInput {
        codigo: format!("P-{suffix}"), nome: "Cabeça".into(), categoria: "PEÇA".into(),
        quantidade_estoque: 2, preco_custo: 1.0, preco_venda: 10.0, ..ProdutoInput::default()
    }).await.map_err(|e| anyhow!(e))?;
    let catalogo = servicos::criar_servico(ServicoCatalogoInput {
        nome: format!("Troca {suffix}"), preco_padrao: 20.0,
        pecas_sugeridas: vec![serde_json::json!({"produto_id":produto.id,"quantidade":1,"valor_unitario":10})],
        ..ServicoCatalogoInput::default()
    }).await.map_err(|e| anyhow!(e))?;
    servicos::atualizar_servico(catalogo.id, ServicoCatalogoInput {
        nome: catalogo.nome, preco_padrao: 25.0, atualizado_em: catalogo.atualizado_em,
        pecas_sugeridas: vec![], ..ServicoCatalogoInput::default()
    }).await.map_err(|e| anyhow!(e))?;
    let eq: i32 = sqlx::query_scalar("INSERT INTO equipamentos(serial_number,marca,modelo,tipo,data_entrada,defeito_relatado,empresa_id,status) VALUES ($1,'Zebra','GC420t','Impressora','2026-09-27','Teste',$2,'VERIFICADO') RETURNING id")
        .bind(format!("E-{suffix}")).bind(empresa).fetch_one(&pool).await?;
    let services = serde_json::json!([
      {"id":"a","descricao":"Troca cabeça","valor":20,"pecas":[{"produto_id":produto.id,"quantidade":3,"nome":"Cabeça","valor_unitario":10}]},
      {"id":"b","descricao":"Troca feed","valor":30,"pecas":[{"produto_id":produto.id,"quantidade":1,"nome":"Cabeça","valor_unitario":10}]}
    ]);
    verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
        equipamento_id:eq, empresa_id:Some(empresa), tecnico_nome:"Teste".into(), problema_relatado:"Teste".into(),
        servicos_necessarios:Some(services.to_string()), pecas_necessarias:Some("[]".into()), custo_total:Some(90.0), ..VerificacaoInput::default()
    }).await.map_err(|e| anyhow!(e))?;
    sqlx::query("UPDATE equipamentos SET status='AGUARDANDO_APROVACAO' WHERE id=$1").bind(eq).execute(&pool).await?;
    let token: String = sqlx::query_scalar("SELECT atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await?;
    let input = AprovarOrcamentoInput { empresa_id:empresa,equipamento_id:eq,expected_updated_em:token.clone(),
        pagamento:FormaPagamento { codigo:FormaPagamentoCodigo::Pix,detalhe:None },servicos_aprovados:vec!["a".into()],aprovado:None,resposta_esperada_id:None,motivo_divergencia:None };
    equipamentos::aprovar_orcamento(input.clone()).await.map_err(|e| anyhow!(e))?;
    assert!(equipamentos::aprovar_orcamento(input).await.is_err());
    let v = verificacoes::buscar_verificacao_tecnica(eq,Some(empresa)).await.map_err(|e| anyhow!(e))?;
    assert_eq!(v.custo_total,Some(50.0));
    assert_eq!(v.servicos_orcamento_original.unwrap().as_array().unwrap().len(),2);
    assert_eq!(produtos::buscar_produto(produto.id).await.map_err(|e| anyhow!(e))?.quantidade_estoque,Some(0));
    produtos::registrar_movimentacao_estoque(MovimentacaoEstoqueInput { produto_id:produto.id,tipo:"ENTRADA".into(),quantidade:5,origem:"COMPRA".into(),referencia:None }).await.map_err(|e| anyhow!(e))?;
    assert_eq!(orcamento_estoque::baixar_pecas_pendentes(eq).await.map_err(|e| anyhow!(e))?,1);
    assert_eq!(orcamento_estoque::baixar_pecas_pendentes(eq).await.map_err(|e| anyhow!(e))?,0);
    let mut novos = services.as_array().unwrap()[..1].to_vec();
    novos[0]["pecas"][0]["quantidade"] = 4.into();
    let json = serde_json::to_string(&novos)?;
    assert!(verificacoes::atualizar_servicos_verificacao(eq,Some(json.clone()),Some("[]".into()),Some(60.0),profile,false,None,None,None,Some(empresa),Some(false),None,None).await.is_err());
    assert!(verificacoes::atualizar_servicos_verificacao(eq,Some(json.clone()),Some("[]".into()),Some(60.0),profile,false,None,None,None,Some(empresa),Some(true),Some(token),None).await.is_err());
    verificacoes::atualizar_servicos_verificacao(eq,Some(json.clone()),Some("[]".into()),Some(60.0),profile,false,None,None,None,Some(empresa),Some(true),None,None).await.map_err(|e| anyhow!(e))?;
    verificacoes::atualizar_servicos_verificacao(eq,Some(json),Some("[]".into()),Some(60.0),profile,false,None,None,None,Some(empresa),Some(true),None,None).await.map_err(|e| anyhow!(e))?;
    assert_eq!(produtos::buscar_produto(produto.id).await.map_err(|e| anyhow!(e))?.quantidade_estoque,Some(3));
    assert!(verificacoes::salvar_verificacao_tecnica(VerificacaoInput { equipamento_id:eq,empresa_id:Some(empresa),..VerificacaoInput::default() }).await.is_err());
    // Reprovação total preserva o orçamento e o saldo.
    sqlx::query("UPDATE equipamentos SET status='AGUARDANDO_APROVACAO' WHERE id=$1").bind(eq).execute(&pool).await?;
    let token: String = sqlx::query_scalar("SELECT atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await?;
    equipamentos::aprovar_orcamento(AprovarOrcamentoInput { empresa_id:empresa,equipamento_id:eq,expected_updated_em:token,
        pagamento:FormaPagamento {codigo:FormaPagamentoCodigo::ACombinar,detalhe:None},servicos_aprovados:vec![],aprovado:None,resposta_esperada_id:None,motivo_divergencia:None }).await.map_err(|e| anyhow!(e))?;
    let v = verificacoes::buscar_verificacao_tecnica(eq,Some(empresa)).await.map_err(|e| anyhow!(e))?;
    assert_eq!(v.custo_total,Some(60.0));
    assert_eq!(serde_json::from_str::<Vec<serde_json::Value>>(&v.servicos_necessarios.unwrap())?.len(),1);
    assert_eq!(produtos::buscar_produto(produto.id).await.map_err(|e| anyhow!(e))?.quantidade_estoque,Some(3));
    // Portal do Cliente: a resposta só vale depois da janela e da conferência da equipe.
    sqlx::query("INSERT INTO portal_config_empresa (empresa_id, portal_enabled, respostas_enabled) VALUES ($1, TRUE, TRUE) ON CONFLICT (empresa_id) DO UPDATE SET portal_enabled = TRUE, respostas_enabled = TRUE").bind(empresa).execute(&pool).await?;
    let eq2: i32 = sqlx::query_scalar("INSERT INTO equipamentos(serial_number,marca,modelo,tipo,data_entrada,defeito_relatado,empresa_id,status) VALUES ($1,'Zebra','GC420t','Impressora','2026-09-27','Teste',$2,'VERIFICADO') RETURNING id")
        .bind(format!("D-{suffix}")).bind(empresa).fetch_one(&pool).await?;
    verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
        equipamento_id:eq2, empresa_id:Some(empresa), tecnico_nome:"Teste".into(), problema_relatado:"Teste".into(),
        servicos_necessarios:Some(services.to_string()), pecas_necessarias:Some("[]".into()), custo_total:Some(90.0), ..VerificacaoInput::default()
    }).await.map_err(|e| anyhow!(e))?;
    sqlx::query("UPDATE equipamentos SET status='AGUARDANDO_APROVACAO', valor_orcamento=90 WHERE id=$1").bind(eq2).execute(&pool).await?;
    let publicado = portal_cliente::publicar_orcamento_portal(eq2).await.map_err(|e| anyhow!(e))?;
    // Mesma linha que `portal_registrar_resposta` grava (origem PORTAL_CLIENTE, contato identificado).
    sqlx::query("INSERT INTO orcamento_respostas (empresa_id, equipamento_id, versao_id, origem, decisao, contato_nome) VALUES ($1,$2,$3,'PORTAL_CLIENTE','APROVAR','Contato Teste')")
        .bind(empresa).bind(eq2).bind(publicado.versao_id).execute(&pool).await?;
    let resposta_id: i64 = sqlx::query_scalar("SELECT MAX(id) FROM orcamento_respostas WHERE equipamento_id=$1").bind(eq2).fetch_one(&pool).await?;
    let atual = |esperada: Option<i64>, aprovado: Option<bool>, motivo: Option<String>| async move {
        let token: String = sqlx::query_scalar("SELECT atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq2).fetch_one(&db::get_pool().await.unwrap()).await.unwrap();
        equipamentos::aprovar_orcamento(AprovarOrcamentoInput { empresa_id:empresa,equipamento_id:eq2,expected_updated_em:token,
            pagamento:FormaPagamento { codigo:FormaPagamentoCodigo::Pix,detalhe:None },servicos_aprovados:if aprovado == Some(false) { vec![] } else { vec!["a".into()] },
            aprovado,resposta_esperada_id:esperada,motivo_divergencia:motivo }).await
    };
    // A lista mostra a resposta ainda não aplicada.
    assert_eq!(equipamentos::buscar_equipamento(eq2).await.map_err(|e| anyhow!(e))?.resposta_cliente.as_deref(), Some("APROVAR"));
    // Tela antiga (não viu a resposta) e janela de correção ainda aberta: nada muda.
    assert!(atual(None, Some(true), None).await.unwrap_err().contains("alterou a resposta"));
    assert!(atual(Some(resposta_id), Some(true), None).await.unwrap_err().contains("ainda pode corrigir"));
    let st: String = sqlx::query_scalar("SELECT status FROM equipamentos WHERE id=$1").bind(eq2).fetch_one(&pool).await?;
    assert_eq!(st, "AGUARDANDO_APROVACAO");
    // Passada a janela, decisão diferente da do cliente exige motivo.
    sqlx::query("ALTER TABLE orcamento_respostas DISABLE TRIGGER trg_orcamento_respostas_imutavel").execute(&pool).await?;
    sqlx::query("UPDATE orcamento_respostas SET registrada_em = registrada_em - INTERVAL '1 hour' WHERE id=$1").bind(resposta_id).execute(&pool).await?;
    sqlx::query("ALTER TABLE orcamento_respostas ENABLE TRIGGER trg_orcamento_respostas_imutavel").execute(&pool).await?;
    assert!(atual(Some(resposta_id), Some(false), None).await.unwrap_err().contains("motivo"));
    atual(Some(resposta_id), Some(true), None).await.map_err(|e| anyhow!(e))?;
    let aplicada: bool = sqlx::query_scalar("SELECT aplicada_em IS NOT NULL FROM orcamento_respostas WHERE id=$1").bind(resposta_id).fetch_one(&pool).await?;
    assert!(aplicada);
    let encerrada: Option<String> = sqlx::query_scalar("SELECT encerrada_motivo FROM orcamento_versoes WHERE equipamento_id=$1").bind(eq2).fetch_one(&pool).await?;
    assert!(encerrada.is_some());
    // Correção guiada: desfaz pagamento, serviços e baixas juntos, com decisão explícita sobre o estoque.
    produtos::registrar_movimentacao_estoque(MovimentacaoEstoqueInput { produto_id:produto.id,tipo:"ENTRADA".into(),quantidade:10,origem:"COMPRA".into(),referencia:None }).await.map_err(|e| anyhow!(e))?;
    let eq3: i32 = sqlx::query_scalar("INSERT INTO equipamentos(serial_number,marca,modelo,tipo,data_entrada,defeito_relatado,empresa_id,status) VALUES ($1,'Zebra','GC420t','Impressora','2026-09-27','Teste',$2,'VERIFICADO') RETURNING id")
        .bind(format!("C-{suffix}")).bind(empresa).fetch_one(&pool).await?;
    verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
        equipamento_id:eq3, empresa_id:Some(empresa), tecnico_nome:"Teste".into(), problema_relatado:"Teste".into(),
        servicos_necessarios:Some(services.to_string()), pecas_necessarias:Some("[]".into()), custo_total:Some(90.0), ..VerificacaoInput::default()
    }).await.map_err(|e| anyhow!(e))?;
    sqlx::query("UPDATE equipamentos SET status='AGUARDANDO_APROVACAO', valor_orcamento=90 WHERE id=$1").bind(eq3).execute(&pool).await?;
    let estoque_antes = produtos::buscar_produto(produto.id).await.map_err(|e| anyhow!(e))?.quantidade_estoque.unwrap_or(0);
    let token3: String = sqlx::query_scalar("SELECT atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq3).fetch_one(&pool).await?;
    equipamentos::aprovar_orcamento(AprovarOrcamentoInput { empresa_id:empresa,equipamento_id:eq3,expected_updated_em:token3,
        pagamento:FormaPagamento { codigo:FormaPagamentoCodigo::Pix,detalhe:None },servicos_aprovados:vec!["a".into()],aprovado:None,resposta_esperada_id:None,motivo_divergencia:None }).await.map_err(|e| anyhow!(e))?;
    assert_eq!(produtos::buscar_produto(produto.id).await.map_err(|e| anyhow!(e))?.quantidade_estoque,Some(estoque_antes - 3));
    let analise = orcamento_correcao::analisar_correcao_decisao(eq3).await.map_err(|e| anyhow!(e))?;
    assert!(analise.pode_corrigir && analise.exige_decisao_estoque);
    assert_eq!(analise.total_baixado, 3);
    assert_eq!(analise.pagamento_codigo.as_deref(), Some("PIX"));
    let token3: String = sqlx::query_scalar("SELECT atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq3).fetch_one(&pool).await?;
    let corrigir = |devolver: bool, motivo: &str, token: String| orcamento_correcao::corrigir_decisao_orcamento(orcamento_correcao::CorrigirDecisaoInput {
        equipamento_id: eq3, expected_updated_em: token, motivo: motivo.into(), devolver_estoque: devolver,
        modo: orcamento_correcao::ModoCorrecao::RestaurarOriginal });
    assert!(corrigir(true, "oi", token3.clone()).await.is_err());
    assert!(corrigir(false, "Cliente ligou desistindo", token3.clone()).await.unwrap_err().contains("baixadas"));
    assert!(corrigir(true, "Cliente ligou desistindo", "2000-01-01T00:00:00Z".into()).await.is_err());
    assert_eq!(produtos::buscar_produto(produto.id).await.map_err(|e| anyhow!(e))?.quantidade_estoque,Some(estoque_antes - 3));
    let reaberto = corrigir(true, "Cliente ligou desistindo", token3).await.map_err(|e| anyhow!(e))?;
    assert_eq!(reaberto.status.as_deref(), Some("AGUARDANDO_APROVACAO"));
    assert_eq!(reaberto.valor_orcamento, Some(90.0));
    assert_eq!(produtos::buscar_produto(produto.id).await.map_err(|e| anyhow!(e))?.quantidade_estoque,Some(estoque_antes));
    let v = verificacoes::buscar_verificacao_tecnica(eq3,Some(empresa)).await.map_err(|e| anyhow!(e))?;
    assert_eq!(v.custo_total,Some(90.0));
    assert_eq!(serde_json::from_str::<Vec<serde_json::Value>>(&v.servicos_necessarios.unwrap())?.len(),2);
    assert!(v.forma_pagamento_codigo.is_none());
    let baixado: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(quantidade_baixada),0) FROM orcamento_consumos WHERE empresa_id=$1 AND verificacao_id=$2").bind(empresa).bind(v.id).fetch_one(&pool).await?;
    assert_eq!(baixado, 0);
    let registros: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orcamento_correcoes WHERE equipamento_id=$1 AND estoque_devolvido").bind(eq3).fetch_one(&pool).await?;
    assert_eq!(registros, 1);
    // Já aguardando decisão, ou com o serviço em andamento, não há o que corrigir automaticamente.
    let token3: String = sqlx::query_scalar("SELECT atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq3).fetch_one(&pool).await?;
    assert!(corrigir(false, "Tentativa repetida", token3).await.is_err());
    sqlx::query("UPDATE equipamentos SET status='EM_MANUTENCAO' WHERE id=$1").bind(eq3).execute(&pool).await?;
    let em_servico = orcamento_correcao::analisar_correcao_decisao(eq3).await.map_err(|e| anyhow!(e))?;
    assert!(!em_servico.pode_corrigir && em_servico.bloqueios[0].contains("EM_MANUTENCAO"));

    // Orçamento ajustado ANTES da aprovação não bloqueia; ajustado DEPOIS oferece manter o atual.
    let eq4: i32 = sqlx::query_scalar("INSERT INTO equipamentos(serial_number,marca,modelo,tipo,data_entrada,defeito_relatado,empresa_id,status) VALUES ($1,'Zebra','GC420t','Impressora','2026-09-27','Teste',$2,'VERIFICADO') RETURNING id")
        .bind(format!("F-{suffix}")).bind(empresa).fetch_one(&pool).await?;
    verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
        equipamento_id:eq4, empresa_id:Some(empresa), tecnico_nome:"Teste".into(), problema_relatado:"Teste".into(),
        servicos_necessarios:Some(services.to_string()), pecas_necessarias:Some("[]".into()), custo_total:Some(90.0), ..VerificacaoInput::default()
    }).await.map_err(|e| anyhow!(e))?;
    sqlx::query("UPDATE equipamentos SET status='AGUARDANDO_APROVACAO', valor_orcamento=90 WHERE id=$1").bind(eq4).execute(&pool).await?;
    let publicado4 = portal_cliente::publicar_orcamento_portal(eq4).await.map_err(|e| anyhow!(e))?;
    sqlx::query("INSERT INTO orcamento_respostas (empresa_id, equipamento_id, versao_id, origem, decisao, contato_nome) VALUES ($1,$2,$3,'PORTAL_CLIENTE','APROVAR','Contato Teste')")
        .bind(empresa).bind(eq4).bind(publicado4.versao_id).execute(&pool).await?;
    let resposta4: i64 = sqlx::query_scalar("SELECT MAX(id) FROM orcamento_respostas WHERE equipamento_id=$1").bind(eq4).fetch_one(&pool).await?;
    sqlx::query("ALTER TABLE orcamento_respostas DISABLE TRIGGER trg_orcamento_respostas_imutavel").execute(&pool).await?;
    sqlx::query("UPDATE orcamento_respostas SET registrada_em = registrada_em - INTERVAL '1 hour' WHERE id=$1").bind(resposta4).execute(&pool).await?;
    sqlx::query("ALTER TABLE orcamento_respostas ENABLE TRIGGER trg_orcamento_respostas_imutavel").execute(&pool).await?;
    // Ajuste dentro da mesma versão (mesmos valores), ainda aguardando aprovação: grava adjusted_at.
    verificacoes::atualizar_servicos_verificacao(eq4,Some(services.to_string()),Some("[]".into()),Some(90.0),profile,false,None,None,None,Some(empresa),None,None,None).await.map_err(|e| anyhow!(e))?;
    let ajustada_em: bool = sqlx::query_scalar("SELECT adjusted_at IS NOT NULL FROM verificacoes WHERE equipamento_id=$1").bind(eq4).fetch_one(&pool).await?;
    assert!(ajustada_em, "o ajuste antes da aprovação deve gravar adjusted_at");
    let estoque4 = produtos::buscar_produto(produto.id).await.map_err(|e| anyhow!(e))?.quantidade_estoque.unwrap_or(0);
    let token4: String = sqlx::query_scalar("SELECT atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq4).fetch_one(&pool).await?;
    equipamentos::aprovar_orcamento(AprovarOrcamentoInput { empresa_id:empresa,equipamento_id:eq4,expected_updated_em:token4,
        pagamento:FormaPagamento { codigo:FormaPagamentoCodigo::ACombinar,detalhe:None },servicos_aprovados:vec!["a".into()],
        aprovado:Some(true),resposta_esperada_id:Some(resposta4),motivo_divergencia:None }).await.map_err(|e| anyhow!(e))?;
    let corrigir4 = |modo: orcamento_correcao::ModoCorrecao, motivo: &str, token: String| orcamento_correcao::corrigir_decisao_orcamento(orcamento_correcao::CorrigirDecisaoInput {
        equipamento_id: eq4, expected_updated_em: token, motivo: motivo.into(), devolver_estoque: true, modo });
    let token_atual = || async { sqlx::query_scalar::<_, String>("SELECT atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq4).fetch_one(&db::get_pool().await.unwrap()).await.unwrap() };
    let antes = orcamento_correcao::analisar_correcao_decisao(eq4).await.map_err(|e| anyhow!(e))?;
    assert!(antes.pode_corrigir && !antes.ajustado_apos_decisao && antes.permite_restaurar && !antes.permite_manter, "ajuste anterior à aprovação não é ajuste posterior");
    assert!(corrigir4(orcamento_correcao::ModoCorrecao::ManterAtual, "Cliente desistiu", token_atual().await).await.is_err());
    // Ajuste real depois da aprovação (peças 3 para 4, total 60).
    let mut ajustado = services.as_array().unwrap()[..1].to_vec();
    ajustado[0]["pecas"][0]["quantidade"] = 4.into();
    verificacoes::atualizar_servicos_verificacao(eq4,Some(serde_json::to_string(&ajustado)?),Some("[]".into()),Some(60.0),profile,false,None,None,None,Some(empresa),Some(true),None,None).await.map_err(|e| anyhow!(e))?;
    let depois = orcamento_correcao::analisar_correcao_decisao(eq4).await.map_err(|e| anyhow!(e))?;
    assert!(depois.pode_corrigir && depois.ajustado_apos_decisao && depois.permite_restaurar && depois.permite_manter);
    assert_eq!(depois.pagamento_codigo.as_deref(), Some("A_COMBINAR"));
    let mantido = corrigir4(orcamento_correcao::ModoCorrecao::ManterAtual, "Cliente quer rever o valor", token_atual().await).await.map_err(|e| anyhow!(e))?;
    assert_eq!(mantido.status.as_deref(), Some("AGUARDANDO_APROVACAO"));
    assert_eq!(mantido.valor_orcamento, Some(60.0));
    let v4 = verificacoes::buscar_verificacao_tecnica(eq4,Some(empresa)).await.map_err(|e| anyhow!(e))?;
    assert_eq!(v4.custo_total, Some(60.0));
    assert!(v4.forma_pagamento_codigo.is_none());
    let servicos4 = serde_json::from_str::<Vec<serde_json::Value>>(&v4.servicos_necessarios.unwrap())?;
    assert_eq!(servicos4.len(), 1);
    assert_eq!(servicos4[0]["pecas"][0]["quantidade"], 4);
    assert_eq!(produtos::buscar_produto(produto.id).await.map_err(|e| anyhow!(e))?.quantidade_estoque, Some(estoque4));
    let decisoes4: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orcamento_servicos_decisao WHERE verificacao_id=$1").bind(v4.id).fetch_one(&pool).await?;
    assert_eq!(decisoes4, 0);
    let registro4: String = sqlx::query_scalar("SELECT motivo FROM orcamento_correcoes WHERE equipamento_id=$1").bind(eq4).fetch_one(&pool).await?;
    assert!(registro4.starts_with("[manteve o orçamento atual]"));
    // A resposta antiga deixa de valer no portal: a última resposta passa a ser DESFEITA pela equipe.
    let ultima: (String, String) = sqlx::query_as("SELECT decisao, origem FROM orcamento_respostas WHERE equipamento_id=$1 ORDER BY id DESC LIMIT 1").bind(eq4).fetch_one(&pool).await?;
    assert_eq!(ultima, ("DESFEITA".to_string(), "EQUIPE".to_string()));
    let total_respostas: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orcamento_respostas WHERE equipamento_id=$1").bind(eq4).fetch_one(&pool).await?;
    assert_eq!(total_respostas, 2);
    let estado_portal: Option<String> = sqlx::query_scalar("SELECT public.autoos_portal_estado_resposta(r.origem, r.decisao, r.registrada_em, r.aplicada_em, r.efetivacao_falhou_em, TRUE) FROM orcamento_respostas r WHERE equipamento_id=$1 ORDER BY id DESC LIMIT 1").bind(eq4).fetch_one(&pool).await?;
    assert!(estado_portal.is_none());

    // ─── T7: alterar o orçamento depois de publicado/aprovado e portal automático ───────────────
    produtos::registrar_movimentacao_estoque(MovimentacaoEstoqueInput { produto_id:produto.id,tipo:"ENTRADA".into(),quantidade:40,origem:"COMPRA".into(),referencia:None }).await.map_err(|e| anyhow!(e))?;
    let cliente: i32 = sqlx::query_scalar("INSERT INTO clientes (empresa_id, nome, tipo_pessoa, documento) VALUES ($1,'Cliente T7','PJ','11222333000181') RETURNING id")
        .bind(empresa).fetch_one(&pool).await?;
    let contato: i32 = sqlx::query_scalar("INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, telefone, portal_acesso) VALUES ($1,$2,'Ana T7','71988887777','DECIDIR') RETURNING id")
        .bind(empresa).bind(cliente).fetch_one(&pool).await?;
    let hash = "7".repeat(64);
    sqlx::query("INSERT INTO portal_sessoes (token_hash, empresa_id, cliente_id, contato_id, expira_em, verificada_em, metodo) VALUES ($1,$2,$3,$4, now() + INTERVAL '1 hour', now(), 'SENHA')")
        .bind(&hash).bind(empresa).bind(cliente).bind(contato).execute(&pool).await?;
    let ajustar = |eq: i32, total: f64, cliente_aprovou: Option<bool>, opcoes: Option<verificacoes::OpcoesAjusteOrcamento>| {
        let mut itens = services.as_array().unwrap().clone();
        itens[0]["valor"] = total.into();
        let json = serde_json::to_string(&itens).unwrap();
        async move { verificacoes::atualizar_servicos_verificacao(eq, Some(json), Some("[]".into()), Some(total), profile, false, None, None, None, Some(empresa), cliente_aprovou, None, opcoes).await }
    };
    let versoes = |eq: i32| async move { sqlx::query_as::<_, (i32, bool, Option<String>)>("SELECT versao, encerrada_em IS NULL, encerrada_motivo FROM orcamento_versoes WHERE equipamento_id=$1 ORDER BY versao")
        .bind(eq).fetch_all(&db::get_pool().await.unwrap()).await.unwrap() };
    let aprovar_com_resposta_do_portal = |eq: i32| async move {
        let pool = db::get_pool().await.unwrap();
        let publicado = portal_cliente::publicar_orcamento_portal(eq).await.unwrap();
        sqlx::query("INSERT INTO orcamento_respostas (empresa_id, equipamento_id, versao_id, origem, decisao, contato_nome) VALUES ($1,$2,$3,'PORTAL_CLIENTE','APROVAR','Ana T7')")
            .bind(empresa).bind(eq).bind(publicado.versao_id).execute(&pool).await.unwrap();
        let resposta: i64 = sqlx::query_scalar("SELECT MAX(id) FROM orcamento_respostas WHERE equipamento_id=$1").bind(eq).fetch_one(&pool).await.unwrap();
        sqlx::query("ALTER TABLE orcamento_respostas DISABLE TRIGGER trg_orcamento_respostas_imutavel").execute(&pool).await.unwrap();
        sqlx::query("UPDATE orcamento_respostas SET registrada_em = registrada_em - INTERVAL '1 hour' WHERE id=$1").bind(resposta).execute(&pool).await.unwrap();
        sqlx::query("ALTER TABLE orcamento_respostas ENABLE TRIGGER trg_orcamento_respostas_imutavel").execute(&pool).await.unwrap();
        let token: String = sqlx::query_scalar("SELECT atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await.unwrap();
        equipamentos::aprovar_orcamento(AprovarOrcamentoInput { empresa_id:empresa,equipamento_id:eq,expected_updated_em:token,
            pagamento:FormaPagamento { codigo:FormaPagamentoCodigo::Pix,detalhe:None },servicos_aprovados:vec!["a".into()],
            aprovado:Some(true),resposta_esperada_id:Some(resposta),motivo_divergencia:None }).await.map_err(|e| anyhow!(e))
    };
    let opcoes = |modo: verificacoes::ModoAjusteAprovado, devolver: bool| Some(verificacoes::OpcoesAjusteOrcamento { modo_aprovado: Some(modo), devolver_estoque: devolver, confirmar_resposta_pendente: false });

    // (a) Aprovado, ajuste SEM nova aprovação: continua aprovado, o valor novo aparece no portal.
    let eq_a = novo_orcamento(&pool, empresa, cliente, &suffix, "TA", &services).await?;
    aprovar_com_resposta_do_portal(eq_a).await?;
    let valor_aprovado: f64 = sqlx::query_scalar("SELECT valor_orcamento::FLOAT8 FROM equipamentos WHERE id=$1").bind(eq_a).fetch_one(&pool).await?;
    assert_eq!(valor_portal(&pool, &hash, eq_a).await?, valor_aprovado);
    assert!(ajustar(eq_a, 70.0, Some(false), opcoes(verificacoes::ModoAjusteAprovado::SemNovaAprovacao, false)).await.is_err(), "ajuste aprovado exige a confirmação do cliente");
    let r = ajustar(eq_a, 70.0, Some(true), opcoes(verificacoes::ModoAjusteAprovado::SemNovaAprovacao, false)).await.map_err(|e| anyhow!(e))?;
    assert_eq!(r.portal.acao, "VALOR_ATUALIZADO");
    assert!(r.portal.mensagem.as_deref().unwrap_or("").contains("sem nova aprovação"));
    let (status_a, valor_a): (String, f64) = sqlx::query_as("SELECT status, valor_orcamento::FLOAT8 FROM equipamentos WHERE id=$1").bind(eq_a).fetch_one(&pool).await?;
    assert_eq!((status_a.as_str(), valor_a), ("APROVADO", 70.0));
    assert_eq!(valor_portal(&pool, &hash, eq_a).await?, 70.0, "o portal mostra o valor novo sem republicar");
    tokio::time::sleep(std::time::Duration::from_millis(500)).await; // auditoria é gravada em segundo plano
    let modo_auditado: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM security_audit_log WHERE event_type='BUDGET_ADJUSTED' AND details LIKE $1")
        .bind(format!("equipamento_id={eq_a};%modo=SEM_NOVA_APROVACAO%")).fetch_one(&pool).await?;
    assert_eq!(modo_auditado, 1, "a auditoria registra o modo escolhido");

    // (b) Aprovado, PEDIR nova aprovação: volta a aguardar, versão nova aberta, resposta antiga desfeita.
    let eq_b = novo_orcamento(&pool, empresa, cliente, &suffix, "TB", &services).await?;
    aprovar_com_resposta_do_portal(eq_b).await?;
    let estoque_b = produtos::buscar_produto(produto.id).await.map_err(|e| anyhow!(e))?.quantidade_estoque.unwrap_or(0);
    let analise_b = orcamento_decisao::analisar_ajuste_orcamento(eq_b).await.map_err(|e| anyhow!(e))?;
    assert!(analise_b.pode_pedir_nova_aprovacao && analise_b.exige_decisao_estoque && analise_b.total_baixado == 3 && analise_b.ja_publicado);
    let (token_b, valor_b0): (String, f64) = sqlx::query_as("SELECT atualizado_em::TEXT, valor_orcamento::FLOAT8 FROM equipamentos WHERE id=$1").bind(eq_b).fetch_one(&pool).await?;
    // Sem confirmar a devolução das peças, nada muda (a transação inteira é desfeita).
    let erro_b = ajustar(eq_b, 65.0, None, opcoes(verificacoes::ModoAjusteAprovado::NovaAprovacao, false)).await.err().unwrap();
    assert!(erro_b.contains("baixadas"), "{erro_b}");
    let (status_b, valor_b, token_b2): (String, f64, String) = sqlx::query_as("SELECT status, valor_orcamento::FLOAT8, atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq_b).fetch_one(&pool).await?;
    assert_eq!((status_b.as_str(), valor_b, token_b2.as_str()), ("APROVADO", valor_b0, token_b.as_str()));
    let r = ajustar(eq_b, 65.0, None, opcoes(verificacoes::ModoAjusteAprovado::NovaAprovacao, true)).await.map_err(|e| anyhow!(e))?;
    assert_eq!(r.portal.acao, "NOVA_APROVACAO_PUBLICADA");
    assert_eq!(r.portal.versao, Some(2));
    let (status_b, valor_b): (String, f64) = sqlx::query_as("SELECT status, valor_orcamento::FLOAT8 FROM equipamentos WHERE id=$1").bind(eq_b).fetch_one(&pool).await?;
    assert_eq!((status_b.as_str(), valor_b), ("AGUARDANDO_APROVACAO", 65.0));
    let vs = versoes(eq_b).await;
    assert_eq!(vs.len(), 2);
    assert!(!vs[0].1 && vs[1].1, "a versão 2 está aberta e a 1 encerrada: {vs:?}");
    let valor_v2: f64 = sqlx::query_scalar("SELECT valor_total::FLOAT8 FROM orcamento_versoes WHERE equipamento_id=$1 AND versao=2").bind(eq_b).fetch_one(&pool).await?;
    assert_eq!(valor_v2, 65.0);
    let ultima_b: (String, String) = sqlx::query_as("SELECT r.decisao, r.origem FROM orcamento_respostas r JOIN orcamento_versoes v ON v.id=r.versao_id WHERE r.equipamento_id=$1 ORDER BY v.versao DESC, r.id DESC LIMIT 1").bind(eq_b).fetch_one(&pool).await?;
    assert_eq!(ultima_b, ("DESFEITA".to_string(), "EQUIPE".to_string()));
    assert_eq!(produtos::buscar_produto(produto.id).await.map_err(|e| anyhow!(e))?.quantidade_estoque, Some(estoque_b + 3), "peças baixadas voltaram ao estoque");
    let sem_resposta_v2: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orcamento_respostas r JOIN orcamento_versoes v ON v.id=r.versao_id WHERE v.equipamento_id=$1 AND v.versao=2").bind(eq_b).fetch_one(&pool).await?;
    assert_eq!(sem_resposta_v2, 0, "o cliente vê a versão nova para responder");
    assert_eq!(valor_portal(&pool, &hash, eq_b).await?, 65.0);

    // (c) Aguardando COM versão publicada: alterar republica sozinho; sem mudança não cria versão.
    let eq_c = novo_orcamento(&pool, empresa, cliente, &suffix, "TC", &services).await?;
    portal_cliente::publicar_orcamento_portal(eq_c).await.map_err(|e| anyhow!(e))?;
    let r = ajustar(eq_c, 80.0, None, None).await.map_err(|e| anyhow!(e))?;
    assert_eq!((r.portal.acao.as_str(), r.portal.versao), ("VERSAO_PUBLICADA", Some(2)));
    assert_eq!(r.portal.mensagem.as_deref(), Some("Portal atualizado: versão 2 publicada."));
    let vs = versoes(eq_c).await;
    assert_eq!(vs.len(), 2);
    assert!(!vs[0].1 && vs[0].2.as_deref() == Some("ORCAMENTO_ALTERADO") && vs[1].1);
    let repetido = ajustar(eq_c, 80.0, None, None).await.map_err(|e| anyhow!(e))?;
    assert_eq!(repetido.portal.acao, "NENHUMA");
    assert_eq!(versoes(eq_c).await.len(), 2);
    assert_eq!(valor_portal(&pool, &hash, eq_c).await?, 80.0);

    // (d) Aguardando que NUNCA foi ao portal: alterar não publica nada.
    let eq_d = novo_orcamento(&pool, empresa, cliente, &suffix, "TD", &services).await?;
    let r = ajustar(eq_d, 75.0, None, None).await.map_err(|e| anyhow!(e))?;
    assert_eq!(r.portal.acao, "NENHUMA");
    assert!(versoes(eq_d).await.is_empty());

    // (e) Resposta do cliente ainda pendente: pede confirmação e, confirmada, desfaz a resposta.
    let eq_e = novo_orcamento(&pool, empresa, cliente, &suffix, "TE", &services).await?;
    let publicado_e = portal_cliente::publicar_orcamento_portal(eq_e).await.map_err(|e| anyhow!(e))?;
    sqlx::query("INSERT INTO orcamento_respostas (empresa_id, equipamento_id, versao_id, origem, decisao, contato_nome) VALUES ($1,$2,$3,'PORTAL_CLIENTE','APROVAR','Ana T7')")
        .bind(empresa).bind(eq_e).bind(publicado_e.versao_id).execute(&pool).await?;
    let analise_e = orcamento_decisao::analisar_ajuste_orcamento(eq_e).await.map_err(|e| anyhow!(e))?;
    assert_eq!(analise_e.resposta_pendente.as_ref().map(|p| p.decisao.as_str()), Some("APROVAR"));
    let erro_e = ajustar(eq_e, 60.0, None, None).await.err().unwrap();
    assert!(erro_e.contains("já respondeu"), "{erro_e}");
    let vs = versoes(eq_e).await;
    assert!(vs.len() == 1 && vs[0].1, "nada foi alterado sem a confirmação: {vs:?}");
    let valor_e: f64 = sqlx::query_scalar("SELECT valor_orcamento::FLOAT8 FROM equipamentos WHERE id=$1").bind(eq_e).fetch_one(&pool).await?;
    assert_eq!(valor_e, 90.0);
    let confirmar = Some(verificacoes::OpcoesAjusteOrcamento { confirmar_resposta_pendente: true, ..Default::default() });
    let r = ajustar(eq_e, 60.0, None, confirmar).await.map_err(|e| anyhow!(e))?;
    assert_eq!((r.portal.acao.as_str(), r.portal.versao), ("VERSAO_PUBLICADA", Some(2)));
    let ultima_v1: String = sqlx::query_scalar("SELECT r.decisao FROM orcamento_respostas r JOIN orcamento_versoes v ON v.id=r.versao_id WHERE v.equipamento_id=$1 AND v.versao=1 ORDER BY r.id DESC LIMIT 1").bind(eq_e).fetch_one(&pool).await?;
    assert_eq!(ultima_v1, "DESFEITA");
    let depois_e = orcamento_decisao::analisar_ajuste_orcamento(eq_e).await.map_err(|e| anyhow!(e))?;
    assert!(depois_e.resposta_pendente.is_none() && depois_e.versao_aberta == Some(2));

    println!("OK (T7 incluído: ajuste de orçamento aprovado/aguardando e portal automático): catálogo, tenant, aprovação parcial, repetição, reposição, pendências, ajuste confirmado, concorrência otimista, reprovação conferência da resposta do cliente e correção guiada da decisão.");
    Ok(())
}

/// Equipamento aguardando aprovação (valor 90), com verificação, ligado ao cliente do portal.
async fn novo_orcamento(pool: &sqlx::PgPool, empresa: i32, cliente: i32, suffix: &str, tag: &str, services: &serde_json::Value) -> Result<i32> {
    let eq: i32 = sqlx::query_scalar("INSERT INTO equipamentos(serial_number,marca,modelo,tipo,data_entrada,defeito_relatado,empresa_id,cliente_id,status) VALUES ($1,'Zebra','GC420t','Impressora','2026-09-27','Teste',$2,$3,'VERIFICADO') RETURNING id")
        .bind(format!("{tag}-{suffix}")).bind(empresa).bind(cliente).fetch_one(pool).await?;
    verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
        equipamento_id:eq, empresa_id:Some(empresa), tecnico_nome:"Teste".into(), problema_relatado:"Teste".into(),
        servicos_necessarios:Some(services.to_string()), pecas_necessarias:Some("[]".into()), custo_total:Some(90.0), ..VerificacaoInput::default()
    }).await.map_err(|e| anyhow!(e))?;
    sqlx::query("UPDATE equipamentos SET status='AGUARDANDO_APROVACAO', valor_orcamento=90 WHERE id=$1").bind(eq).execute(pool).await?;
    Ok(eq)
}

/// Valor que o cliente vê no portal (`valores.atual`) para o atendimento.
async fn valor_portal(pool: &sqlx::PgPool, hash: &str, eq: i32) -> Result<f64> {
    Ok(sqlx::query_scalar("SELECT (portal_detalhe_atendimento($1, $2)->'valores'->>'atual')::FLOAT8").bind(hash).bind(eq).fetch_one(pool).await?)
}
