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
         VALUES ('Test Inactivity Admin', 'ADMIN', $1, true, false, NOW())
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

    // A flag vem do banco já no primeiro status, sem ninguém abrir Configurações
    // (nenhuma chamada a verificar_config_inatividade antes deste ponto).
    let boot_profile = auth::SecurityProfileSummary {
        id: profile_id,
        nome: "Test Inactivity Admin".to_string(),
        role: "ADMIN".to_string(),
        permissions: vec![auth::PERMISSION_MANAGE_PROFILES.to_string()],
        pin_configured: false,
        pin_required: false,
        is_default: true,
        ativo: true,
        ..Default::default()
    };
    tauri_result(auth::unlock_session(boot_profile), "Falha ao desbloquear sessão (boot)")?;
    {
        let mut session = auth::session_state().lock().map_err(|e| anyhow!("{}", e))?;
        session.unlocked_until = Some(Utc::now() - Duration::minutes(1));
    }
    let boot_status = tauri_result(auth::get_sensitive_access_status().await, "Falha ao obter status no boot")?;
    assert!(
        !boot_status.unlocked,
        "O status deve carregar a flag de inatividade do banco e bloquear a sessão expirada"
    );

    let config = tauri_result(auth::verificar_config_inatividade().await, "Falha ao verificar config de inatividade")?;
    assert_eq!(config, true, "verificar_config_inatividade deve refletir true");

    // Unlock session manually
    let profile = auth::SecurityProfileSummary {
        id: profile_id,
        nome: "Test Inactivity Admin".to_string(),
        role: "ADMIN".to_string(),
        permissions: vec![auth::PERMISSION_MANAGE_PROFILES.to_string()],
        pin_configured: false,
        pin_required: false,
        is_default: true,
        ativo: true,
        ..Default::default()
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
        pin_required: false,
        is_default: true,
        ativo: true,
        ..Default::default()
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

    // A ação acima renovou a sessão (bloqueio desativado: sessão não expira). Expira de novo.
    {
        let mut session = auth::session_state().lock().map_err(|e| anyhow!("{}", e))?;
        session.unlocked_until = Some(Utc::now() - Duration::minutes(1));
    }

    // After re-enabling, expired session returns None again
    let result = tauri_result(auth::current_session_profile(), "Falha ao verificar sessão atual")?;
    assert!(
        result.is_none(),
        "Sessão expirada deve retornar None após reativar bloqueio por inatividade"
    );

    // O sino do portal consulta a cada 30 s e não pode renovar a sessão; uma ação do usuário renova.
    let polled_profile = auth::SecurityProfileSummary {
        id: profile_id,
        nome: "Test Inactivity Admin".to_string(),
        role: "ADMIN".to_string(),
        permissions: vec![auth::PERMISSION_MANAGE_PROFILES.to_string()],
        pin_configured: false,
        pin_required: false,
        is_default: true,
        ativo: true,
        ..Default::default()
    };
    tauri_result(auth::unlock_session(polled_profile), "Falha ao desbloquear sessão (sino)")?;
    let almost_expired = Utc::now() + Duration::minutes(1);
    {
        let mut session = auth::session_state().lock().map_err(|e| anyhow!("{}", e))?;
        session.unlocked_until = Some(almost_expired);
    }
    // O perfil de teste não tem empresa, então a consulta termina em erro; o que importa é a sessão.
    let _ = commands::portal_cliente::contar_alertas_portal_nao_lidos().await;
    let _ = commands::portal_cliente::listar_alertas_portal(true, Some(5)).await;
    {
        let session = auth::session_state().lock().map_err(|e| anyhow!("{}", e))?;
        assert_eq!(
            session.unlocked_until,
            Some(almost_expired),
            "As consultas de segundo plano do sino não podem renovar a sessão sensível"
        );
    }
    tauri_result(auth::require_sensitive_access().map(|_| ()), "Ação do usuário deve passar com a sessão aberta")?;
    {
        let session = auth::session_state().lock().map_err(|e| anyhow!("{}", e))?;
        assert!(
            session.unlocked_until.is_some_and(|until| until > Utc::now() + Duration::minutes(10)),
            "Ação do usuário deve renovar a sessão"
        );
    }

    // Cleanup
    sqlx::query("DELETE FROM security_profiles WHERE nome = 'Test Inactivity Admin'")
        .execute(&pool)
        .await
        .context("Falha ao limpar dados de teste")?;

    println!("TEST_AUTH_INACTIVITY_OK");
    Ok(())
}
