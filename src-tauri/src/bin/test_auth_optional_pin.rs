#[path = "../db.rs"]
mod db;
#[path = "../commands/mod.rs"]
mod commands;

use anyhow::{anyhow, Context, Result};
use commands::auth;
use commands::auth::SecurityProfileInput;
use keyring::Entry;

const KEYRING_SERVICE: &str = "autoos";
const PROFILE_KEYRING_PREFIX: &str = "sensitive_access_profile_";

fn tauri_result<T>(result: std::result::Result<T, String>, context: &str) -> Result<T> {
    result.map_err(|error| anyhow!("{}: {}", context, error))
}

#[tokio::main]
async fn main() -> Result<()> {
    let pool = db::init_database().await.context("Falha ao inicializar PostgreSQL")?;

    // Cleanup any previous test data
    let _ = sqlx::query("DELETE FROM security_profiles WHERE nome LIKE 'Test Optional PIN%'")
        .execute(&pool)
        .await;

    // Create an admin profile with MANAGE_PROFILES permission
    let permissions =
        serde_json::to_string(&vec![auth::PERMISSION_MANAGE_PROFILES.to_string()])?;
    let admin_id: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em)
         VALUES ('Test Optional PIN Admin', 'ADMIN', $1, true, true, NOW())
         RETURNING id",
    )
    .bind(&permissions)
    .fetch_one(&pool)
    .await
    .context("Falha ao criar perfil admin de teste")?;

    // Unlock session without PIN (admin has no PIN in keyring yet)
    tauri_result(auth::unlock_session_without_pin().await, "Falha ao desbloquear sessão sem PIN")?;

    // Create profile with empty PIN
    let input = SecurityProfileInput {
        nome: "Test Optional PIN".to_string(),
        role: "CUSTOM".to_string(),
        permissions: vec![],
    };
    let _status = tauri_result(
        auth::create_security_profile(input, "".to_string()).await,
        "Falha ao criar perfil com PIN vazio",
    )?;

    // Verify profile was created and has no PIN configured
    let profiles = tauri_result(auth::list_security_profiles(Some(true)).await, "Falha ao listar perfis")?;
    let created = profiles
        .iter()
        .find(|p| p.nome == "Test Optional PIN")
        .context("Perfil criado não encontrado")?;

    assert_eq!(created.role, "CUSTOM", "Papel deve ser CUSTOM");
    assert!(
        !created.pin_configured,
        "Perfil sem PIN deve ter pin_configured=false"
    );

    // Verify no keyring entry exists for the created profile
    let entry = Entry::new(
        KEYRING_SERVICE,
        &format!("{}{}", PROFILE_KEYRING_PREFIX, created.id),
    )?;
    let has_pin = entry.get_password().is_ok();
    assert!(
        !has_pin,
        "Não deve haver entrada no keyring para perfil criado sem PIN"
    );

    // Set the new profile as active and unlock without PIN
    tauri_result(auth::set_active_security_profile(created.id).await, "Falha ao definir perfil ativo")?;
    let status = tauri_result(auth::unlock_session_without_pin().await, "Falha ao desbloquear sessão sem PIN")?;
    assert!(
        status.unlocked,
        "Deve desbloquear sem PIN para perfil sem PIN configurado"
    );

    // Cleanup: delete keyring entry for admin if it exists
    if let Ok(entry) = Entry::new(
        KEYRING_SERVICE,
        &format!("{}{}", PROFILE_KEYRING_PREFIX, admin_id),
    ) {
        let _ = entry.delete_password();
    }

    sqlx::query("DELETE FROM security_profiles WHERE nome LIKE 'Test Optional PIN%'")
        .execute(&pool)
        .await
        .context("Falha ao limpar dados de teste")?;

    println!("TEST_AUTH_OPTIONAL_PIN_OK");
    Ok(())
}
