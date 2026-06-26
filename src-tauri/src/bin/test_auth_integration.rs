#[path = "../db.rs"]
mod db;
#[path = "../commands/mod.rs"]
mod commands;

use anyhow::{anyhow, Context, Result};
use chrono::{Duration, Utc};
use commands::auth;
use keyring::Entry;
use url::Url;

const KEYRING_SERVICE: &str = "autoos";
const PROFILE_KEYRING_PREFIX: &str = "sensitive_access_profile_";

fn tauri_result<T>(result: std::result::Result<T, String>, context: &str) -> Result<T> {
    result.map_err(|error| anyhow!("{}: {}", context, error))
}

fn parse_db_url(database_url: &str) -> Result<(String, u16, String, String, String)> {
    let url = Url::parse(database_url).context("Falha ao parsear DATABASE_URL")?;
    let host = url.host_str().unwrap_or("localhost").to_string();
    let port = url.port().unwrap_or(5432);
    let database = url.path().trim_start_matches('/').to_string();
    let username = url.username().to_string();
    // url.password() returns percent-encoded string; decode common sequences for PostgreSQL auth
    let password = url.password().unwrap_or("").replace("%40", "@").replace("%23", "#").replace("%25", "%");
    Ok((host, port, database, username, password))
}

fn unlock_test_profile(profile_id: i32) -> Result<()> {
    let profile = auth::SecurityProfileSummary {
        id: profile_id,
        nome: "Test Auth Integration Admin".to_string(),
        role: "ADMIN".to_string(),
        permissions: vec![auth::PERMISSION_MANAGE_PROFILES.to_string()],
        pin_configured: true,
        is_default: true,
        ativo: true,
    };
    tauri_result(auth::unlock_session(profile), "Falha ao desbloquear sessão")
}

fn expire_session_manually() -> Result<()> {
    let mut session = auth::session_state().lock().map_err(|e| anyhow!("{}", e))?;
    session.unlocked_until = Some(Utc::now() - Duration::minutes(16));
    Ok(())
}

async fn set_inactivity_enabled(pool: &sqlx::PgPool, enabled: bool) -> Result<()> {
    sqlx::query("UPDATE configuracoes_sistema SET inactivity_lock_enabled = $1 WHERE id = 1")
        .bind(enabled)
        .execute(pool)
        .await
        .context("Falha ao atualizar inactivity_lock no banco")?;
    Ok(())
}

async fn create_test_admin(pool: &sqlx::PgPool) -> Result<i32> {
    let permissions = serde_json::to_string(&vec![auth::PERMISSION_MANAGE_PROFILES.to_string()])?;
    let existing: Option<i32> = sqlx::query_scalar(
        "SELECT id FROM security_profiles WHERE nome = 'Test Auth Integration Admin' LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .context("Falha ao buscar perfil admin existente")?;

    if let Some(id) = existing {
        let mut tx = pool.begin().await.context("Falha ao iniciar transação para reativar admin")?;
        sqlx::query("UPDATE security_profiles SET is_default = false, atualizado_em = NOW() WHERE ativo = true AND is_default = true")
            .execute(&mut *tx)
            .await
            .context("Falha ao limpar perfil padrão anterior")?;
        sqlx::query("UPDATE security_profiles SET ativo = true, is_default = true, role = 'ADMIN', permissions = $1, atualizado_em = NOW() WHERE id = $2")
            .bind(&permissions)
            .bind(id)
            .execute(&mut *tx)
            .await
            .context("Falha ao reativar perfil admin de teste")?;
        tx.commit().await.context("Falha ao confirmar transação do admin de teste")?;
        tauri_result(auth::store_profile_pin(id, "1234"), "Falha ao armazenar PIN do admin")?;
        return Ok(id);
    }

    let mut tx = pool.begin().await.context("Falha ao iniciar transação para criar admin de teste")?;
    sqlx::query("UPDATE security_profiles SET is_default = false, atualizado_em = NOW() WHERE ativo = true AND is_default = true")
        .execute(&mut *tx)
        .await
        .context("Falha ao limpar perfil padrão anterior")?;
    let admin_id: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em)
         VALUES ('Test Auth Integration Admin', 'ADMIN', $1, true, true, NOW())
         RETURNING id",
    )
    .bind(&permissions)
    .fetch_one(&mut *tx)
    .await
    .context("Falha ao criar perfil admin de teste")?;
    tx.commit().await.context("Falha ao confirmar transação do admin de teste")?;
    tauri_result(auth::store_profile_pin(admin_id, "1234"), "Falha ao armazenar PIN do admin")?;
    Ok(admin_id)
}

