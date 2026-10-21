//! Integração real. Executar somente em autoos_stock_test* com migrations aplicadas.
//! Perfil TECNICO (STOCK_CONTROL + PREPARE_QUOTES): prepara e envia o orçamento, mas não decide nem altera depois.
#[path = "../commands/mod.rs"] mod commands;
#[path = "../db.rs"] mod db;
#[path = "../test_support/memory_keyring.rs"] mod memory_keyring;
use commands::{auth, equipamentos, portal_cliente, verificacoes};
use commands::types::*;
use anyhow::{Result, anyhow};

const SEM_PERMISSAO: &str = "não possui permissão necessária";

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
        .bind(format!("envio-{suffix}@example.test")).fetch_one(&pool).await?;
    let profile: i32 = sqlx::query_scalar("INSERT INTO security_profiles(nome,role,permissions,empresa_id,ativo,is_default) VALUES ($1,'TECNICO',$2,$3,true,false) RETURNING id")
        .bind(format!("Tecnico {suffix}")).bind(serde_json::to_string(&[auth::PERMISSION_STOCK_CONTROL, auth::PERMISSION_PREPARE_QUOTES])?).bind(empresa).fetch_one(&pool).await?;
    auth::store_profile_pin(profile, "1357").map_err(|e| anyhow!(e))?;
    auth::set_active_security_profile(profile, "1357".into(), Some("1357".into())).await.map_err(|e| anyhow!(e))?;
    auth::unlock_sensitive_access("1357".into()).await.map_err(|e| anyhow!(e))?;

    sqlx::query("INSERT INTO portal_config_empresa (empresa_id, portal_enabled, respostas_enabled) VALUES ($1, TRUE, TRUE) ON CONFLICT (empresa_id) DO UPDATE SET portal_enabled = TRUE, respostas_enabled = TRUE").bind(empresa).execute(&pool).await?;
    let documento = format!("{:0>14}", &suffix[suffix.len().saturating_sub(14)..]);
    let cliente: i32 = sqlx::query_scalar("INSERT INTO clientes (empresa_id, nome, tipo_pessoa, documento) VALUES ($1,'Cliente Envio','PJ',$2) RETURNING id")
        .bind(empresa).bind(&documento).fetch_one(&pool).await?;
    let contato: i32 = sqlx::query_scalar("INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, telefone, portal_acesso) VALUES ($1,$2,'Ana Envio','71988887777','DECIDIR') RETURNING id")
        .bind(empresa).bind(cliente).fetch_one(&pool).await?;
    let eq: i32 = sqlx::query_scalar("INSERT INTO equipamentos(serial_number,marca,modelo,tipo,data_entrada,defeito_relatado,empresa_id,cliente_id,status) VALUES ($1,'Zebra','GC420t','Impressora','2026-09-27','Teste',$2,$3,'VERIFICADO') RETURNING id")
        .bind(format!("V-{suffix}")).bind(empresa).bind(cliente).fetch_one(&pool).await?;
    let token = |eq: i32| { let pool = pool.clone(); async move {
        sqlx::query_scalar::<_, String>("SELECT atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await
    } };

    // CONSEGUE: verificação com custo (financeiro via PREPARE_QUOTES).
    let services = serde_json::json!([{"id":"a","descricao":"Troca cabeça","valor":90,"pecas":[]}]);
    verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
        equipamento_id:eq, empresa_id:Some(empresa), tecnico_nome:"Teste".into(), problema_relatado:"Teste".into(),
        servicos_necessarios:Some(services.to_string()), pecas_necessarias:Some("[]".into()), custo_total:Some(90.0), ..VerificacaoInput::default()
    }).await.map_err(|e| anyhow!("salvar_verificacao_tecnica: {e}"))?;

    // CONSEGUE: VERIFICADO -> AGUARDANDO_APROVACAO com valor e prazo.
    let enviado = equipamentos::atualizar_status_equipamento(eq, "AGUARDANDO_APROVACAO".into(), Some(90.0), Some("2026-12-31".into()), None, Some(token(eq).await?), None)
        .await.map_err(|e| anyhow!("atualizar_status_equipamento: {e}"))?;
    assert_eq!(enviado.status.as_deref(), Some("AGUARDANDO_APROVACAO"));
    assert_eq!(enviado.valor_orcamento, Some(90.0));

    // CONSEGUE: publicar no portal.
    let publicado = portal_cliente::publicar_orcamento_portal(eq).await.map_err(|e| anyhow!("publicar_orcamento_portal: {e}"))?;
    assert!(publicado.versao_id > 0);

    // NÃO CONSEGUE: aprovar (FINANCIAL_ACTIONS).
    let erro = equipamentos::aprovar_orcamento(AprovarOrcamentoInput { empresa_id:empresa,equipamento_id:eq,expected_updated_em:token(eq).await?,
        pagamento:FormaPagamento { codigo:FormaPagamentoCodigo::Pix,detalhe:None },servicos_aprovados:vec!["a".into()],aprovado:None,resposta_esperada_id:None,motivo_divergencia:None })
        .await.unwrap_err();
    assert!(erro.contains(SEM_PERMISSAO), "{erro}");

    // NÃO CONSEGUE: reprovar.
    let erro = equipamentos::atualizar_status_equipamento(eq, "REPROVADO".into(), None, None, None, Some(token(eq).await?), None).await.unwrap_err();
    assert!(erro.contains(SEM_PERMISSAO), "{erro}");
    let st: String = sqlx::query_scalar("SELECT status FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await?;
    assert_eq!(st, "AGUARDANDO_APROVACAO");

    // NÃO CONSEGUE: definir senha de contato que decide orçamento.
    let erro = portal_cliente::definir_senha_portal_contato(contato, Some("Senha1234".into())).await.unwrap_err();
    assert!(erro.contains(SEM_PERMISSAO), "{erro}");

    // NÃO CONSEGUE: alterar serviços de OS já decidida (APROVADO).
    sqlx::query("UPDATE equipamentos SET status='APROVADO' WHERE id=$1").bind(eq).execute(&pool).await?;
    let erro = verificacoes::atualizar_servicos_verificacao(eq, Some(services.to_string()), Some("[]".into()), Some(90.0), profile, false, None, None, None, Some(empresa), None, None, None)
        .await.err().unwrap();
    assert!(erro.contains("Este perfil só altera orçamentos ainda não decididos."), "{erro}");

    println!("OK: perfil TECNICO prepara, envia e publica o orçamento, mas não aprova, reprova, altera OS decidida nem define senha do portal.");
    Ok(())
}
