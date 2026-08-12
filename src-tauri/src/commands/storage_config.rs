//! ╔══════════════════════════════════════════════════════════════╗
//! ║  storage_config.rs — Configuração do Supabase Storage       ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  Comandos Tauri para salvar/carregar configuração do         ║
//! ║  Supabase (URL, service_role key, empresa_id) no keyring.   ║
//! ║                                                              ║
//! ║  Comandos:                                                   ║
//! ║  - salvar_config_storage: Salva config no keyring            ║
//! ║  - carregar_config_storage: Carrega config do keyring        ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::types::SupabaseStorageConfig;
use keyring::Entry;
use tracing::{error, info};

const KEYRING_SERVICE: &str = "autoos";
const KEYRING_USER: &str = "storage_config";

fn get_keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| {
        error!("Erro ao criar entrada keyring de storage config: {}", e);
        e.to_string()
    })
}

/// Salva a configuração do Supabase no keyring do sistema.
///
/// A service_role key é armazenada no keyring (nunca em arquivo plaintext).
/// O `empresa_id` é opcional — default para empresa BMITAG se ausente.
#[tauri::command]
pub async fn salvar_config_storage(config: SupabaseStorageConfig) -> Result<bool, String> {
    let json = serde_json::to_string(&config).map_err(|e| {
        error!("Erro ao serializar config de storage: {}", e);
        format!("Erro ao preparar configuração: {}", e)
    })?;

    let entry = get_keyring_entry()?;
    entry.set_password(&json).map_err(|e| {
        error!("Erro ao salvar config de storage no keyring: {}", e);
        format!("Erro ao salvar configuração: {}", e)
    })?;

    info!("Configuração do Supabase salva no keyring");
    Ok(true)
}

/// Carrega a configuração do Supabase do keyring.
///
/// Retorna `None` se não houver configuração salva (primeira execução).
#[tauri::command]
pub async fn carregar_config_storage() -> Result<Option<SupabaseStorageConfig>, String> {
    let entry = get_keyring_entry()?;

    let json = match entry.get_password() {
        Ok(password) => password,
        Err(_) => return Ok(None),
    };

    let config: SupabaseStorageConfig = serde_json::from_str(&json).map_err(|e| {
        error!("Erro ao deserializar config de storage: {}", e);
        format!("Configuração do Supabase inválida: {}", e)
    })?;

    Ok(Some(config))
}
