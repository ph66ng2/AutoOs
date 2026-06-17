use crate::db::get_pool;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{DateTime, Duration, Utc};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, Row};
use std::collections::{BTreeSet, HashMap};
use std::sync::{Mutex, OnceLock};
use tracing::{debug, error, instrument, warn};

const KEYRING_SERVICE: &str = "autoos";
const LEGACY_KEYRING_USER: &str = "sensitive_access_pin";
const PROFILE_KEYRING_PREFIX: &str = "sensitive_access_profile_";
const SESSION_TIMEOUT_MINUTES: i64 = 15;
const MAX_UNLOCK_ATTEMPTS: u32 = 5;
const LOCKOUT_DURATION_MINUTES: i64 = 15;

pub const PERMISSION_CONFIG_SMTP: &str = "CONFIG_SMTP";
pub const PERMISSION_CONFIG_WHATSAPP: &str = "CONFIG_WHATSAPP";
pub const PERMISSION_DELETE_RECORDS: &str = "DELETE_RECORDS";
pub const PERMISSION_FINANCIAL_ACTIONS: &str = "FINANCIAL_ACTIONS";
pub const PERMISSION_STOCK_CONTROL: &str = "STOCK_CONTROL";
pub const PERMISSION_MANAGE_PROFILES: &str = "MANAGE_PROFILES";
pub const PERMISSION_VIEW_EXPENSES: &str = "VIEW_EXPENSES";

const ALL_PERMISSIONS: [&str; 7] = [
    PERMISSION_CONFIG_SMTP,
    PERMISSION_CONFIG_WHATSAPP,
    PERMISSION_DELETE_RECORDS,
    PERMISSION_FINANCIAL_ACTIONS,
    PERMISSION_STOCK_CONTROL,
    PERMISSION_MANAGE_PROFILES,
    PERMISSION_VIEW_EXPENSES,
];

static SENSITIVE_SESSION: OnceLock<Mutex<SensitiveSession>> = OnceLock::new();
static UNLOCK_ATTEMPTS: OnceLock<Mutex<HashMap<i32, UnlockAttemptTracker>>> = OnceLock::new();

#[derive(Debug, Default, Clone)]
struct UnlockAttemptTracker {
    failed_attempts: u32,
    locked_until: Option<DateTime<Utc>>,
}

