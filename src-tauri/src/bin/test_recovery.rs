#[path = "../db.rs"]
mod db;
#[path = "../commands/mod.rs"]
mod commands;

use anyhow::{anyhow, Context, Result};
use commands::auth;
use url::Url;

fn tauri_result<T>(result: std::result::Result<T, String>, context: &str) -> Result<T> {
    result.map_err(|error| anyhow!("{}: {}", context, error))
}

fn parse_db_url(database_url: &str) -> Result<(String, u16, String, String, String)> {
    let url = Url::parse(database_url).context("Falha ao parsear DATABASE_URL")?;
    let host = url.host_str().unwrap_or("localhost").to_string();
    let port = url.port().unwrap_or(5432);
    let database = url.path().trim_start_matches('/').to_string();
    let username = url.username().to_string();
    let password = url.password().unwrap_or("").to_string();
    Ok((host, port, database, username, password))
}

#[tokio::main]
async fn main() -> Result<()> {
    let pool = db::init_database().await.context("Falha ao inicializar PostgreSQL")?;

    let database_url = std::env::var("DATABASE_URL")
        .or_else(|_| {
            dotenv::dotenv().ok();
            std::env::var("DATABASE_URL")
        })
        .context("DATABASE_URL não encontrada")?;
    let (host, port, database, username, password) = parse_db_url(&database_url)?;

    let _ = sqlx::query("DELETE FROM security_profiles WHERE nome = 'Test Recovery Profile'")
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM security_audit_log WHERE details LIKE '%Test Recovery Profile%'")
        .execute(&pool)
        .await;

    let permissions = serde_json::to_string(&vec![auth::PERMISSION_MANAGE_PROFILES.to_string()])?;
    let profile_id: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em)
         VALUES ('Test Recovery Profile', 'ADMIN', $1, true, false, NOW())
         RETURNING id",
    )
    .bind(&permissions)
    .fetch_one(&pool)
    .await
    .context("Falha ao criar perfil de teste")?;

    tauri_result(auth::store_profile_pin(profile_id, "1234"), "Falha ao armazenar PIN inicial")?;

    let valid = tauri_result(
        auth::verificar_credenciais_banco(host.clone(), port, database.clone(), username.clone(), password.clone()).await,
        "Falha ao verificar credenciais válidas",
    )?;
    assert!(valid, "verificar_credenciais_banco deve retornar true para credenciais válidas");

    let invalid = tauri_result(
        auth::verificar_credenciais_banco(host.clone(), port, database.clone(), username.clone(), "wrong_password".to_string()).await,
        "Falha ao verificar credenciais inválidas",
    )?;
    assert!(!invalid, "verificar_credenciais_banco deve retornar false para credenciais inválidas");

    let failed_reset = auth::redefinir_pin_via_db(
        host.clone(),
        port,
        database.clone(),
        username.clone(),
        "wrong_password".to_string(),
        profile_id,
        "5678".to_string(),
    )
    .await;
    assert!(failed_reset.is_err(), "redefinir_pin_via_db deve falhar com credenciais inválidas");

    let old_pin = tauri_result(auth::load_profile_pin(profile_id), "Falha ao carregar PIN")?;
    assert!(old_pin.is_some(), "PIN deve existir após falha de recovery");
    assert!(
        auth::verify_pin("1234", &old_pin.unwrap()),
        "PIN antigo deve continuar válido após falha de recovery"
    );

    let success = tauri_result(
        auth::redefinir_pin_via_db(
            host.clone(),
            port,
            database.clone(),
            username.clone(),
            password.clone(),
            profile_id,
            "5678".to_string(),
        )
        .await,
        "Falha ao redefinir PIN via recovery",
    )?;
    assert!(success, "redefinir_pin_via_db deve retornar true para credenciais válidas");

    let new_pin = tauri_result(auth::load_profile_pin(profile_id), "Falha ao carregar PIN após reset")?;
    assert!(new_pin.is_some(), "PIN deve existir após recovery bem-sucedido");
    let new_pin_ref = new_pin.as_ref().unwrap();
    assert!(
        auth::verify_pin("5678", new_pin_ref),
        "Novo PIN deve ser válido após recovery bem-sucedido"
    );
    assert!(
        !auth::verify_pin("1234", new_pin_ref),
        "PIN antigo deve ser inválido após recovery bem-sucedido"
    );

    let audit_events: Vec<auth::SecurityAuditEventRow> = sqlx::query_as(
        "SELECT id, event_type, profile_id, profile_name, details, success, created_at::text AS created_at
         FROM security_audit_log
         WHERE event_type LIKE 'PIN_RECOVERY%'
         ORDER BY created_at DESC"
    )
    .fetch_all(&pool)
    .await
    .context("Falha ao buscar eventos de auditoria")?;

    let attempt_count = audit_events.iter().filter(|e| e.event_type == "PIN_RECOVERY_ATTEMPT").count();
    let success_count = audit_events.iter().filter(|e| e.event_type == "PIN_RECOVERY_SUCCESS" && e.success).count();
    let failed_count = audit_events.iter().filter(|e| e.event_type == "PIN_RECOVERY_FAILED" && !e.success).count();

    assert!(attempt_count >= 2, "Deve haver ao menos 2 PIN_RECOVERY_ATTEMPT (1 sucesso + 1 falha)");
    assert_eq!(success_count, 1, "Deve haver exatamente 1 PIN_RECOVERY_SUCCESS");
    assert_eq!(failed_count, 1, "Deve haver exatamente 1 PIN_RECOVERY_FAILED");

    sqlx::query("DELETE FROM security_profiles WHERE nome = 'Test Recovery Profile'")
        .execute(&pool)
        .await
        .context("Falha ao limpar perfil de teste")?;
    sqlx::query("DELETE FROM security_audit_log WHERE event_type LIKE 'PIN_RECOVERY%'")
        .execute(&pool)
        .await
        .context("Falha ao limpar eventos de auditoria")?;

    println!("TEST_RECOVERY_OK");
    Ok(())
}
