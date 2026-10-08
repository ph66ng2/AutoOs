//! Integração real. Executar somente em autoos_stock_test* com migrations aplicadas.
#[path = "../commands/mod.rs"] mod commands;
#[path = "../db.rs"] mod db;
#[path = "../test_support/memory_keyring.rs"] mod memory_keyring;
use commands::{auth, equipamentos, verificacoes, orcamento_estoque, produtos, servicos};
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
        .bind(format!("Stock {suffix}")).bind(serde_json::to_string(&[auth::PERMISSION_STOCK_CONTROL, auth::PERMISSION_FINANCIAL_ACTIONS])?).bind(empresa).fetch_one(&pool).await?;
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
        pagamento:FormaPagamento { codigo:FormaPagamentoCodigo::Pix,detalhe:None },servicos_aprovados:vec!["a".into()], aprovar_sem_servicos:false };
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
    let token_ajuste: String = sqlx::query_scalar("SELECT atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await?;
    verificacoes::atualizar_servicos_verificacao(eq,Some(json.clone()),Some("[]".into()),Some(60.0),profile,false,None,None,None,Some(empresa),Some(true),Some(token_ajuste)).await.map_err(|e| anyhow!(e))?;
    let token_reajuste: String = sqlx::query_scalar("SELECT atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await?;
    verificacoes::atualizar_servicos_verificacao(eq,Some(json),Some("[]".into()),Some(60.0),profile,false,None,None,None,Some(empresa),Some(true),Some(token_reajuste)).await.map_err(|e| anyhow!(e))?;
    assert_eq!(produtos::buscar_produto(produto.id).await.map_err(|e| anyhow!(e))?.quantidade_estoque,Some(3));
    assert!(verificacoes::salvar_verificacao_tecnica(VerificacaoInput { equipamento_id:eq,empresa_id:Some(empresa),..VerificacaoInput::default() }).await.is_err());
    // Reprovação total preserva o orçamento e o saldo.
    sqlx::query("UPDATE equipamentos SET status='AGUARDANDO_APROVACAO' WHERE id=$1").bind(eq).execute(&pool).await?;
    let token: String = sqlx::query_scalar("SELECT atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await?;
    equipamentos::aprovar_orcamento(AprovarOrcamentoInput { empresa_id:empresa,equipamento_id:eq,expected_updated_em:token,
        pagamento:FormaPagamento {codigo:FormaPagamentoCodigo::ACombinar,detalhe:None},servicos_aprovados:vec![], aprovar_sem_servicos:false }).await.map_err(|e| anyhow!(e))?;
    let v = verificacoes::buscar_verificacao_tecnica(eq,Some(empresa)).await.map_err(|e| anyhow!(e))?;
    assert_eq!(v.custo_total,Some(60.0));
    assert_eq!(serde_json::from_str::<Vec<serde_json::Value>>(&v.servicos_necessarios.unwrap())?.len(),1);
    assert_eq!(produtos::buscar_produto(produto.id).await.map_err(|e| anyhow!(e))?.quantidade_estoque,Some(3));
    println!("OK: catálogo, tenant, aprovação parcial, repetição, reposição, pendências, ajuste confirmado, concorrência otimista e reprovação.");
    Ok(())
}
