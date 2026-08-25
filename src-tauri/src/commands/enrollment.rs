//! Enrollment is mediated by the SaaS backend.
//!
//! The desktop client never talks to Supabase with an administrative key. It
//! sends a one-time enrollment code (or a locally generated Argon2 hash) to a
//! server endpoint. The server owns the tenant association and performs the
//! privileged database write with its own server-side credentials.

use crate::commands::auth::{
    record_security_event, require_permission, PERMISSION_MANAGE_PROFILES,
};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use keyring::Entry;
use rand::Rng;
use reqwest::{Client, RequestBuilder, StatusCode};
use serde::Serialize;
use tracing::{error, info, instrument};

const SAAS_API_URL_ENV: &str = "AUTOOS_SAAS_API_URL";
const KEYRING_SERVICE: &str = "autoos";
const ACCESS_TOKEN_KEYRING_USER: &str = "saas_access_token";

/// Character set for enrollment codes: uppercase alphanumeric without ambiguous chars.
/// Excludes: 0 (zero), O (letter O), 1 (one), I (letter I).
const CODE_CHARSET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH: usize = 12;

#[derive(Debug, Serialize)]
struct GenerateEnrollmentRequest {
    code_hash: String,
}

#[derive(Debug, Serialize)]
struct ValidateEnrollmentRequest<'a> {
    code: &'a str,
}

fn server_url() -> Result<String, String> {
    let value = std::env::var(SAAS_API_URL_ENV).map_err(|_| {
        format!(
            "Backend SaaS não configurado. Defina {} no ambiente de operações.",
            SAAS_API_URL_ENV
        )
    })?;
    let url = value.trim().trim_end_matches('/');
    if !(url.starts_with("https://") || url.starts_with("http://localhost")) {
        return Err(
            "AUTOOS_SAAS_API_URL deve usar HTTPS (exceto localhost em desenvolvimento)".to_string(),
        );
    }
    if url.len() <= "https://".len() {
        return Err("AUTOOS_SAAS_API_URL está vazio".to_string());
    }
    Ok(url.to_string())
}

fn access_token() -> Result<String, String> {
    let entry = Entry::new(KEYRING_SERVICE, ACCESS_TOKEN_KEYRING_USER).map_err(|e| {
        error!("Erro ao acessar sessão SaaS no keyring: {}", e);
        "Sessão SaaS indisponível; faça login novamente".to_string()
    })?;

    entry.get_password().map_err(|_| {
        "Sessão SaaS indisponível; faça login novamente antes de gerar um enrollment".to_string()
    })
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Erro ao criar cliente HTTP: {}", e))
}

fn authenticated_request(request: RequestBuilder, token: &str) -> RequestBuilder {
    request
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
}

async fn response_error(response: reqwest::Response, operation: &str) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    error!(
        "Backend SaaS retornou {} em {}: {}",
        status, operation, body
    );
    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        return format!(
            "Sessão sem permissão para {}. Faça login novamente.",
            operation
        );
    }
    format!("Falha em {} (HTTP {}): {}", operation, status, body)
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

/// Hashes an enrollment code before it leaves the desktop process.
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

// ─── IPC Commands ────────────────────────────────────────────────────────────

/// Generates an enrollment code through the SaaS backend.
///
/// The backend derives the tenant from the authenticated user's claims. The
/// desktop sends no empresa_id and stores no administrative credential.
#[tauri::command]
#[instrument(skip_all)]
pub async fn generate_enrollment_code() -> Result<String, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    let base_url = server_url()?;
    let token = access_token()?;
    let code = generate_code();
    let code_hash = hash_code(&code)?;
    let client = build_client()?;

    let response = authenticated_request(
        client.post(format!("{}/v1/enrollment-codes", base_url)),
        &token,
    )
    .json(&GenerateEnrollmentRequest { code_hash })
    .send()
    .await
    .map_err(|e| format!("Erro ao comunicar com o backend SaaS: {}", e))?;

    if !response.status().is_success() {
        return Err(response_error(response, "gerar código de enrollment").await);
    }

    record_security_event(
        "ENROLLMENT_CODE_GENERATED",
        Some(&actor),
        format!("profile_id={}", actor.id),
        true,
    )
    .await;

    info!(
        "Código de enrollment gerado pelo backend (profile_id={})",
        actor.id
    );
    Ok(code)
}

/// Validates a one-time enrollment code through the SaaS backend.
///
/// The code is the one-time bootstrap credential, so the initial device flow
/// does not require a privileged key or a pre-existing user JWT. The backend
/// atomically consumes the code and returns the tenant/enrollment identity.
#[tauri::command]
#[instrument(skip_all)]
pub async fn validate_enrollment_code(code: String) -> Result<serde_json::Value, String> {
    let normalized = code.trim().to_uppercase();
    if normalized.len() != CODE_LENGTH
        || !normalized
            .chars()
            .all(|character| CODE_CHARSET.contains(&(character as u8)))
    {
        return Err("Código de enrollment inválido".to_string());
    }

    let base_url = server_url()?;
    let client = build_client()?;
    let response = client
        .post(format!("{}/v1/enrollment-codes/validate", base_url))
        .header("Content-Type", "application/json")
        .json(&ValidateEnrollmentRequest { code: &normalized })
        .send()
        .await
        .map_err(|e| format!("Erro ao comunicar com o backend SaaS: {}", e))?;

    if !response.status().is_success() {
        return Err(response_error(response, "validar código de enrollment").await);
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Resposta inválida do backend SaaS: {}", e))
}
