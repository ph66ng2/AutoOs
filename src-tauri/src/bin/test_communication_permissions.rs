//! Validação do comando real, somente em banco local descartável autoos_stock_test*.
#[path = "../commands/mod.rs"] mod commands;
#[path = "../db.rs"] mod db;
use anyhow::{ensure, Result};
use commands::{auth, portal_cliente};

#[tokio::main]
async fn main() -> Result<()> {
    let url = std::env::var("AUTOOS_STOCK_TEST_DATABASE_URL")?;
    let parsed = url::Url::parse(&url)?;
    ensure!(matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "::1")), "Exige PostgreSQL local");
    ensure!(parsed.path().trim_start_matches('/').starts_with("autoos_stock_test"), "Exige banco descartável de testes");
    std::env::set_var("DATABASE_URL", url);
    let pool = db::init_database().await?;
    let suffix = uuid::Uuid::new_v4().to_string();
    let empresa: i32 = sqlx::query_scalar("INSERT INTO empresas(nome,email,status) VALUES ('Teste',$1,'ativo') RETURNING id")
        .bind(format!("{suffix}@example.test")).fetch_one(&pool).await?;
    let perfil: i32 = sqlx::query_scalar("INSERT INTO security_profiles(nome,role,permissions,empresa_id) VALUES ($1,'CUSTOM','[]',$2) RETURNING id")
        .bind(format!("Teste {suffix}")).bind(empresa).fetch_one(&pool).await?;
    let session = |permissions: &[&str]| auth::unlock_session(auth::SecurityProfileSummary {
        id: perfil, nome: format!("Teste {suffix}"), role: "CUSTOM".into(),
        permissions: permissions.iter().map(|p| p.to_string()).collect(),
        ..Default::default()
    }).map_err(anyhow::Error::msg);
    session(&[auth::PERMISSION_MANAGE_STATUS_LINKS])?;
    let erro = portal_cliente::definir_estado_portal(false, false).await.unwrap_err();
    ensure!(erro.contains("não possui permissão necessária"), "Acessos do portal deve ser recusado: {erro}");

    session(&[auth::PERMISSION_COMMUNICATION_SETTINGS])?;
    let ligado = portal_cliente::definir_estado_portal(true, false).await.map_err(anyhow::Error::msg)?;
    ensure!(ligado.portal_ativo, "Comunicação externa deve ligar o portal");
    let desligado = portal_cliente::definir_estado_portal(false, false).await.map_err(anyhow::Error::msg)?;
    ensure!(!desligado.portal_ativo, "Comunicação externa deve desligar o portal");
    let erro = portal_cliente::definir_estado_portal(true, true).await.unwrap_err();
    ensure!(erro.contains("não possui permissão necessária"), "Respostas ainda exigem financeiro");
    ensure!(!portal_cliente::obter_estado_portal().await.map_err(anyhow::Error::msg)?.portal_ativo, "Falha não deve gravar mudança parcial");

    session(&[auth::PERMISSION_COMMUNICATION_SETTINGS, auth::PERMISSION_FINANCIAL_ACTIONS])?;
    let respostas = portal_cliente::definir_estado_portal(true, true).await.map_err(anyhow::Error::msg)?;
    ensure!(respostas.portal_ativo && respostas.respostas_ativas, "Permissões combinadas liberam respostas");
    let auditados: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM security_audit_log WHERE profile_id=$1 AND event_type='PORTAL_CONFIG_CHANGED' AND success=TRUE")
        .bind(perfil).fetch_one(&pool).await?;
    ensure!(auditados == 3, "Mudanças de funcionamento devem ser auditadas");
    auth::lock_sensitive_access().await.map_err(anyhow::Error::msg)?;
    pool.close().await;
    Ok(())
}