#[derive(Debug, Default, Clone)]
struct SensitiveSession {
    unlocked_until: Option<DateTime<Utc>>,
    profile_obfuscated: Option<Vec<u8>>,
    profile_key: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SecurityProfileSummary {
    pub id: i32,
    pub nome: String,
    pub role: String,
    pub permissions: Vec<String>,
    pub pin_configured: bool,
    pub is_default: bool,
    pub ativo: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum PermissionGateFailure {
    SessionLocked,
    MissingPermission(SecurityProfileSummary),
}

#[derive(Debug, Serialize)]
pub struct SensitiveAccessStatus {
    pub pin_configured: bool,
    pub unlocked: bool,
    pub expires_at: Option<String>,
    pub active_profile_id: Option<i32>,
    pub active_profile_name: Option<String>,
    pub active_role: Option<String>,
    pub permissions: Vec<String>,
    pub can_manage_profiles: bool,
    pub profiles: Vec<SecurityProfileSummary>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SecurityAuditEventRow {
    pub id: i32,
    pub event_type: String,
    pub profile_id: Option<i32>,
    pub profile_name: Option<String>,
    pub details: Option<String>,
    pub success: bool,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct SecurityProfileInput {
    pub nome: String,
    pub role: String,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredSensitivePin {
    pin_hash: String,
    created_at: String,
}

#[derive(Debug, Clone, FromRow)]
struct SecurityProfileRecord {
    id: i32,
    nome: String,
    role: String,
    permissions: String,
    ativo: bool,
    is_default: bool,
}

fn session_state() -> &'static Mutex<SensitiveSession> {
    SENSITIVE_SESSION.get_or_init(|| Mutex::new(SensitiveSession::default()))
}

fn get_keyring_entry(user: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, user).map_err(|e| {
        error!("Erro ao criar entrada keyring do acesso sensível: {}", e);
        e.to_string()
    })
}

fn profile_keyring_user(profile_id: i32) -> String {
    format!("{}{}", PROFILE_KEYRING_PREFIX, profile_id)
}

const PIN_SALT: &str = "autoos_pin_salt_v2_7a3b9c1d";

fn unlock_attempts() -> &'static Mutex<HashMap<i32, UnlockAttemptTracker>> {
    UNLOCK_ATTEMPTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn check_unlock_lockout(profile_id: i32) -> Result<(), String> {
    let mut attempts = unlock_attempts()
        .lock()
        .map_err(|_| "Controle de tentativas de PIN indisponível".to_string())?;
    let tracker = attempts.entry(profile_id).or_default();

    if let Some(locked_until) = tracker.locked_until {
        if locked_until > Utc::now() {
            let minutes = (locked_until - Utc::now()).num_minutes().max(1);
            return Err(format!(
                "Muitas tentativas inválidas. Tente novamente em {} minuto(s).",
                minutes
            ));
        }
        tracker.failed_attempts = 0;
        tracker.locked_until = None;
    }

    Ok(())
}

fn record_unlock_failure(profile_id: i32) {
    if let Ok(mut attempts) = unlock_attempts().lock() {
        let tracker = attempts.entry(profile_id).or_default();
        tracker.failed_attempts += 1;
        if tracker.failed_attempts >= MAX_UNLOCK_ATTEMPTS {
            tracker.locked_until = Some(Utc::now() + Duration::minutes(LOCKOUT_DURATION_MINUTES));
        }
    }
}

fn reset_unlock_attempts(profile_id: i32) {
    if let Ok(mut attempts) = unlock_attempts().lock() {
        attempts.remove(&profile_id);
    }
}

fn hash_pin_argon2(pin: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(pin.trim().as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| {
            error!("Erro ao gerar hash Argon2 do PIN: {}", error);
            "Erro ao proteger o PIN informado".to_string()
        })
}

fn hash_pin_salted(pin: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(pin.as_bytes());
    hasher.update(PIN_SALT.as_bytes());
    hex::encode(hasher.finalize())
}

fn hash_pin_unsalted(pin: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(pin.as_bytes());
    hex::encode(hasher.finalize())
}

fn verify_pin(pin: &str, stored: &StoredSensitivePin) -> bool {
    let trimmed = pin.trim();
    if stored.pin_hash.starts_with("$argon2") {
        if let Ok(parsed) = PasswordHash::new(&stored.pin_hash) {
            return Argon2::default()
                .verify_password(trimmed.as_bytes(), &parsed)
                .is_ok();
        }
        return false;
    }
    if stored.pin_hash == hash_pin_salted(trimmed) {
        return true;
    }
    if stored.pin_hash == hash_pin_unsalted(trimmed) {
        return true;
    }
    false
}

fn hash_pin(pin: &str) -> Result<String, String> {
    hash_pin_argon2(pin)
}

fn upgrade_pin_hash_if_legacy(profile_id: i32, pin: &str, stored: &StoredSensitivePin) -> Result<(), String> {
    if stored.pin_hash.starts_with("$argon2") {
        return Ok(());
    }

    store_profile_pin(profile_id, pin)
}

fn validate_pin_format(pin: &str) -> Result<(), String> {
    let trimmed = pin.trim();
    if !(4..=8).contains(&trimmed.len()) || !trimmed.chars().all(|character| character.is_ascii_digit()) {
        return Err("PIN deve conter entre 4 e 8 dígitos numéricos".to_string());
    }

    Ok(())
}

fn normalize_role(role: &str) -> Result<String, String> {
    let trimmed = role.trim();
    if trimmed.is_empty() {
        return Err("Perfil deve informar um papel válido".to_string());
    }

    Ok(trimmed
        .chars()
        .map(|character| match character {
            'a'..='z' => character.to_ascii_uppercase(),
            'A'..='Z' | '0'..='9' => character,
            ' ' | '-' => '_',
            '_' => character,
            _ => '_',
        })
        .collect())
}

fn normalize_permissions(role: &str, permissions: &[String]) -> Result<Vec<String>, String> {
    if role == "ADMIN" {
        return Ok(ALL_PERMISSIONS.iter().map(|permission| permission.to_string()).collect());
    }

    let mut normalized = BTreeSet::new();
    for permission in permissions {
        let candidate = permission.trim().to_uppercase();
        if !ALL_PERMISSIONS.contains(&candidate.as_str()) {
            return Err(format!("Permissão inválida: {}", permission));
        }
        normalized.insert(candidate);
    }

    if normalized.is_empty() {
        return Err("Selecione ao menos uma permissão para o perfil".to_string());
    }

    Ok(normalized.into_iter().collect())
}

fn parse_permissions(raw: &str) -> Result<Vec<String>, String> {
    serde_json::from_str::<Vec<String>>(raw).map_err(|e| {
        error!("Erro ao deserializar permissões de segurança: {}", e);
        e.to_string()
    })
}

fn load_stored_pin_by_user(user: &str) -> Result<Option<StoredSensitivePin>, String> {
    let entry = get_keyring_entry(user)?;
    let json = match entry.get_password() {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };

    serde_json::from_str(&json).map(Some).map_err(|e| {
        error!("Erro ao deserializar PIN do acesso sensível: {}", e);
        e.to_string()
    })
}

fn load_profile_pin(profile_id: i32) -> Result<Option<StoredSensitivePin>, String> {
    load_stored_pin_by_user(&profile_keyring_user(profile_id))
}

fn load_legacy_pin() -> Result<Option<StoredSensitivePin>, String> {
    load_stored_pin_by_user(LEGACY_KEYRING_USER)
}

fn store_profile_pin_record(profile_id: i32, record: &StoredSensitivePin) -> Result<(), String> {
    let entry = get_keyring_entry(&profile_keyring_user(profile_id))?;
    let json = serde_json::to_string(record).map_err(|e| {
        error!("Erro ao serializar PIN do acesso sensível: {}", e);
        e.to_string()
    })?;

    entry.set_password(&json).map_err(|e| {
        error!("Erro ao salvar PIN do acesso sensível: {}", e);
        e.to_string()
    })
}

fn store_profile_pin(profile_id: i32, pin: &str) -> Result<(), String> {
    let stored = StoredSensitivePin {
        pin_hash: hash_pin(pin.trim())?,
        created_at: Utc::now().to_rfc3339(),
    };

    store_profile_pin_record(profile_id, &stored)
}

async fn any_profile_has_pin() -> Result<bool, String> {
    for profile in fetch_profile_records().await? {
        if load_profile_pin(profile.id)?.is_some() {
            return Ok(true);
        }
    }

    Ok(false)
}

fn has_permission_values(permissions: &[String], permission: &str) -> bool {
    permissions.iter().any(|value| value == permission)
}

fn has_permission(profile: &SecurityProfileSummary, permission: &str) -> bool {
    profile.role == "ADMIN" || has_permission_values(&profile.permissions, permission)
}

fn evaluate_permission_gate(
    profile: Option<SecurityProfileSummary>,
    permission: &str,
) -> Result<SecurityProfileSummary, PermissionGateFailure> {
    let profile = profile.ok_or(PermissionGateFailure::SessionLocked)?;
    if has_permission(&profile, permission) {
        Ok(profile)
    } else {
        Err(PermissionGateFailure::MissingPermission(profile))
    }
}

fn spawn_security_event(
    event_type: &'static str,
    profile: Option<SecurityProfileSummary>,
    details: String,
    success: bool,
) {
    tauri::async_runtime::spawn(async move {
        record_security_event(event_type, profile.as_ref(), details, success).await;
    });
}

fn generate_session_key() -> Vec<u8> {
    let entropy = format!(
        "{}{}",
        Utc::now().timestamp_nanos_opt().unwrap_or(0),
        std::process::id()
    );
    let mut hasher = Sha256::new();
    hasher.update(entropy.as_bytes());
    hasher.finalize().to_vec()
}

fn obfuscate_profile(profile: &SecurityProfileSummary, key: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
    let plain = serde_json::to_vec(profile).map_err(|e| {
        error!("Erro ao serializar perfil para sessão: {}", e);
        e.to_string()
    })?;
    let obfuscated: Vec<u8> = plain.iter().enumerate().map(|(i, byte)| byte ^ key[i % key.len()]).collect();
    Ok((obfuscated, key.to_vec()))
}

fn deobfuscate_profile(data: &[u8], key: &[u8]) -> Result<SecurityProfileSummary, String> {
    let plain: Vec<u8> = data.iter().enumerate().map(|(i, byte)| byte ^ key[i % key.len()]).collect();
    serde_json::from_slice(&plain).map_err(|e| {
        error!("Erro ao deserializar perfil da sessão: {}", e);
        e.to_string()
    })
}

fn clear_session() -> Result<(), String> {
    let mut session = session_state().lock().map_err(|_| "Sessão sensível indisponível".to_string())?;
    session.unlocked_until = None;
    session.profile_obfuscated = None;
    session.profile_key = None;
    Ok(())
}

fn current_session_profile() -> Result<Option<(DateTime<Utc>, SecurityProfileSummary)>, String> {
    let mut session = session_state().lock().map_err(|_| "Sessão sensível indisponível".to_string())?;
    match (session.unlocked_until, session.profile_obfuscated.clone(), session.profile_key.clone()) {
        (Some(until), Some(data), Some(key)) if until > Utc::now() => {
            match deobfuscate_profile(&data, &key) {
                Ok(profile) => Ok(Some((until, profile))),
                Err(_) => {
                    session.unlocked_until = None;
                    session.profile_obfuscated = None;
                    session.profile_key = None;
                    Ok(None)
                }
            }
        },
        _ => {
            session.unlocked_until = None;
            session.profile_obfuscated = None;
            session.profile_key = None;
            Ok(None)
        }
    }
}

fn unlock_session(profile: SecurityProfileSummary) -> Result<(), String> {
    let expires_at = Utc::now() + Duration::minutes(SESSION_TIMEOUT_MINUTES);
    let key = generate_session_key();
    let (obfuscated, key) = obfuscate_profile(&profile, &key)?;
    let mut session = session_state().lock().map_err(|_| "Sessão sensível indisponível".to_string())?;
    session.unlocked_until = Some(expires_at);
    session.profile_obfuscated = Some(obfuscated);
    session.profile_key = Some(key);
    Ok(())
}

pub fn touch_sensitive_access() -> Result<(), String> {
    let mut session = session_state().lock().map_err(|_| "Sessão sensível indisponível".to_string())?;
    match (session.unlocked_until, session.profile_obfuscated.clone(), session.profile_key.clone()) {
        (Some(until), Some(_), Some(_)) if until > Utc::now() => {
            session.unlocked_until = Some(Utc::now() + Duration::minutes(SESSION_TIMEOUT_MINUTES));
            Ok(())
        }
        _ => {
            session.unlocked_until = None;
            session.profile_obfuscated = None;
            session.profile_key = None;
            Err("Acesso sensível bloqueado. Informe o PIN para continuar.".to_string())
        }
    }
}

pub fn require_sensitive_access() -> Result<SecurityProfileSummary, String> {
    let (_, profile) = match current_session_profile()? {
        Some(current) => current,
        None => {
            spawn_security_event(
                "SENSITIVE_ACCESS_DENIED",
                None,
                "Sessão sensível bloqueada".to_string(),
                false,
            );
            return Err("Acesso sensível bloqueado. Informe o PIN para continuar.".to_string());
        }
    };
    touch_sensitive_access()?;
    Ok(profile)
}

pub fn require_permission(permission: &str) -> Result<SecurityProfileSummary, String> {
    let profile = evaluate_permission_gate(Some(require_sensitive_access()?), permission)
    .map_err(|failure| match failure {
        PermissionGateFailure::SessionLocked => {
            spawn_security_event(
                "SENSITIVE_ACCESS_DENIED",
                None,
                format!("permission={}", permission),
                false,
            );
            "Acesso sensível bloqueado. Informe o PIN para continuar.".to_string()
        }
        PermissionGateFailure::MissingPermission(profile) => {
            let profile_name = profile.nome.clone();
            spawn_security_event(
                "PERMISSION_DENIED",
                Some(profile),
                format!("permission={}", permission),
                false,
            );
            format!(
                "Perfil {} não possui permissão necessária para esta ação.",
                profile_name
            )
        }
    })?;

    touch_sensitive_access()?;
    Ok(profile)
}

async fn ensure_default_profile_exists() -> Result<(), String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let row = sqlx::query("SELECT COUNT(*) AS total FROM security_profiles WHERE ativo = true")
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao contar perfis de segurança: {}", e);
            e.to_string()
        })?;