async fn cleanup_test_keyring(profile_id: i32) {
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, &format!("{}{}", PROFILE_KEYRING_PREFIX, profile_id)) {
        let _ = entry.delete_password();
    }
}

async fn cleanup_test_data(pool: &sqlx::PgPool) -> Result<()> {
    let _ = sqlx::query("DELETE FROM security_audit_log WHERE event_type LIKE 'PIN_RECOVERY%'")
        .execute(pool)
        .await;
    let _ = sqlx::query("DELETE FROM security_profiles WHERE nome LIKE 'Test Auth Integration%'")
        .execute(pool)
        .await;
    Ok(())
}

async fn test_inactivity_on_session_expires(pool: &sqlx::PgPool) -> Result<()> {
    set_inactivity_enabled(pool, true).await?;
    let config = tauri_result(auth::verificar_config_inatividade().await, "Falha ao verificar config de inatividade")?;
    assert_eq!(config, true, "verificar_config_inatividade deve refletir true");

    unlock_test_profile(1)?;
    expire_session_manually()?;

    let result = tauri_result(auth::current_session_profile(), "Falha ao verificar sessão atual")?;
    assert!(
        result.is_none(),
        "Sessão expirada após 15+ min deve retornar None quando bloqueio por inatividade está ATIVADO"
    );
    Ok(())
}

async fn test_inactivity_off_session_stays_valid(pool: &sqlx::PgPool) -> Result<()> {
    set_inactivity_enabled(pool, false).await?;
    let config = tauri_result(auth::verificar_config_inatividade().await, "Falha ao verificar config de inatividade")?;
    assert_eq!(config, false, "verificar_config_inatividade deve refletir false");

    unlock_test_profile(1)?;
    expire_session_manually()?;

    let result = tauri_result(auth::current_session_profile(), "Falha ao verificar sessão atual")?;
    assert!(
        result.is_some(),
        "Sessão expirada após 15+ min deve PERMANECER válida quando bloqueio por inatividade está DESATIVADO"
    );
    Ok(())
}

async fn test_operator_no_pin_dropdown_login(pool: &sqlx::PgPool) -> Result<()> {
    set_inactivity_enabled(pool, false).await?;

    let admin_id = create_test_admin(pool).await?;
    unlock_test_profile(admin_id)?;

    let input = auth::SecurityProfileInput {
        nome: "Test Auth Integration Operator".to_string(),
        role: "CUSTOM".to_string(),
        permissions: vec![auth::PERMISSION_STOCK_CONTROL.to_string()],
    };
    let status = tauri_result(
        auth::create_security_profile(input, "".to_string()).await,
        "Falha ao criar operador sem PIN",
    )?;

    let operator = status.profiles.iter()
        .find(|p| p.nome == "Test Auth Integration Operator")
        .context("Operador criado não encontrado no status")?;

    assert_eq!(operator.role, "CUSTOM", "Papel do operador deve ser CUSTOM");
    assert!(!operator.pin_configured, "Operador criado sem PIN deve ter pin_configured=false");

    tauri_result(auth::set_active_security_profile(operator.id).await, "Falha ao definir perfil ativo como operador")?;
    let unlocked_status = tauri_result(auth::unlock_session_without_pin().await, "Falha ao desbloquear sessão sem PIN")?;

    assert!(unlocked_status.unlocked, "Deve desbloquear sem PIN para operador sem PIN configurado");
    assert!(
        unlocked_status.permissions.contains(&auth::PERMISSION_STOCK_CONTROL.to_string()),
        "Permissões do operador devem ser aplicadas após login sem PIN"
    );

    tauri_result(auth::lock_sensitive_access().await, "Falha ao bloquear sessão")?;
    cleanup_test_keyring(admin_id).await;
    Ok(())
}

async fn test_admin_with_pin_dropdown_not_available(pool: &sqlx::PgPool) -> Result<()> {
    let admin_id = create_test_admin(pool).await?;
    tauri_result(auth::set_active_security_profile(admin_id).await, "Falha ao definir perfil ativo como admin")?;
    let admin_status = tauri_result(auth::get_sensitive_access_status().await, "Falha ao obter status do admin")?;
    let admin_profile_in_status = admin_status.profiles.iter()
        .find(|p| p.id == admin_id)
        .context("Admin não encontrado no status")?;
    assert!(
        admin_profile_in_status.pin_configured,
        "Admin com PIN deve ter pin_configured=true → dropdown NÃO deve estar disponível"
    );
    cleanup_test_keyring(admin_id).await;
    Ok(())
}

