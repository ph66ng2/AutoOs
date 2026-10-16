//! Integração real. Executar somente em autoos_stock_test* com migrations aplicadas.
#[path = "../commands/mod.rs"] mod commands;
#[path = "../db.rs"] mod db;
#[path = "../test_support/memory_keyring.rs"] mod memory_keyring;
use commands::{auth, equipamentos, orcamento_correcao, portal_cliente, verificacoes, orcamento_estoque, produtos, servicos};
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
    assert!(verificacoes::atualizar_servicos_verificacao(eq,Some(json.clone()),Some("[]".into()),Some(60.0),profile,false,None,None,None,Some(empresa),Some(false),None).await.is_err());
    assert!(verificacoes::atualizar_servicos_verificacao(eq,Some(json.clone()),Some("[]".into()),Some(60.0),profile,false,None,None,None,Some(empresa),Some(true),Some(token)).await.is_err());
    verificacoes::atualizar_servicos_verificacao(eq,Some(json.clone()),Some("[]".into()),Some(60.0),profile,false,None,None,None,Some(empresa),Some(true),None).await.map_err(|e| anyhow!(e))?;
    verificacoes::atualizar_servicos_verificacao(eq,Some(json),Some("[]".into()),Some(60.0),profile,false,None,None,None,Some(empresa),Some(true),None).await.map_err(|e| anyhow!(e))?;
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
        equipamento_id: eq3, expected_updated_em: token, motivo: motivo.into(), devolver_estoque: devolver });
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
    assert!(!em_servico.pode_corrigir && em_servico.bloqueios[0].contains("atendimento humano"));
    println!("OK: catálogo, tenant, aprovação parcial, repetição, reposição, pendências, ajuste confirmado, concorrência otimista, reprovação conferência da resposta do cliente e correção guiada da decisão.");
    Ok(())
}