    let total: i64 = row.try_get("total").map_err(|e| e.to_string())?;
    if total == 0 {
        let permissions = serde_json::to_string(&ALL_PERMISSIONS.iter().map(|value| value.to_string()).collect::<Vec<_>>())
            .map_err(|e| e.to_string())?;
        sqlx::query(
            "INSERT INTO security_profiles (nome, role, permissions, is_default) VALUES ($1, $2, $3, true)"
        )
        .bind("Administrador Local")
        .bind("ADMIN")
        .bind(permissions)
        .execute(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao recriar perfil administrador padrão: {}", e);
            e.to_string()
        })?;
    }

    let default_row = sqlx::query("SELECT COUNT(*) AS total FROM security_profiles WHERE ativo = true AND is_default = true")
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let default_total: i64 = default_row.try_get("total").map_err(|e| e.to_string())?;
    if default_total == 0 {
        sqlx::query(
            "UPDATE security_profiles SET is_default = CASE WHEN id = (
                SELECT id FROM security_profiles WHERE ativo = true ORDER BY id ASC LIMIT 1
            ) THEN true ELSE false END"
        )
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

async fn fetch_profile_records_with_scope(include_inactive: bool) -> Result<Vec<SecurityProfileRecord>, String> {
    ensure_default_profile_exists().await?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let mut query_builder = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        "SELECT id, nome, role, permissions, ativo, is_default FROM security_profiles",
    );

    if !include_inactive {
        query_builder.push(" WHERE ativo = true");
    }

    query_builder.push(" ORDER BY ativo DESC, is_default DESC, nome ASC");

    query_builder
        .build_query_as::<SecurityProfileRecord>()
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao listar perfis de segurança: {}", e);
            e.to_string()
        })
}

