//! PIN operacional SaaS: local, por dispositivo e por perfil UUID.
use crate::commands::saas_device::carregar_marcador_dispositivo_saas;
use argon2::{
    password_hash::{rand_core::OsRng, SaltString},
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
};
use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const SERVICE: &str = "autoos";
const PREFIX: &str = "saas_profile_pin_v1";
const INDEX_PREFIX: &str = "saas_profile_pin_index_v1";
const MAX_FAILURES: u8 = 5;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PinRecord {
    pin_hash: String,
    failed_attempts: u8,
    locked_until: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaasPinStatus {
    pub configured: bool,
    pub locked_until: Option<i64>,
}

fn now_seconds() -> Result<i64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .map_err(|_| "Relógio local inválido para o controle de PIN.".to_string())
}

fn validate_profile(profile_id: &str) -> Result<(), String> {
    Uuid::parse_str(profile_id)
        .map(|_| ())
        .map_err(|_| "Perfil SaaS inválido.".to_string())
}

fn validate_pin(pin: &str) -> Result<&str, String> {
    let pin = pin.trim();
    if pin.len() != 6 || !pin.chars().all(|value| value.is_ascii_digit()) {
        return Err("O PIN SaaS deve conter exatamente seis dígitos numéricos.".to_string());
    }
    Ok(pin)
}

async fn device_id() -> Result<String, String> {
    let marker = carregar_marcador_dispositivo_saas().await?.ok_or_else(|| {
        "Esta instalação ainda não possui um dispositivo SaaS registrado.".to_string()
    })?;
    Ok(marker.device_id)
}

fn entry_for(device_id: &str, profile_id: &str) -> Result<Entry, String> {
    validate_profile(profile_id)?;
    Entry::new(SERVICE, &format!("{PREFIX}:{device_id}:{profile_id}"))
        .map_err(|_| "Não foi possível acessar o cofre seguro do sistema.".to_string())
}

fn index_entry_for(device_id: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, &format!("{INDEX_PREFIX}:{device_id}"))
        .map_err(|_| "Não foi possível acessar o cofre seguro do sistema.".to_string())
}

fn load(entry: &Entry) -> Result<Option<PinRecord>, String> {
    match entry.get_password() {
        Ok(value) => serde_json::from_str(&value)
            .map(Some)
            .map_err(|_| "O PIN local protegido está inválido.".to_string()),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err("Não foi possível acessar o cofre seguro do sistema.".to_string()),
    }
}

fn save(entry: &Entry, record: &PinRecord) -> Result<(), String> {
    let value = serde_json::to_string(record)
        .map_err(|_| "Não foi possível proteger o PIN.".to_string())?;
    entry
        .set_password(&value)
        .map_err(|_| "Não foi possível salvar o PIN no cofre seguro.".to_string())
}

fn load_index(device_id: &str) -> Result<Vec<String>, String> {
    let entry = index_entry_for(device_id)?;
    match entry.get_password() {
        Ok(value) => {
            let profiles: Vec<String> = serde_json::from_str(&value)
                .map_err(|_| "O índice local de perfis SaaS está inválido.".to_string())?;
            profiles
                .into_iter()
                .map(|profile_id| {
                    validate_profile(&profile_id)?;
                    Ok(profile_id)
                })
                .collect()
        }
        Err(KeyringError::NoEntry) => Ok(Vec::new()),
        Err(_) => Err("Não foi possível acessar o cofre seguro do sistema.".to_string()),
    }
}

fn save_index(device_id: &str, profiles: &[String]) -> Result<(), String> {
    let entry = index_entry_for(device_id)?;
    let value = serde_json::to_string(profiles)
        .map_err(|_| "Não foi possível atualizar o índice de perfis SaaS.".to_string())?;
    entry
        .set_password(&value)
        .map_err(|_| "Não foi possível salvar o índice no cofre seguro.".to_string())
}

fn delete_entry(entry: &Entry) -> Result<(), String> {
    match entry.delete_password() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err("Não foi possível remover o PIN local protegido.".to_string()),
    }
}

fn lock_seconds(failures: u8) -> i64 {
    // A quinta falha inicia em um minuto; reincidências escalam sem depender da memória do processo.
    60 * 2_i64.pow(u32::from(failures.saturating_sub(MAX_FAILURES).min(4)))
}

