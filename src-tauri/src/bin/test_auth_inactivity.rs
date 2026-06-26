#[path = "../db.rs"]
mod db;
#[path = "../commands/mod.rs"]
mod commands;

use anyhow::{anyhow, Context, Result};
use chrono::{Duration, Utc};
use commands::auth;

fn tauri_result<T>(result: std::result::Result<T, String>, context: &str) -> Result<T> {
    result.map_err(|error| anyhow!("{}: {}", context, error))
}

#[tokio::main]
async fn main() -> Result<()> {
    let pool = db::init_database().await.context("Falha ao inicializar PostgreSQL")?;

    // Cleanup any previous test data
    let _ = sqlx::query("DELETE FROM security_profiles WHERE nome = 'Test Inactivity Admin'")
        .execute(&pool)
        .await;

    // Create an admin profile with MANAGE_PROFILES permission
    let permissions =
        serde_json::to_string(&vec![auth::PERMISSION_MANAGE_PROFILES.to_string()])?;
    let profile_id: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em)
         VALUES ('Test Inactivity Admin', 'ADMIN', $1, true, true, NOW())
         RETURNING id",
    )
    .bind(&permissions)
    .fetch_one(&pool)
    .await
    .context("Falha ao criar perfil admin de teste")?;

    // Ensure inactivity lock is enabled for first test
    sqlx::query(
        "UPDATE configuracoes_sistema SET inactivity_lock_enabled = true WHERE id = 1",
    )
    .execute(&pool)
    .await
    .context("Falha ao habilitar inactivity_lock no banco")?;
    let config = tauri_result(auth::verificar_config_inatividade().await, "Falha ao verificar config de inatividade")?;
    assert_eq!(config, true, "verificar_config_inatividade deve refletir true");

    // Unlock session manually
    let profile = auth::SecurityProfileSummary {
        id: profile_id,
        nome: "Test Inactivity Admin".to_string(),
        role: "ADMIN".to_string(),
        permissions: vec![auth::PERMISSION_MANAGE_PROFILES.to_string()],
        pin_configured: false,
        is_default: true,
        ativo: true,
    };
    tauri_result(auth::unlock_session(profile), "Falha ao desbloquear sessão")?;

    // Expire the session manually (set unlocked_until to past)
    {
        let mut session = auth::session_state()
            .lock()
            .map_err(|e| anyhow!("{}", e))?;
        session.unlocked_until = Some(Utc::now() - Duration::minutes(1));
    }

    // With inactivity lock ENABLED, expired session returns None
    let result = tauri_result(auth::current_session_profile(), "Falha ao verificar sessão atual")?;
    assert!(
        result.is_none(),
        "Sessão expirada deve retornar None quando bloqueio por inatividade está ativado"
    );

    // Disable inactivity lock via DB and sync static
    sqlx::query(
        "UPDATE configuracoes_sistema SET inactivity_lock_enabled = false WHERE id = 1",
    )
    .execute(&pool)
    .await
    .context("Falha ao desabilitar inactivity_lock no banco")?;
    let config = tauri_result(auth::verificar_config_inatividade().await, "Falha ao verificar config de inatividade")?;
    assert_eq!(
        config, false,
        "verificar_config_inatividade deve refletir false"
    );

    // Re-unlock and expire again
    let profile = auth::SecurityProfileSummary {
        id: profile_id,
        nome: "Test Inactivity Admin".to_string(),
        role: "ADMIN".to_string(),
        permissions: vec![auth::PERMISSION_MANAGE_PROFILES.to_string()],
        pin_configured: false,
        is_default: true,
        ativo: true,
    };
    tauri_result(auth::unlock_session(profile), "Falha ao desbloquear sessão")?;
    {
        let mut session = auth::session_state()
            .lock()
            .map_err(|e| anyhow!("{}", e))?;
        session.unlocked_until = Some(Utc::now() - Duration::minutes(1));
    }

    // With inactivity lock DISABLED, expired session should still be valid
    let result = tauri_result(auth::current_session_profile(), "Falha ao verificar sessão atual")?;
    assert!(
        result.is_some(),
        "Sessão expirada deve permanecer válida quando bloqueio por inatividade está desativado"
    );

    // Test salvar_config_inatividade: session is still valid (inactivity off), so require_permission works
    let saved = tauri_result(auth::salvar_config_inatividade(true).await, "Falha ao salvar config de inatividade")?;
    assert_eq!(saved, true, "salvar_config_inatividade deve retornar true");

    let config = tauri_result(auth::verificar_config_inatividade().await, "Falha ao verificar config de inatividade")?;
    assert_eq!(
        config, true,
        "verificar_config_inatividade deve refletir true após salvar"
    );

    // After re-enabling, expired session returns None again
    let result = tauri_result(auth::current_session_profile(), "Falha ao verificar sessão atual")?;
    assert!(
        result.is_none(),
        "Sessão expirada deve retornar None após reativar bloqueio por inatividade"
    );

    // Cleanup
    sqlx::query("DELETE FROM security_profiles WHERE nome = 'Test Inactivity Admin'")
        .execute(&pool)
        .await
        .context("Falha ao limpar dados de teste")?;

    println!("TEST_AUTH_INACTIVITY_OK");
    Ok(())
}