async fn fetch_profile_records() -> Result<Vec<SecurityProfileRecord>, String> {
    fetch_profile_records_with_scope(false).await
}

async fn fetch_active_profile_record() -> Result<SecurityProfileRecord, String> {
    let mut profiles = fetch_profile_records().await?;
    profiles
        .iter()
        .find(|profile| profile.is_default)
        .cloned()
        .or_else(|| profiles.drain(..).next())
        .ok_or_else(|| "Nenhum perfil de segurança ativo encontrado".to_string())
}

async fn fetch_profile_record_by_id(profile_id: i32) -> Result<SecurityProfileRecord, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    sqlx::query_as::<_, SecurityProfileRecord>(
        "SELECT id, nome, role, permissions, ativo, is_default
         FROM security_profiles
         WHERE id = $1 AND ativo = true"
    )
    .bind(profile_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao buscar perfil de segurança {}: {}", profile_id, e);
        e.to_string()
    })?
    .ok_or_else(|| "Perfil de segurança não encontrado".to_string())
}

async fn fetch_profile_record_by_id_any(profile_id: i32) -> Result<SecurityProfileRecord, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    sqlx::query_as::<_, SecurityProfileRecord>(
        "SELECT id, nome, role, permissions, ativo, is_default
         FROM security_profiles
         WHERE id = $1"
    )
    .bind(profile_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao buscar perfil de segurança {}: {}", profile_id, e);
        e.to_string()
    })?
    .ok_or_else(|| "Perfil de segurança não encontrado".to_string())
}

