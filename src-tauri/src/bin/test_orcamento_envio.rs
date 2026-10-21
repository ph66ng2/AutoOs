//! Integração real. Executar somente em autoos_stock_test* com migrations aplicadas.
//! Perfil TECNICO (STOCK_CONTROL + PREPARE_QUOTES): prepara e envia o orçamento, mas não decide nem altera depois.
#[path = "../commands/mod.rs"] mod commands;
#[path = "../db.rs"] mod db;
#[path = "../test_support/memory_keyring.rs"] mod memory_keyring;
use commands::{auth, equipamentos, orcamento_decisao, portal_cliente, verificacoes};
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

    // PRORROGAR PRAZO (I2): equipamento AGUARDANDO_APROVACAO já publicado.
    let prorrogar = |novo: String, tok: String, confirmar: bool| async move {
        orcamento_decisao::prorrogar_prazo_orcamento(orcamento_decisao::ProrrogarPrazoInput {
            equipamento_id: eq, novo_prazo: novo, expected_updated_em: tok, confirmar_resposta_pendente: confirmar,
        }).await
    };
    // 1. Data passada: recusada.
    let passado = (chrono::Utc::now() - chrono::Duration::days(2)).format("%Y-%m-%d").to_string();
    let erro = prorrogar(passado, token(eq).await?, false).await.err().expect("data passada deveria falhar");
    assert!(erro.contains("não pode ser anterior a hoje"), "{erro}");
    // 2. Token de concorrência velho.
    let erro = prorrogar("2027-01-10".into(), "2000-01-01 00:00:00+00".into(), false).await.err().expect("token velho deveria falhar");
    assert!(erro.contains("Conflito de concorrência"), "{erro}");
    let prazo_atual: Option<String> = sqlx::query_scalar("SELECT prazo_aprovacao FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await?;
    assert_eq!(prazo_atual.as_deref(), Some("2026-12-31"));
    // 5. Perfil sem PREPARE_QUOTES nem FINANCIAL_ACTIONS.
    let sem_perm: i32 = sqlx::query_scalar("INSERT INTO security_profiles(nome,role,permissions,empresa_id,ativo,is_default) VALUES ($1,'TECNICO',$2,$3,true,false) RETURNING id")
        .bind(format!("SemOrc {suffix}")).bind(serde_json::to_string(&[auth::PERMISSION_STOCK_CONTROL])?).bind(empresa).fetch_one(&pool).await?;
    auth::store_profile_pin(sem_perm, "2468").map_err(|e| anyhow!(e))?;
    auth::set_active_security_profile(sem_perm, "2468".into(), Some("2468".into())).await.map_err(|e| anyhow!(e))?;
    auth::unlock_sensitive_access("2468".into()).await.map_err(|e| anyhow!(e))?;
    let erro = prorrogar("2027-01-10".into(), token(eq).await?, false).await.err().expect("sem permissão deveria falhar");
    assert!(erro.contains(SEM_PERMISSAO), "{erro}");
    auth::set_active_security_profile(profile, "1357".into(), Some("1357".into())).await.map_err(|e| anyhow!(e))?;
    auth::unlock_sensitive_access("1357".into()).await.map_err(|e| anyhow!(e))?;
    // 3. Resposta pendente do cliente.
    sqlx::query("INSERT INTO orcamento_respostas (empresa_id, equipamento_id, versao_id, origem, decisao, contato_nome) VALUES ($1,$2,$3,'PORTAL_CLIENTE','APROVAR','Ana Envio')")
        .bind(empresa).bind(eq).bind(publicado.versao_id).execute(&pool).await?;
    let sem_confirmar = prorrogar("2027-01-10".into(), token(eq).await?, false).await.map_err(|e| anyhow!("prorrogar sem confirmar: {e}"))?;
    assert!(!sem_confirmar.prorrogado);
    assert!(sem_confirmar.resposta_pendente.is_some());
    let prazo_atual: Option<String> = sqlx::query_scalar("SELECT prazo_aprovacao FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await?;
    assert_eq!(prazo_atual.as_deref(), Some("2026-12-31"));
    // Com confirmação: prorroga e a resposta fica DESFEITA (4: prazo novo gravado e nova versão no portal).
    let confirmado = prorrogar("2027-01-10".into(), token(eq).await?, true).await.map_err(|e| anyhow!("prorrogar confirmado: {e}"))?;
    assert!(confirmado.prorrogado);
    assert!(confirmado.resposta_pendente.is_none());
    assert_eq!(confirmado.equipamento.as_ref().and_then(|e| e.prazo_aprovacao.clone()).as_deref(), Some("2027-01-10"));
    let ultima: (String, ) = sqlx::query_as("SELECT decisao FROM orcamento_respostas WHERE versao_id=$1 ORDER BY id DESC LIMIT 1")
        .bind(publicado.versao_id).fetch_one(&pool).await?;
    assert_eq!(ultima.0, "DESFEITA");
    let prazo_atual: Option<String> = sqlx::query_scalar("SELECT prazo_aprovacao FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await?;
    assert_eq!(prazo_atual.as_deref(), Some("2027-01-10"));
    let (nova_id, nova_aberta, nova_valida): (i64, bool, bool) = sqlx::query_as(
        "SELECT id, encerrada_em IS NULL, valido_ate = (('2027-01-11'::DATE)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
         FROM orcamento_versoes WHERE equipamento_id=$1 ORDER BY versao DESC LIMIT 1").bind(eq).fetch_one(&pool).await?;
    assert!(nova_id > publicado.versao_id, "deveria existir nova versão após a prorrogação");
    assert!(nova_aberta && nova_valida, "nova versão aberta com validade do novo prazo");
    let antiga_encerrada: bool = sqlx::query_scalar("SELECT encerrada_em IS NOT NULL FROM orcamento_versoes WHERE id=$1").bind(publicado.versao_id).fetch_one(&pool).await?;
    assert!(antiga_encerrada);
    // 4. Prorrogação válida sem resposta pendente.
    let simples = prorrogar("2027-02-20".into(), token(eq).await?, false).await.map_err(|e| anyhow!("prorrogar simples: {e}"))?;
    assert!(simples.prorrogado && simples.resposta_pendente.is_none());
    let valida: bool = sqlx::query_scalar(
        "SELECT encerrada_em IS NULL AND valido_ate = (('2027-02-21'::DATE)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
         FROM orcamento_versoes WHERE equipamento_id=$1 ORDER BY versao DESC LIMIT 1").bind(eq).fetch_one(&pool).await?;
    assert!(valida);

    // NÃO CONSEGUE: alterar serviços de OS já decidida (APROVADO).
    sqlx::query("UPDATE equipamentos SET status='APROVADO' WHERE id=$1").bind(eq).execute(&pool).await?;
    let erro = verificacoes::atualizar_servicos_verificacao(eq, Some(services.to_string()), Some("[]".into()), Some(90.0), profile, false, None, None, None, Some(empresa), None, None, None)
        .await.err().unwrap();
    assert!(erro.contains("Este perfil só altera orçamentos ainda não decididos."), "{erro}");

    println!("OK: perfil TECNICO prepara, envia e publica o orçamento, mas não aprova, reprova, altera OS decidida nem define senha do portal.");
    Ok(())
}