#[tauri::command]
pub async fn status_pin_perfil_saas(profile_id: String) -> Result<SaasPinStatus, String> {
    let record = load(&entry_for(&device_id().await?, &profile_id)?)?;
    let now = now_seconds()?;
    Ok(SaasPinStatus {
        configured: record.is_some(),
        locked_until: record
            .and_then(|value| (value.locked_until > now).then_some(value.locked_until)),
    })
}

#[tauri::command]
pub async fn configurar_pin_perfil_saas(profile_id: String, pin: String) -> Result<(), String> {
    let pin = validate_pin(&pin)?;
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(pin.as_bytes(), &salt)
        .map_err(|_| "Não foi possível proteger o PIN informado.".to_string())?
        .to_string();
    let device_id = device_id().await?;
    save(
        &entry_for(&device_id, &profile_id)?,
        &PinRecord {
            pin_hash: hash,
            failed_attempts: 0,
            locked_until: 0,
        },
    )?;
    let mut profiles = load_index(&device_id)?;
    if !profiles.contains(&profile_id) {
        profiles.push(profile_id);
        save_index(&device_id, &profiles)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn desbloquear_pin_perfil_saas(profile_id: String, pin: String) -> Result<(), String> {
    let pin = validate_pin(&pin)?;
    let entry = entry_for(&device_id().await?, &profile_id)?;
    let mut record = load(&entry)?
        .ok_or_else(|| "Este perfil não possui PIN local configurado nesta máquina.".to_string())?;
    let now = now_seconds()?;
    if record.locked_until > now {
        return Err(
            "Tentativas de PIN temporariamente bloqueadas. Tente novamente mais tarde.".to_string(),
        );
    }
    let valid = PasswordHash::new(&record.pin_hash)
        .ok()
        .and_then(|hash| {
            Argon2::default()
                .verify_password(pin.as_bytes(), &hash)
                .ok()
        })
        .is_some();
    if valid {
        record.failed_attempts = 0;
        record.locked_until = 0;
        return save(&entry, &record);
    }
    record.failed_attempts = record.failed_attempts.saturating_add(1);
    if record.failed_attempts >= MAX_FAILURES {
        record.locked_until = now + lock_seconds(record.failed_attempts);
    }
    save(&entry, &record)?;
    Err("PIN inválido.".to_string())
}

#[tauri::command]
pub async fn remover_pin_perfil_saas(profile_id: String) -> Result<(), String> {
    let device_id = device_id().await?;
    delete_entry(&entry_for(&device_id, &profile_id)?)?;
    let profiles = load_index(&device_id)?
        .into_iter()
        .filter(|stored_id| stored_id != &profile_id)
        .collect::<Vec<_>>();
    save_index(&device_id, &profiles)
}

/// Remove verificadores e contadores locais de perfis que deixaram de estar ativos na nuvem.
#[tauri::command]
pub async fn sincronizar_pins_perfis_saas(profile_ids: Vec<String>) -> Result<(), String> {
    for profile_id in &profile_ids {
        validate_profile(profile_id)?;
    }
    let device_id = device_id().await?;
    let allowed = profile_ids
        .into_iter()
        .collect::<std::collections::HashSet<_>>();
    let stored = load_index(&device_id)?;
    for profile_id in &stored {
        if !allowed.contains(profile_id) {
            delete_entry(&entry_for(&device_id, profile_id)?)?;
        }
    }
    let retained = stored
        .into_iter()
        .filter(|profile_id| allowed.contains(profile_id))
        .collect::<Vec<_>>();
    save_index(&device_id, &retained)
}

/// Limpa todos os segredos SaaS deste dispositivo antes de remover o marcador local.
pub async fn remover_todos_pins_saas_do_dispositivo(device_id: &str) -> Result<(), String> {
    let stored = load_index(device_id)?;
    for profile_id in &stored {
        delete_entry(&entry_for(device_id, profile_id)?)?;
    }
    delete_entry(&index_entry_for(device_id)?)
}

#[cfg(test)]
mod tests {
    use super::{lock_seconds, validate_pin};
    #[test]
    fn accepts_exactly_six_digits() {
        assert!(validate_pin("123456").is_ok());
        assert!(validate_pin("12345").is_err());
    }
    #[test]
    fn lockout_grows_after_fifth_failure() {
        assert_eq!(lock_seconds(5), 60);
        assert!(lock_seconds(6) > lock_seconds(5));
    }
}