async fn ensure_legacy_pin_migrated(profile_id: i32) -> Result<(), String> {
    if load_profile_pin(profile_id)?.is_some() {
        return Ok(());
    }

    if let Some(legacy_pin) = load_legacy_pin()? {
        store_profile_pin_record(profile_id, &legacy_pin)?;
    }

    Ok(())
}

fn to_profile_summary(record: SecurityProfileRecord) -> Result<SecurityProfileSummary, String> {
    let parsed_permissions = parse_permissions(&record.permissions)?;
    let permissions = normalize_permissions(&record.role, &parsed_permissions)?;
    Ok(SecurityProfileSummary {
        id: record.id,
        nome: record.nome,
        role: record.role,
        permissions,
        pin_configured: load_profile_pin(record.id)?.is_some(),
        is_default: record.is_default,
        ativo: record.ativo,
    })
}

pub(crate) async fn record_security_event(
    event_type: &str,
    profile: Option<&SecurityProfileSummary>,
    details: impl Into<String>,
    success: bool,
) {
    let details = details.into();
    match get_pool().await {
        Ok(pool) => {
            let result = sqlx::query(
                "INSERT INTO security_audit_log (event_type, profile_id, profile_name, details, success)
                 VALUES ($1, $2, $3, $4, $5)"
            )
            .bind(event_type)
            .bind(profile.map(|value| value.id))
            .bind(profile.map(|value| value.nome.clone()))
            .bind(if details.trim().is_empty() { None } else { Some(details) })
            .bind(success)
            .execute(&pool)
            .await;

            if let Err(error_value) = result {
                warn!("Falha ao registrar evento de auditoria {}: {}", event_type, error_value);
            }
        }
        Err(error_value) => {
            warn!("Falha ao obter pool para auditoria {}: {}", event_type, error_value);
        }
    }
}

async fn count_manager_profiles_excluding(profile_id: i32) -> Result<i64, String> {
    let profiles = fetch_profile_records().await?;
    Ok(profiles
        .into_iter()
        .filter(|profile| profile.id != profile_id)
        .filter_map(|profile| to_profile_summary(profile).ok())
        .filter(|profile| has_permission(profile, PERMISSION_MANAGE_PROFILES))
        .count() as i64)
}

async fn count_active_profiles_excluding(profile_id: i32) -> Result<i64, String> {
    let profiles = fetch_profile_records().await?;
    Ok(profiles
        .into_iter()
        .filter(|profile| profile.id != profile_id)
        .count() as i64)
}

