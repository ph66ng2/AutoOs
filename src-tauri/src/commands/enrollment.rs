use crate::commands::auth::{
    record_security_event, require_permission, PERMISSION_MANAGE_PROFILES,
};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use keyring::Entry;
use rand::Rng;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{error, info, instrument};

const KEYRING_SERVICE: &str = "autoos";
const KEYRING_USER: &str = "supabase_config";

/// Character set for enrollment codes: uppercase alphanumeric without ambiguous chars.
/// Excludes: 0 (zero), O (letter O), 1 (one), I (letter I).
const CODE_CHARSET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH: usize = 12;

/// Default empresa_id for single-tenant (BMITAG).
const DEFAULT_EMPRESA_ID: &str = "00000000-0000-0000-0000-000000000001";

#[derive(Debug, Serialize, Deserialize)]
struct SupabaseConfig {
    supabase_url: String,
    service_role_key: String,
}

/// Resolves Supabase configuration:
/// 1. Environment variables `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
/// 2. Fallback: keyring entry `autoos/supabase_config` (JSON)
fn get_supabase_config() -> Result<SupabaseConfig, String> {
    let env_url = std::env::var("SUPABASE_URL").ok();
    let env_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY").ok();

    if let (Some(supabase_url), Some(service_role_key)) = (env_url, env_key) {
        return Ok(SupabaseConfig {
            supabase_url,
            service_role_key,
        });
    }

    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| {
        error!("Erro ao acessar keyring do Supabase: {}", e);
        e.to_string()
    })?;

    let json = entry.get_password().map_err(|_| {
        "Configuração do Supabase não encontrada. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ou salve no keyring.".to_string()
    })?;

    serde_json::from_str(&json).map_err(|e| {
        error!("Erro ao deserializar configuração do Supabase: {}", e);
        format!("Configuração do Supabase inválida: {}", e)
    })
}

/// Generates a random 12-char enrollment code using the unambiguous charset.
fn generate_code() -> String {
    let mut rng = rand::thread_rng();
    (0..CODE_LENGTH)
        .map(|_| {
            let idx = rng.gen_range(0..CODE_CHARSET.len());
            CODE_CHARSET[idx] as char
        })
        .collect()
}

/// Hashes an enrollment code with Argon2 (same algorithm used for PINs).
fn hash_code(code: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(code.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| {
            error!("Erro ao gerar hash Argon2 do código de enrollment: {}", e);
            "Erro ao proteger o código de enrollment".to_string()
        })
}

/// Builds a reqwest HTTP client with a 15-second timeout.
fn build_client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| {
            error!("Erro ao criar cliente HTTP: {}", e);
            format!("Erro ao criar cliente HTTP: {}", e)
        })
}

/// Shared auth headers for Supabase REST API.
fn supabase_headers(config: &SupabaseConfig) -> Vec<(&str, String)> {
    vec![
        ("apikey", config.service_role_key.clone()),
        ("Authorization", format!("Bearer {}", config.service_role_key)),
        ("Content-Type", "application/json".to_string()),
    ]
}

// ─── IPC Commands ────────────────────────────────────────────────────────────

/// Generates a new enrollment code for device/tenant provisioning.
///
/// Only admin profiles (with MANAGE_PROFILES permission) can call this.
/// The plaintext code is returned once and should be shared securely with the
/// technician who will use it to set up their machine's PIN.
#[tauri::command]
#[instrument(skip_all)]
pub async fn generate_enrollment_code() -> Result<String, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    let config = get_supabase_config()?;

    let code = generate_code();
    let code_hash = hash_code(&code)?;

    let client = build_client()?;
    let url = format!(
        "{}/rest/v1/enrollment_codes",
        config.supabase_url.trim_end_matches('/')
    );

    let payload = serde_json::json!({
        "code_hash": code_hash,
        "empresa_id": DEFAULT_EMPRESA_ID,
    });

    let response = client
        .post(&url)
        .header("apikey", &config.service_role_key)
        .header(
            "Authorization",
            format!("Bearer {}", &config.service_role_key),
        )
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&payload)
        .send()
        .await
        .map_err(|e| {
            error!("Erro ao inserir enrollment code no Supabase: {}", e);
            format!("Erro ao comunicar com Supabase: {}", e)
        })?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        error!("Supabase retornou {} ao inserir enrollment code: {}", status, body);
        return Err(format!("Erro ao gerar código de enrollment: {}", body));
    }

    record_security_event(
        "ENROLLMENT_CODE_GENERATED",
        Some(&actor),
        format!("profile_id={}; empresa_id={}", actor.id, DEFAULT_EMPRESA_ID),
        true,
    )
    .await;

    info!("Código de enrollment gerado com sucesso (profile_id={})", actor.id);
    Ok(code)
}