async fn test_recovery_success_then_login(
    pool: &sqlx::PgPool,
    host: String,
    port: u16,
    database: String,
    username: String,
    password: String,
) -> Result<()> {
    let permissions = serde_json::to_string(&vec![auth::PERMISSION_MANAGE_PROFILES.to_string()])?;
    let recovery_id: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em)
         VALUES ('Test Auth Integration Recovery Success', 'ADMIN', $1, true, false, NOW())
         RETURNING id",
    )
    .bind(&permissions)
    .fetch_one(pool)
    .await
    .context("Falha ao criar perfil de recovery")?;

    tauri_result(auth::store_profile_pin(recovery_id, "1111"), "Falha ao armazenar PIN inicial")?;

    let success = tauri_result(
        auth::redefinir_pin_via_db(
            host.clone(), port, database.clone(), username.clone(), password.clone(),
            recovery_id, "9999".to_string(),
        )
        .await,
        "Falha ao redefinir PIN via recovery",
    )?;
    assert!(success, "redefinir_pin_via_db deve retornar true para credenciais válidas");

    let new_pin = tauri_result(auth::load_profile_pin(recovery_id), "Falha ao carregar PIN após recovery")?;
    assert!(new_pin.is_some(), "PIN deve existir após recovery");
    assert!(auth::verify_pin("9999", new_pin.as_ref().unwrap()), "Novo PIN deve ser válido após recovery");
    assert!(!auth::verify_pin("1111", new_pin.as_ref().unwrap()), "PIN antigo deve ser inválido após recovery");

    cleanup_test_keyring(recovery_id).await;
    Ok(())
}

async fn test_recovery_wrong_creds_audit_logged(
    pool: &sqlx::PgPool,
    host: String,
    port: u16,
    database: String,
    username: String,
) -> Result<()> {
    let permissions = serde_json::to_string(&vec![auth::PERMISSION_MANAGE_PROFILES.to_string()])?;
    let recovery_id: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em)
         VALUES ('Test Auth Integration Recovery Failure', 'ADMIN', $1, true, false, NOW())
         RETURNING id",
    )
    .bind(&permissions)
    .fetch_one(pool)
    .await
    .context("Falha ao criar perfil de recovery")?;

    tauri_result(auth::store_profile_pin(recovery_id, "2222"), "Falha ao armazenar PIN inicial para teste de falha")?;

    let wrong_reset = auth::redefinir_pin_via_db(
        host.clone(), port, database.clone(), username.clone(), "wrong_password".to_string(),
        recovery_id, "8888".to_string(),
    )
    .await;
    assert!(wrong_reset.is_err(), "redefinir_pin_via_db deve falhar com credenciais inválidas");

    let pin_after_fail = tauri_result(auth::load_profile_pin(recovery_id), "Falha ao carregar PIN após falha")?;
    assert!(
        pin_after_fail.is_none() || !auth::verify_pin("8888", pin_after_fail.as_ref().unwrap()),
        "PIN não deve ter sido alterado após falha de recovery"
    );

    let audit_events: Vec<auth::SecurityAuditEventRow> = sqlx::query_as(
        "SELECT id, event_type, profile_id, profile_name, details, success, created_at::text AS created_at
         FROM security_audit_log
         WHERE event_type LIKE 'PIN_RECOVERY%'
         ORDER BY created_at DESC"
    )
    .fetch_all(pool)
    .await
    .context("Falha ao buscar eventos de auditoria")?;

    let attempt_count = audit_events.iter().filter(|e| e.event_type == "PIN_RECOVERY_ATTEMPT").count();
    let success_count = audit_events.iter().filter(|e| e.event_type == "PIN_RECOVERY_SUCCESS" && e.success).count();
    let failed_count = audit_events.iter().filter(|e| e.event_type == "PIN_RECOVERY_FAILED" && !e.success).count();

    assert!(attempt_count >= 2, "Deve haver ao menos 2 PIN_RECOVERY_ATTEMPT (1 sucesso + 1 falha)");
    assert_eq!(success_count, 1, "Deve haver exatamente 1 PIN_RECOVERY_SUCCESS");
    assert_eq!(failed_count, 1, "Deve haver exatamente 1 PIN_RECOVERY_FAILED");

    cleanup_test_keyring(recovery_id).await;
    Ok(())
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

    cleanup_test_data(&pool).await?;

    test_inactivity_on_session_expires(&pool).await?;
    test_inactivity_off_session_stays_valid(&pool).await?;
    test_operator_no_pin_dropdown_login(&pool).await?;
    test_admin_with_pin_dropdown_not_available(&pool).await?;
    test_recovery_success_then_login(&pool, host.clone(), port, database.clone(), username.clone(), password.clone()).await?;
    test_recovery_wrong_creds_audit_logged(&pool, host, port, database, username).await?;

    cleanup_test_data(&pool).await?;

    println!("TEST_AUTH_INTEGRATION_OK");
    Ok(())
}