async fn status_snapshot() -> Result<SensitiveAccessStatus, String> {
    let active_profile = fetch_active_profile_record().await?;
    ensure_legacy_pin_migrated(active_profile.id).await?;

    let mut profiles = Vec::new();
    for profile in fetch_profile_records().await? {
        if profile.id == active_profile.id {
            ensure_legacy_pin_migrated(profile.id).await?;
        }
        profiles.push(to_profile_summary(profile)?);
    }

    let active_summary = profiles
        .iter()
        .find(|profile| profile.id == active_profile.id)
        .cloned()
        .ok_or_else(|| "Perfil ativo indisponível".to_string())?;

    let (unlocked, expires_at) = match current_session_profile()? {
        Some((until, profile)) if profile.id == active_summary.id => {
            let mut session = session_state().lock().map_err(|_| "Sessão sensível indisponível".to_string())?;
            let key = generate_session_key();
            if let Ok((obfuscated, key)) = obfuscate_profile(&active_summary, &key) {
                session.profile_obfuscated = Some(obfuscated);
                session.profile_key = Some(key);
            }
            (true, Some(until.to_rfc3339()))
        }
        Some(_) => {
            clear_session()?;
            (false, None)
        }
        None => (false, None),
    };

    let visible_profiles = if unlocked {
        profiles
    } else {
        profiles
            .into_iter()
            .map(|mut profile| {
                profile.permissions = Vec::new();
                profile
            })
            .collect()
    };

    Ok(SensitiveAccessStatus {
        pin_configured: active_summary.pin_configured,
        unlocked,
        expires_at,
        active_profile_id: Some(active_summary.id),
        active_profile_name: Some(active_summary.nome.clone()),
        active_role: if unlocked {
            Some(active_summary.role.clone())
        } else {
            None
        },
        permissions: if unlocked {
            active_summary.permissions.clone()
        } else {
            Vec::new()
        },
        can_manage_profiles: unlocked && has_permission(&active_summary, PERMISSION_MANAGE_PROFILES),
        profiles: visible_profiles,
    })
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn get_sensitive_access_status() -> Result<SensitiveAccessStatus, String> {
    status_snapshot().await
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn configure_sensitive_pin(pin: String, current_pin: Option<String>) -> Result<SensitiveAccessStatus, String> {
    validate_pin_format(&pin)?;

    let active_profile = to_profile_summary(fetch_active_profile_record().await?)?;
    if let Some(stored) = load_profile_pin(active_profile.id)? {
        let provided_pin = current_pin.ok_or_else(|| "Informe o PIN atual para alterar o acesso sensível.".to_string())?;
        if !verify_pin(provided_pin.trim(), &stored) {
            warn!("Tentativa de alteração de PIN com credencial inválida");
            record_security_event("PIN_CHANGE_FAILED", Some(&active_profile), "PIN atual inválido", false).await;
            return Err("PIN atual inválido".to_string());
        }
    } else if any_profile_has_pin().await? {
        require_permission(PERMISSION_MANAGE_PROFILES)?;
    }

    store_profile_pin(active_profile.id, &pin)?;
    reset_unlock_attempts(active_profile.id);
    unlock_session(active_profile.clone())?;
    record_security_event("PIN_CHANGED", Some(&active_profile), "PIN do perfil ativo atualizado", true).await;
    status_snapshot().await
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn unlock_sensitive_access(pin: String) -> Result<SensitiveAccessStatus, String> {
    validate_pin_format(&pin)?;
    let active_profile = to_profile_summary(fetch_active_profile_record().await?)?;
    check_unlock_lockout(active_profile.id)?;
    let stored = load_profile_pin(active_profile.id)?
        .ok_or_else(|| "PIN sensível ainda não configurado para o perfil ativo".to_string())?;

    if !verify_pin(pin.trim(), &stored) {
        record_unlock_failure(active_profile.id);
        warn!("Tentativa de desbloqueio sensível com PIN inválido");
        record_security_event("UNLOCK_FAILED", Some(&active_profile), "PIN inválido", false).await;
        return Err("PIN inválido".to_string());
    }

    upgrade_pin_hash_if_legacy(active_profile.id, pin.trim(), &stored)?;
    reset_unlock_attempts(active_profile.id);
    debug!("Acesso sensível desbloqueado para perfil {}", active_profile.nome);
    unlock_session(active_profile.clone())?;
    record_security_event("UNLOCK_SUCCESS", Some(&active_profile), "Sessão sensível desbloqueada", true).await;
    status_snapshot().await
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn lock_sensitive_access() -> Result<bool, String> {
    let profile = current_session_profile()?.map(|(_, profile)| profile);
    clear_session()?;
    if let Some(profile) = profile.as_ref() {
        record_security_event("LOCK", Some(profile), "Sessão sensível bloqueada", true).await;
    }
    Ok(true)
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn set_active_security_profile(profile_id: i32) -> Result<SensitiveAccessStatus, String> {
    let actor = fetch_active_profile_record().await.ok().and_then(|profile| to_profile_summary(profile).ok());
    let profile = fetch_profile_record_by_id(profile_id).await?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    // Duas queries separadas para evitar violação da constraint parcial unique
    // (ux_security_profiles_single_default_active). O PostgreSQL valida constraints
    // linha a linha durante o UPDATE, então fazer tudo numa query só pode causar
    // estado transitório com dois is_default=true.
    let mut tx = pool.begin().await.map_err(|e| {
        error!("Erro ao iniciar transação de perfil: {}", e);
        e.to_string()
    })?;

    sqlx::query("UPDATE security_profiles SET is_default = false, atualizado_em = NOW() WHERE ativo = true AND is_default = true")
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            error!("Erro ao limpar perfil ativo anterior: {}", e);
            e.to_string()
        })?;

    sqlx::query("UPDATE security_profiles SET is_default = true, atualizado_em = NOW() WHERE id = $1 AND ativo = true")
        .bind(profile_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            error!("Erro ao definir perfil ativo {}: {}", profile_id, e);
            e.to_string()
        })?;

    tx.commit().await.map_err(|e| {
        error!("Erro ao confirmar transação de perfil: {}", e);
        e.to_string()
    })?;

    clear_session()?;
    let summary = to_profile_summary(profile)?;
    record_security_event(
        "PROFILE_SWITCH",
        actor.as_ref(),
        format!("Perfil ativo alterado para {}", summary.nome),
        true,
    )
    .await;
    status_snapshot().await
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn create_security_profile(input: SecurityProfileInput, pin: String) -> Result<SensitiveAccessStatus, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    validate_pin_format(&pin)?;

    let nome = input.nome.trim();
    if nome.len() < 3 {
        return Err("Nome do perfil deve ter no mínimo 3 caracteres".to_string());
    }

    let role = normalize_role(&input.role)?;
    let permissions = normalize_permissions(&role, &input.permissions)?;
    let permissions_json = serde_json::to_string(&permissions).map_err(|e| e.to_string())?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let row = sqlx::query(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em)
         VALUES ($1, $2, $3, true, false, NOW()) RETURNING id"
    )
    .bind(nome)
    .bind(&role)
    .bind(&permissions_json)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        error!("Erro ao criar perfil de segurança: {}", e);
        e.to_string()
    })?;

    let profile_id: i32 = row.try_get("id").map_err(|e| e.to_string())?;
    store_profile_pin(profile_id, &pin)?;
    tx.commit().await.map_err(|e| e.to_string())?;

    let created = to_profile_summary(fetch_profile_record_by_id(profile_id).await?)?;
    record_security_event(
        "PROFILE_CREATED",
        Some(&actor),
        format!("Perfil {} criado com papel {}", created.nome, created.role),
        true,
    )
    .await;
    status_snapshot().await
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn update_security_profile(profile_id: i32, input: SecurityProfileInput) -> Result<SensitiveAccessStatus, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    let current = to_profile_summary(fetch_profile_record_by_id(profile_id).await?)?;
    let nome = input.nome.trim();
    if nome.len() < 3 {
        return Err("Nome do perfil deve ter no mínimo 3 caracteres".to_string());
    }

    let role = normalize_role(&input.role)?;
    let permissions = normalize_permissions(&role, &input.permissions)?;
    if !has_permission_values(&permissions, PERMISSION_MANAGE_PROFILES)
        && has_permission(&current, PERMISSION_MANAGE_PROFILES)
        && count_manager_profiles_excluding(profile_id).await? == 0
    {
        return Err("Deve existir pelo menos um perfil com permissão para gerenciar perfis".to_string());
    }

    let permissions_json = serde_json::to_string(&permissions).map_err(|e| e.to_string())?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    sqlx::query(
        "UPDATE security_profiles
         SET nome = $1, role = $2, permissions = $3, atualizado_em = NOW()
         WHERE id = $4"
    )
    .bind(nome)
    .bind(&role)
    .bind(&permissions_json)
    .bind(profile_id)
    .execute(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao atualizar perfil de segurança {}: {}", profile_id, e);
        e.to_string()
    })?;

    if actor.id == profile_id {
        clear_session()?;
    }

    record_security_event(
        "PROFILE_UPDATED",
        Some(&actor),
        format!("Perfil {} atualizado", nome),
        true,
    )
    .await;
    status_snapshot().await
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn reset_security_profile_pin(profile_id: i32, new_pin: String) -> Result<SensitiveAccessStatus, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    validate_pin_format(&new_pin)?;
    let profile = to_profile_summary(fetch_profile_record_by_id(profile_id).await?)?;
    store_profile_pin(profile_id, &new_pin)?;

    if actor.id == profile_id {
        unlock_session(profile.clone())?;
    }

    record_security_event(
        "PIN_RESET",
        Some(&actor),
        format!("PIN redefinido para o perfil {}", profile.nome),
        true,
    )
    .await;
    status_snapshot().await
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn list_security_profiles(include_inactive: Option<bool>) -> Result<Vec<SecurityProfileSummary>, String> {
    require_permission(PERMISSION_MANAGE_PROFILES)?;
    let include_inactive = include_inactive.unwrap_or(false);
    let mut profiles = Vec::new();

    for profile in fetch_profile_records_with_scope(include_inactive).await? {
        profiles.push(to_profile_summary(profile)?);
    }

    Ok(profiles)
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn deactivate_security_profile(profile_id: i32) -> Result<SensitiveAccessStatus, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    let profile = to_profile_summary(fetch_profile_record_by_id(profile_id).await?)?;

    if count_active_profiles_excluding(profile_id).await? == 0 {
        return Err("Deve permanecer pelo menos um perfil ativo no sistema".to_string());
    }

    if has_permission(&profile, PERMISSION_MANAGE_PROFILES)
        && count_manager_profiles_excluding(profile_id).await? == 0
    {
        return Err("Deve permanecer pelo menos um perfil com permissão para gerenciar perfis".to_string());
    }

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    sqlx::query(
        "UPDATE security_profiles
         SET ativo = false, is_default = false, atualizado_em = NOW()
         WHERE id = $1"
    )
    .bind(profile_id)
    .execute(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao desativar perfil de segurança {}: {}", profile_id, e);
        e.to_string()
    })?;

    ensure_default_profile_exists().await?;

    if actor.id == profile_id {
        clear_session()?;
    }

    record_security_event(
        "PROFILE_DEACTIVATED",
        Some(&actor),
        format!("Perfil {} desativado", profile.nome),
        true,
    )
    .await;
    status_snapshot().await
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn reactivate_security_profile(profile_id: i32) -> Result<SensitiveAccessStatus, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    let profile = to_profile_summary(fetch_profile_record_by_id_any(profile_id).await?)?;

    if profile.ativo {
        return status_snapshot().await;
    }

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    sqlx::query(
        "UPDATE security_profiles
         SET ativo = true, atualizado_em = NOW()
         WHERE id = $1"
    )
    .bind(profile_id)
    .execute(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao reativar perfil de segurança {}: {}", profile_id, e);
        e.to_string()
    })?;

    record_security_event(
        "PROFILE_REACTIVATED",
        Some(&actor),
        format!("Perfil {} reativado", profile.nome),
        true,
    )
    .await;
    status_snapshot().await
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn register_security_audit_export(
    search: Option<String>,
    outcome: Option<String>,
    profile_id: Option<i32>,
    exported_count: i32,
) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    let details = format!(
        "search={}; outcome={}; profile_id={}; exported_count={}",
        search.as_deref().map(str::trim).filter(|value| !value.is_empty()).unwrap_or("<vazio>"),
        outcome.as_deref().map(str::trim).filter(|value| !value.is_empty()).unwrap_or("ALL"),
        profile_id.map(|value| value.to_string()).unwrap_or_else(|| "ALL".to_string()),
        exported_count,
    );

    record_security_event("AUDIT_EXPORT", Some(&actor), details, true).await;
    Ok(true)
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn list_security_audit_events(limit: Option<i32>) -> Result<Vec<SecurityAuditEventRow>, String> {
    require_permission(PERMISSION_MANAGE_PROFILES)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let max_items = limit.unwrap_or(20).clamp(1, 100) as i64;

    sqlx::query_as::<_, SecurityAuditEventRow>(
        "SELECT id, event_type, profile_id, profile_name, details, success, created_at::text AS created_at
         FROM security_audit_log
         ORDER BY created_at DESC
         LIMIT $1"
    )
    .bind(max_items)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao listar auditoria de segurança: {}", e);
        e.to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_profile(role: &str, permissions: &[&str]) -> SecurityProfileSummary {
        SecurityProfileSummary {
            id: 1,
            nome: "Operador".to_string(),
            role: role.to_string(),
            permissions: permissions.iter().map(|permission| permission.to_string()).collect(),
            pin_configured: true,
            is_default: false,
            ativo: true,
        }
    }

    #[test]
    fn p0_sensitive_permission_gate_allows_each_critical_permission_when_present() {
        for permission in [
            PERMISSION_FINANCIAL_ACTIONS,
            PERMISSION_STOCK_CONTROL,
            PERMISSION_DELETE_RECORDS,
            PERMISSION_MANAGE_PROFILES,
        ] {
            let profile = build_profile("OPERADOR", &[permission]);
            assert_eq!(evaluate_permission_gate(Some(profile.clone()), permission), Ok(profile));
        }
    }

    #[test]
    fn p0_sensitive_permission_gate_denies_each_critical_permission_when_missing() {
        for permission in [
            PERMISSION_FINANCIAL_ACTIONS,
            PERMISSION_STOCK_CONTROL,
            PERMISSION_DELETE_RECORDS,
            PERMISSION_MANAGE_PROFILES,
        ] {
            let result = evaluate_permission_gate(Some(build_profile("OPERADOR", &[])), permission);
            assert!(matches!(
                result,
                Err(PermissionGateFailure::MissingPermission(profile)) if profile.nome == "Operador"
            ));
        }
    }

    #[test]
    fn p0_sensitive_permission_gate_denies_locked_session() {
        assert!(matches!(
            evaluate_permission_gate(None, PERMISSION_FINANCIAL_ACTIONS),
            Err(PermissionGateFailure::SessionLocked)
        ));
    }

    #[test]
    fn p0_sensitive_permission_gate_allows_admin_profile() {
        let admin = build_profile("ADMIN", &[]);
        assert_eq!(
            evaluate_permission_gate(Some(admin.clone()), PERMISSION_MANAGE_PROFILES),
            Ok(admin)
        );
    }
}