/// Validates an enrollment code against unused codes stored in Supabase.
///
/// If a match is found, the code is marked as used (single-use) and the
/// associated `empresa_id` + `enrollment_id` are returned so the frontend
/// can proceed with PIN setup.
///
/// This command does NOT require an active session — it is called during
/// the initial device provisioning flow before any PIN is configured.
#[tauri::command]
#[instrument(skip_all)]
pub async fn validate_enrollment_code(code: String) -> Result<serde_json::Value, String> {
    let config = get_supabase_config()?;
    let code = code.trim().to_uppercase();

    if code.is_empty() || code.len() != CODE_LENGTH {
        return Err("Código de enrollment inválido".to_string());
    }

    // Validate charset: only unambiguous uppercase alphanumeric
    if !code
        .chars()
        .all(|c| CODE_CHARSET.contains(&(c as u8)))
    {
        return Err("Código de enrollment inválido".to_string());
    }

    let client = build_client()?;
    let base_url = config.supabase_url.trim_end_matches('/');

    // Fetch all unused enrollment codes from Supabase
    let fetch_url = format!("{}/rest/v1/enrollment_codes", base_url);

    let response = client
        .get(&fetch_url)
        .header("apikey", &config.service_role_key)
        .header(
            "Authorization",
            format!("Bearer {}", &config.service_role_key),
        )
        .query(&[
            ("used", "is.false"),
            ("select", "id,code_hash,empresa_id"),
        ])
        .send()
        .await
        .map_err(|e| {
            error!("Erro ao buscar enrollment codes no Supabase: {}", e);
            format!("Erro ao comunicar com Supabase: {}", e)
        })?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        error!("Supabase retornou {} ao buscar enrollment codes: {}", status, body);
        return Err(format!(
            "Erro ao buscar códigos de enrollment (HTTP {}): {}",
            status, body
        ));
    }

    let codes: Vec<serde_json::Value> = response.json().await.map_err(|e| {
        error!("Erro ao parsear resposta do Supabase: {}", e);
        format!("Erro ao processar resposta do Supabase: {}", e)
    })?;

    if codes.is_empty() {
        return Err("Código de enrollment inválido ou já utilizado".to_string());
    }

    // Iterate over unused codes, verify each against the plaintext input
    for entry in &codes {
        let code_hash = match entry["code_hash"].as_str() {
            Some(h) => h,
            None => continue,
        };

        let parsed = match PasswordHash::new(code_hash) {
            Ok(p) => p,
            Err(_) => continue,
        };

        let is_match = Argon2::default()
            .verify_password(code.as_bytes(), &parsed)
            .is_ok();

        if is_match {
            // Match found — mark as used atomically
            let entry_id = match entry["id"].as_str() {
                Some(id) => id,
                None => {
                    error!("Enrollment code sem campo 'id' na resposta do Supabase");
                    continue;
                }
            };

            let empresa_id = entry["empresa_id"].clone();

            let patch_url = format!(
                "{}/rest/v1/enrollment_codes?id=eq.{}",
                base_url, entry_id
            );

            let patch_response = client
                .patch(&patch_url)
                .header("apikey", &config.service_role_key)
                .header(
                    "Authorization",
                    format!("Bearer {}", &config.service_role_key),
                )
                .header("Content-Type", "application/json")
                .header("Prefer", "return=minimal")
                .json(&serde_json::json!({
                    "used": true,
                    "used_at": chrono::Utc::now().to_rfc3339(),
                }))
                .send()
                .await
                .map_err(|e| {
                    error!("Erro ao marcar enrollment code como usado: {}", e);
                    format!("Erro ao atualizar código no Supabase: {}", e)
                })?;

            if !patch_response.status().is_success() {
                let body = patch_response.text().await.unwrap_or_default();
                error!("Supabase PATCH retornou erro: {}", body);
                return Err(format!("Erro ao marcar código como usado: {}", body));
            }

            info!(
                "Código de enrollment validado com sucesso (enrollment_id={})",
                entry_id
            );

            return Ok(serde_json::json!({
                "empresa_id": empresa_id,
                "enrollment_id": entry_id,
            }));
        }
    }

    Err("Código de enrollment inválido ou já utilizado".to_string())
}
