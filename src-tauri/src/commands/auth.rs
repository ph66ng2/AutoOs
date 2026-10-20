use crate::commands::types::{LoginEmpresaResult, RegistroEmpresaResult};
use crate::db::{self, get_pool};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{DateTime, Duration, Utc};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool, Row};
use std::collections::{BTreeSet, HashMap};
use native_tls::TlsConnector;
use tokio_postgres::NoTls;
use postgres_native_tls::MakeTlsConnector;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
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
pub const PERMISSION_MANAGE_STATUS_LINKS: &str = "MANAGE_STATUS_LINKS";
pub const PERMISSION_VIEW_EXPENSES: &str = "VIEW_EXPENSES";

const ALL_PERMISSIONS: [&str; 8] = [
    PERMISSION_CONFIG_SMTP,
    PERMISSION_CONFIG_WHATSAPP,
    PERMISSION_DELETE_RECORDS,
    PERMISSION_FINANCIAL_ACTIONS,
    PERMISSION_STOCK_CONTROL,
    PERMISSION_MANAGE_PROFILES,
    PERMISSION_MANAGE_STATUS_LINKS,
    PERMISSION_VIEW_EXPENSES,
];

static SENSITIVE_SESSION: OnceLock<Mutex<SensitiveSession>> = OnceLock::new();
static UNLOCK_ATTEMPTS: OnceLock<Mutex<HashMap<i32, UnlockAttemptTracker>>> = OnceLock::new();
static SELECTED_PROFILE_ID: AtomicI32 = AtomicI32::new(0);
static INACTIVITY_LOCK_ENABLED: AtomicBool = AtomicBool::new(false);
static INACTIVITY_CONFIG_LOADED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Default, Clone)]
struct UnlockAttemptTracker {
    failed_attempts: u32,
    locked_until: Option<DateTime<Utc>>,
}

#[derive(Debug, Default, Clone)]
pub(crate) struct SensitiveSession {
    pub(crate) unlocked_until: Option<DateTime<Utc>>,
    pub(crate) profile_obfuscated: Option<Vec<u8>>,
    pub(crate) profile_key: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct SecurityProfileSummary {
    pub id: i32,
    pub nome: String,
    pub role: String,
    pub permissions: Vec<String>,
    pub pin_configured: bool,
    pub pin_required: bool,
    pub is_default: bool,
    pub ativo: bool,
    #[serde(default)]
    pub avatar_icone: Option<String>,
    #[serde(default)]
    pub avatar_cor: Option<String>,
    #[serde(default)]
    pub tema: Option<String>,
    #[serde(default)]
    pub onboarding_pendente: bool,
    /// Permissões que o tour já apresentou. `None` = o tour nunca foi visto.
    #[serde(default)]
    pub tour_permissoes_vistas: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum PermissionGateFailure {
    SessionLocked,
    MissingPermission(Box<SecurityProfileSummary>),
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
pub(crate) struct StoredSensitivePin {
    pin_hash: String,
    created_at: String,
}

#[derive(Debug, Clone, FromRow)]
struct SecurityProfileRecord {
    id: i32,
    nome: String,
    role: String,
    permissions: String,
    pin_required: bool,
    ativo: bool,
    is_default: bool,
    criado_em: chrono::NaiveDateTime,
    avatar_icone: Option<String>,
    avatar_cor: Option<String>,
    tema: Option<String>,
    onboarding_concluido_em: Option<DateTime<Utc>>,
    tour_permissoes_vistas: Option<String>,
}

/// Colunas de `SecurityProfileRecord`. Macro para compor SQL estático com `concat!`.
macro_rules! profile_columns {
    () => {
        "id, nome, role, permissions, pin_required, ativo, is_default, criado_em, \
         avatar_icone, avatar_cor, tema, onboarding_concluido_em, tour_permissoes_vistas"
    };
}

pub(crate) fn session_state() -> &'static Mutex<SensitiveSession> {
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

pub(crate) fn verify_pin(pin: &str, stored: &StoredSensitivePin) -> bool {
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
    if trimmed.is_empty() {
        return Ok(());
    }
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

    Ok(normalized.into_iter().collect())
}

fn ensure_pinless_session_allowed(profile: &SecurityProfileSummary) -> Result<(), String> {
    if profile.pin_required || profile.role == "ADMIN" {
        return Err("Este perfil exige PIN. Configure o acesso neste computador com um administrador ou use a recuperação de acesso.".to_string());
    }
    Ok(())
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

pub(crate) fn load_profile_pin(profile_id: i32) -> Result<Option<StoredSensitivePin>, String> {
    load_stored_pin_by_user(&profile_keyring_user(profile_id))
}

/// Os IDs locais de perfil podem ser reutilizados após um restore ou uma
/// reinstalação. Um segredo criado antes do perfil atual pertence à instalação
/// anterior e não pode ser usado para bloquear o novo perfil.
fn load_profile_pin_for_record(profile: &SecurityProfileRecord) -> Result<Option<StoredSensitivePin>, String> {
    let Some(stored) = load_profile_pin(profile.id)? else {
        return Ok(None);
    };

    if pin_record_is_older_than_profile(&stored, profile) {
        warn!(profile_id = profile.id, "PIN órfão removido do keyring");
        let entry = get_keyring_entry(&profile_keyring_user(profile.id))?;
        entry.delete_password().map_err(|error| {
            error!("Erro ao remover PIN órfão do keyring: {}", error);
            "Não foi possível remover o PIN local antigo. Use a recuperação de PIN.".to_string()
        })?;
        return Ok(None);
    }

    Ok(Some(stored))
}

fn pin_record_is_older_than_profile(stored: &StoredSensitivePin, profile: &SecurityProfileRecord) -> bool {
    let Ok(stored_created_at) = DateTime::parse_from_rfc3339(&stored.created_at) else {
        // Não apagamos registros legados sem data confiável automaticamente.
        return false;
    };
    let profile_created_at = DateTime::<Utc>::from_naive_utc_and_offset(profile.criado_em, Utc);
    stored_created_at.with_timezone(&Utc) < profile_created_at
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
        KEYRING_UNAVAILABLE_MESSAGE.to_string()
    })
}

const KEYRING_UNAVAILABLE_MESSAGE: &str =
    "O cofre de senhas do sistema está bloqueado ou indisponível. Desbloqueie-o e tente de novo.";
const KEYRING_TIMEOUT_MESSAGE: &str =
    "O cofre de senhas do sistema não respondeu a tempo. Responda ao aviso do sistema ou desbloqueie o cofre e tente de novo.";
const KEYRING_WRITE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Roda uma chamada síncrona do keyring fora do worker async, com limite de tempo. Um cofre
/// travado esperando resposta do usuário não pode prender o worker nem uma transação aberta.
async fn run_keyring_blocking<T, F>(limit: std::time::Duration, work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    match tokio::time::timeout(limit, tokio::task::spawn_blocking(work)).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err(KEYRING_UNAVAILABLE_MESSAGE.to_string()),
        Err(_) => Err(KEYRING_TIMEOUT_MESSAGE.to_string()),
    }
}

pub(crate) fn store_profile_pin(profile_id: i32, pin: &str) -> Result<(), String> {
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

/// O PIN de cada perfil vive no keyring de cada computador, então o que decide se um perfil
/// tem (ou terá) PIN é o banco: `pin_required`. `pin_configured` (só este computador) cobre
/// perfis antigos que já têm PIN aqui. Quem exige PIN nunca abre sessão sem ele.
fn profile_requires_pin(profile: &SecurityProfileSummary) -> bool {
    profile.pin_required || profile.pin_configured
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
        Err(PermissionGateFailure::MissingPermission(Box::new(profile)))
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

async fn read_inactivity_config_from_db() -> Result<bool, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let row = sqlx::query_scalar::<_, bool>(
        "SELECT inactivity_lock_enabled FROM configuracoes_sistema WHERE id = 1"
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao ler configuração de inatividade: {}", e);
        super::operator_errors::mapear_erro_sql(e)
    })?;
    INACTIVITY_LOCK_ENABLED.store(row, Ordering::Relaxed);
    INACTIVITY_CONFIG_LOADED.store(true, Ordering::Relaxed);
    Ok(row)
}

/// Garante que a flag de bloqueio por inatividade veio do banco, sem depender de alguém abrir
/// Configurações. Lê uma vez por processo e de novo a cada status com a sessão bloqueada, então
/// uma mudança feita em outro computador vale no próximo desbloqueio. Se a leitura falhar, a
/// flag continua como estava e a próxima consulta tenta de novo.
async fn refresh_inactivity_config_if_needed() {
    let locked = !matches!(current_session_profile(), Ok(Some(_)));
    if INACTIVITY_CONFIG_LOADED.load(Ordering::Relaxed) && !locked {
        return;
    }
    if let Err(error) = read_inactivity_config_from_db().await {
        warn!("Não foi possível carregar a configuração de inatividade: {}", error);
    }
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn verificar_config_inatividade() -> Result<bool, String> {
    read_inactivity_config_from_db().await
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn salvar_config_inatividade(enabled: bool) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE configuracoes_sistema SET inactivity_lock_enabled = $1, updated_at = NOW() WHERE id = 1"
    )
    .bind(enabled)
    .execute(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao salvar configuração de inatividade: {}", e);
        super::operator_errors::mapear_erro_sql(e)
    })?;

    INACTIVITY_LOCK_ENABLED.store(enabled, Ordering::Relaxed);

    record_security_event(
        "INACTIVITY_LOCK_TOGGLED",
        Some(&actor),
        format!("inactivity_lock_enabled={}", enabled),
        true,
    )
    .await;

    Ok(enabled)
}

pub(crate) fn current_session_profile() -> Result<Option<(DateTime<Utc>, SecurityProfileSummary)>, String> {
    let mut session = session_state().lock().map_err(|_| "Sessão sensível indisponível".to_string())?;
    match (session.unlocked_until, session.profile_obfuscated.clone(), session.profile_key.clone()) {
        (Some(until), Some(data), Some(key)) => {
            let inactivity_enabled = INACTIVITY_LOCK_ENABLED.load(Ordering::Relaxed);
            if inactivity_enabled && until <= Utc::now() {
                session.unlocked_until = None;
                session.profile_obfuscated = None;
                session.profile_key = None;
                return Ok(None);
            }
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

pub(crate) fn unlock_session(profile: SecurityProfileSummary) -> Result<(), String> {
    let expires_at = Utc::now() + Duration::minutes(SESSION_TIMEOUT_MINUTES);
    let key = generate_session_key();
    let (obfuscated, key) = obfuscate_profile(&profile, &key)?;
    let mut session = session_state().lock().map_err(|_| "Sessão sensível indisponível".to_string())?;
    SELECTED_PROFILE_ID.store(profile.id, Ordering::Relaxed);
    session.unlocked_until = Some(expires_at);
    session.profile_obfuscated = Some(obfuscated);
    session.profile_key = Some(key);
    Ok(())
}

pub fn touch_sensitive_access() -> Result<(), String> {
    let mut session = session_state().lock().map_err(|_| "Sessão sensível indisponível".to_string())?;
    match (session.unlocked_until, session.profile_obfuscated.clone(), session.profile_key.clone()) {
        // Com o bloqueio por inatividade desativado a sessão não expira: segue o que
        // `current_session_profile` já considera válido.
        (Some(until), Some(_), Some(_)) if until > Utc::now() || !INACTIVITY_LOCK_ENABLED.load(Ordering::Relaxed) => {
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

/// Confere a sessão sem renová-la e sem registrar tentativa negada na auditoria. É para leituras
/// de segundo plano (o sino do portal consulta a cada 30 s): só a ação do usuário prorroga os
/// 15 minutos, senão o bloqueio por inatividade nunca dispara.
pub fn require_sensitive_access_without_touch() -> Result<SecurityProfileSummary, String> {
    current_session_profile()?
        .map(|(_, profile)| profile)
        .ok_or_else(|| "Acesso sensível bloqueado. Informe o PIN para continuar.".to_string())
}

/// Resolve a empresa exclusivamente a partir do perfil atualmente autenticado.
/// Valores recebidos da interface nunca devem escolher o tenant de uma escrita.
pub async fn require_active_session_company_id(pool: &PgPool) -> Result<i32, String> {
    let profile = require_sensitive_access()?;
    company_id_for_profile(pool, &profile).await
}

/// Igual a `require_active_session_company_id`, para consultas de segundo plano: não renova a sessão.
pub async fn require_active_session_company_id_without_touch(pool: &PgPool) -> Result<i32, String> {
    let profile = require_sensitive_access_without_touch()?;
    company_id_for_profile(pool, &profile).await
}

async fn company_id_for_profile(pool: &PgPool, profile: &SecurityProfileSummary) -> Result<i32, String> {
    let company_id = sqlx::query_scalar(
        "SELECT e.id
         FROM security_profiles p
         JOIN empresas e ON e.id = p.empresa_id AND LOWER(e.status) = 'ativo'
         WHERE p.id = $1 AND p.ativo = true",
    )
    .bind(profile.id)
    .fetch_optional(pool)
    .await;
    let company_id = match company_id {
        Ok(company_id) => company_id,
        Err(error) => return Err(active_session_company_query_error(error).await),
    };
    company_id.ok_or_else(|| {
        "O perfil autenticado não está vinculado a uma empresa ativa. Vincule uma empresa ao perfil antes de continuar."
            .to_string()
    })
}

async fn active_session_company_query_error(error: sqlx::Error) -> String {
    format!(
        "Erro ao identificar a empresa do perfil autenticado: {}",
        db::database_operation_error(error).await
    )
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
                Some(*profile),
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
    let row_result = sqlx::query("SELECT COUNT(*) AS total FROM security_profiles WHERE ativo = true")
        .fetch_one(&pool)
        .await;
    let row = match row_result {
        Ok(row) => row,
        Err(error) => {
            error!("Erro ao contar perfis de segurança: {}", error);
            return Err(db::database_operation_error(error).await);
        }
    };

    let total: i64 = row.try_get("total").map_err(super::operator_errors::mapear_erro_sql)?;
    if total == 0 {
        let permissions = serde_json::to_string(&ALL_PERMISSIONS.iter().map(|value| value.to_string()).collect::<Vec<_>>())
            .map_err(|e| e.to_string())?;
        let insert_result = sqlx::query(
            "INSERT INTO security_profiles (nome, role, permissions, is_default, pin_required) VALUES ($1, $2, $3, true, false)"
        )
        .bind("Administrador Local")
        .bind("ADMIN")
        .bind(permissions)
        .execute(&pool)
        .await;
        if let Err(error) = insert_result {
            error!("Erro ao recriar perfil administrador padrão: {}", error);
            return Err(db::database_operation_error(error).await);
        }
    }

    let default_row_result = sqlx::query("SELECT COUNT(*) AS total FROM security_profiles WHERE ativo = true AND is_default = true")
        .fetch_one(&pool)
        .await;
    let default_row = match default_row_result {
        Ok(row) => row,
        Err(error) => return Err(db::database_operation_error(error).await),
    };
    let default_total: i64 = default_row.try_get("total").map_err(super::operator_errors::mapear_erro_sql)?;
    if default_total == 0 {
        let update_result = sqlx::query(
            "UPDATE security_profiles SET is_default = CASE WHEN id = (
                SELECT id FROM security_profiles WHERE ativo = true ORDER BY id ASC LIMIT 1
            ) THEN true ELSE false END"
        )
        .execute(&pool)
        .await;
        if let Err(error) = update_result {
            return Err(db::database_operation_error(error).await);
        }
    }

    Ok(())
}

async fn mark_profile_pin_required(profile_id: i32) -> Result<(), String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE security_profiles SET pin_required = true WHERE id = $1")
        .bind(profile_id).execute(&pool).await
        .map_err(super::operator_errors::mapear_erro_sql)?;
    Ok(())
}

async fn fetch_profile_records_with_scope(include_inactive: bool) -> Result<Vec<SecurityProfileRecord>, String> {
    ensure_default_profile_exists().await?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let mut query_builder = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        concat!("SELECT ", profile_columns!(), " FROM security_profiles"),
    );

    if !include_inactive {
        query_builder.push(" WHERE ativo = true");
    }

    query_builder.push(" ORDER BY ativo DESC, is_default DESC, nome ASC");

    let profiles_result = query_builder
        .build_query_as::<SecurityProfileRecord>()
        .fetch_all(&pool)
        .await;
    match profiles_result {
        Ok(profiles) => Ok(profiles),
        Err(error) => {
            error!("Erro ao listar perfis de segurança: {}", error);
            Err(db::database_operation_error(error).await)
        }
    }
}

async fn fetch_profile_records() -> Result<Vec<SecurityProfileRecord>, String> {
    fetch_profile_records_with_scope(false).await
}

async fn fetch_active_profile_record() -> Result<SecurityProfileRecord, String> {
    let mut profiles = fetch_profile_records().await?;
    profiles
        .iter()
        .find(|profile| profile.id == SELECTED_PROFILE_ID.load(Ordering::Relaxed))
        .or_else(|| profiles.iter().find(|profile| profile.is_default))
        .cloned()
        .or_else(|| profiles.drain(..).next())
        .ok_or_else(|| "Nenhum perfil de segurança ativo encontrado".to_string())
}

async fn fetch_profile_record_by_id(profile_id: i32) -> Result<SecurityProfileRecord, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let profile = sqlx::query_as::<_, SecurityProfileRecord>(
        concat!("SELECT ", profile_columns!(), " FROM security_profiles WHERE id = $1 AND ativo = true"),
    )
    .bind(profile_id)
    .fetch_optional(&pool)
    .await;
    let profile = match profile {
        Ok(profile) => profile,
        Err(e) => {
            error!("Erro ao buscar perfil de segurança {}: {}", profile_id, e);
            return Err(db::database_operation_error(e).await);
        }
    };
    profile
    .ok_or_else(|| "Perfil de segurança não encontrado".to_string())
}

async fn fetch_profile_record_by_id_any(profile_id: i32) -> Result<SecurityProfileRecord, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    sqlx::query_as::<_, SecurityProfileRecord>(
        concat!("SELECT ", profile_columns!(), " FROM security_profiles WHERE id = $1"),
    )
    .bind(profile_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao buscar perfil de segurança {}: {}", profile_id, e);
        super::operator_errors::mapear_erro_sql(e)
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
    let pin_configured = load_profile_pin_for_record(&record)?.is_some();
    Ok(SecurityProfileSummary {
        id: record.id,
        nome: record.nome,
        role: record.role,
        permissions,
        pin_configured,
        pin_required: record.pin_required,
        is_default: record.is_default,
        ativo: record.ativo,
        avatar_icone: record.avatar_icone,
        avatar_cor: record.avatar_cor,
        tema: record.tema,
        onboarding_pendente: record.onboarding_concluido_em.is_none(),
        tour_permissoes_vistas: match record.tour_permissoes_vistas.as_deref() {
            Some(raw) => Some(parse_permissions(raw)?),
            None => None,
        },
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
                "INSERT INTO security_audit_log
                    (event_type, profile_id, profile_name, details, success, empresa_id)
                 VALUES ($1, $2, $3, $4, $5,
                    (SELECT empresa_id FROM security_profiles WHERE id = $2))"
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
    refresh_inactivity_config_if_needed().await;
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
                profile.tour_permissoes_vistas = None;
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

    let active_record = fetch_active_profile_record().await?;
    let active_profile = to_profile_summary(active_record.clone())?;
    if let Some(stored) = load_profile_pin_for_record(&active_record)? {
        let provided_pin = current_pin.ok_or_else(|| "Informe o PIN atual para alterar o acesso sensível.".to_string())?;
        if !verify_pin(provided_pin.trim(), &stored) {
            warn!("Tentativa de alteração de PIN com credencial inválida");
            record_security_event("PIN_CHANGE_FAILED", Some(&active_profile), "PIN atual inválido", false).await;
            return Err(format!(
                "Não foi possível criar um PIN novo porque o perfil \"{}\" (ID {}) já possui um PIN local configurado. O PIN atual informado não confere. Use \"Esqueci minha senha\" para redefini-lo ou remova o PIN pelo administrador.",
                active_profile.nome, active_profile.id
            ));
        }
    } else if active_record.pin_required || any_profile_has_pin().await? {
        require_permission(PERMISSION_MANAGE_PROFILES)?;
    }

    if pin.trim().is_empty() {
        return Err("Informe um PIN de 4 a 8 dígitos.".to_string());
    }
    store_profile_pin(active_profile.id, &pin)?;
    mark_profile_pin_required(active_profile.id).await?;
    reset_unlock_attempts(active_profile.id);
    unlock_session(active_profile.clone())?;
    record_security_event("PIN_CHANGED", Some(&active_profile), "PIN do perfil ativo atualizado", true).await;
    status_snapshot().await
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn unlock_sensitive_access(pin: String) -> Result<SensitiveAccessStatus, String> {
    validate_pin_format(&pin)?;
    let active_record = fetch_active_profile_record().await?;
    let active_profile = to_profile_summary(active_record.clone())?;
    check_unlock_lockout(active_profile.id)?;
    let stored = load_profile_pin_for_record(&active_record)?.ok_or_else(|| format!(
        "O perfil \"{}\" (ID {}) não possui PIN local configurado. Esta tela está tentando desbloquear um PIN inexistente; feche e abra o AutoOS novamente para iniciar a criação do PIN.",
        active_profile.nome, active_profile.id
    ))?;

    if !verify_pin(pin.trim(), &stored) {
        record_unlock_failure(active_profile.id);
        warn!("Tentativa de desbloqueio sensível com PIN inválido");
        record_security_event("UNLOCK_FAILED", Some(&active_profile), "PIN inválido", false).await;
        return Err(format!(
            "O PIN informado não corresponde ao PIN já configurado para o perfil \"{}\" (ID {}). Esta ação é um desbloqueio, não a criação de um PIN novo. Se você não reconhece esse PIN, use \"Esqueci minha senha\" para redefini-lo.",
            active_profile.nome, active_profile.id
        ));
    }

    upgrade_pin_hash_if_legacy(active_profile.id, pin.trim(), &stored)?;
    reset_unlock_attempts(active_profile.id);
    debug!("Acesso sensível desbloqueado para perfil {}", active_profile.nome);
    unlock_session(active_profile.clone())?;
    record_security_event("UNLOCK_SUCCESS", Some(&active_profile), "Sessão sensível desbloqueada", true).await;
    status_snapshot().await
}

/// Confirma novamente o PIN do perfil que já está autenticado, sem trocar a
/// identidade da sessão. Operações persistentes em lote usam esta etapa para
/// exigir presença administrativa e manter o mesmo controle de tentativas.
pub(crate) async fn confirm_authenticated_profile_pin(
    profile: &SecurityProfileSummary,
    pin: &str,
) -> Result<(), String> {
    validate_pin_format(pin)?;
    check_unlock_lockout(profile.id)?;
    let record = fetch_profile_record_by_id(profile.id).await?;
    let stored = load_profile_pin_for_record(&record)?
        .ok_or_else(|| "O perfil administrador não possui PIN configurado.".to_string())?;

    if !verify_pin(pin.trim(), &stored) {
        record_unlock_failure(profile.id);
        warn!("Confirmação administrativa em lote com PIN inválido");
        record_security_event(
            "ADMIN_CONFIRMATION_FAILED",
            Some(profile),
            "PIN inválido em operação persistente em lote",
            false,
        )
        .await;
        return Err("PIN do administrador inválido.".to_string());
    }

    upgrade_pin_hash_if_legacy(profile.id, pin.trim(), &stored)?;
    reset_unlock_attempts(profile.id);
    Ok(())
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn unlock_session_without_pin() -> Result<SensitiveAccessStatus, String> {
    let active_record = fetch_active_profile_record().await?;
    let active_profile = to_profile_summary(active_record.clone())?;
    let stored = load_profile_pin_for_record(&active_record)?;
    if stored.is_some() {
        return Err(format!(
            "O perfil \"{}\" (ID {}) possui um PIN local configurado. Informe esse PIN para desbloquear ou use \"Esqueci minha senha\" para redefini-lo.",
            active_profile.nome, active_profile.id
        ));
    }
    ensure_pinless_session_allowed(&active_profile)?;
    unlock_session(active_profile.clone())?;
    record_security_event("SESSION_UNLOCKED_NO_PIN", Some(&active_profile), "Sessão desbloqueada sem PIN", true).await;
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
pub async fn set_active_security_profile(profile_id: i32, pin: String, confirm_pin: Option<String>) -> Result<SensitiveAccessStatus, String> {
    // The actor is only used for the audit event. Read it from the current
    // session instead of issuing another profile query before the actual switch.
    let actor = current_session_profile()?.map(|(_, profile)| profile);
    let profile = fetch_profile_record_by_id(profile_id).await?;
    let summary = to_profile_summary(profile.clone())?;
    let stored = load_profile_pin_for_record(&profile)?;
    let provision_admin_pin = stored.is_none() && summary.role == "ADMIN" && !profile.pin_required;
    if stored.is_none() && profile.pin_required {
        return Err("Este perfil exige PIN, mas ele não está configurado neste computador. Peça a um administrador para configurar o PIN em Equipe e acessos, ou use a recuperação de acesso.".to_string());
    }
    if let Some(ref stored_pin) = stored {
        validate_pin_format(&pin)?;
        check_unlock_lockout(profile_id)?;
        if !verify_pin(pin.trim(), stored_pin) {
            record_unlock_failure(profile_id);
            record_security_event("PROFILE_SWITCH_FAILED", actor.as_ref(), "PIN do perfil de destino inválido", false).await;
            return Err("PIN do perfil selecionado inválido".to_string());
        }
        upgrade_pin_hash_if_legacy(profile_id, pin.trim(), stored_pin)?;
    } else if provision_admin_pin {
        validate_pin_format(&pin)?;
        if pin.trim().is_empty() {
            return Err("Defina um PIN para o perfil administrador".to_string());
        }
        if confirm_pin.as_deref() != Some(pin.as_str()) {
            return Err("Os PINs não conferem".to_string());
        }
    } else if !pin.is_empty() {
        return Err("Este perfil não possui PIN configurado".to_string());
    } else {
        ensure_pinless_session_allowed(&summary)?;
    }
    // A troca pertence somente a esta instância do aplicativo. Nunca altera
    // is_default no banco compartilhado nem os timestamps de outros perfis.
    if provision_admin_pin {
        store_profile_pin(profile_id, &pin)?;
        mark_profile_pin_required(profile_id).await?;
    }

    reset_unlock_attempts(profile_id);
    unlock_session(summary.clone())?;
    if provision_admin_pin {
        record_security_event("PIN_CONFIGURED_ON_SWITCH", Some(&summary), "PIN inicial do perfil configurado", true).await;
    }
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

    let nome = input.nome.trim();
    if nome.chars().count() < 3 {
        return Err("Nome do perfil deve ter no mínimo 3 caracteres".to_string());
    }
    validate_pin_format(&pin)?;

    let role = normalize_role(&input.role)?;
    let permissions = normalize_permissions(&role, &input.permissions)?;
    if pin.trim().is_empty() && (role == "ADMIN" || has_permission_values(&permissions, PERMISSION_MANAGE_PROFILES)) {
        return Err("Perfis com acesso à administração exigem PIN".to_string());
    }
    let permissions_json = serde_json::to_string(&permissions).map_err(|e| e.to_string())?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let mut tx = pool.begin().await.map_err(super::operator_errors::mapear_erro_sql)?;
    let row = sqlx::query(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, pin_required, atualizado_em)
         VALUES ($1, $2, $3, true, false, $4, NOW()) RETURNING id"
    )
    .bind(nome)
    .bind(&role)
    .bind(&permissions_json)
    .bind(!pin.trim().is_empty())
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        let resposta = super::operator_errors::mapear_erro_sql(e);
        if resposta.starts_with("AUTOOS:23505") {
            resposta
        } else {
            super::operator_errors::trocar_frase(&resposta, "Não foi possível criar o perfil. Tente novamente.")
        }
    })?;

    let profile_id: i32 = row.try_get("id").map_err(super::operator_errors::mapear_erro_sql)?;
    if !pin.trim().is_empty() {
        store_profile_pin(profile_id, &pin)?;
    }
    tx.commit().await.map_err(super::operator_errors::mapear_erro_sql)?;

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
pub async fn update_security_profile(profile_id: i32, input: SecurityProfileInput, admin_pin: String) -> Result<SensitiveAccessStatus, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;

    let stored = load_profile_pin(actor.id)?;
    if let Some(ref stored_pin) = stored {
        if !verify_pin(admin_pin.trim(), stored_pin) {
            spawn_security_event("PROFILE_UPDATE_FAILED", Some(actor.clone()), "PIN do administrador inválido".to_string(), false);
            return Err("PIN do administrador inválido".to_string());
        }
    } else {
        return Err("Seu perfil não possui PIN configurado".to_string());
    }

    let current = to_profile_summary(fetch_profile_record_by_id(profile_id).await?)?;
    let nome = input.nome.trim();
    if nome.len() < 3 {
        return Err("Nome do perfil deve ter no mínimo 3 caracteres".to_string());
    }

    let role = normalize_role(&input.role)?;
    let permissions = normalize_permissions(&role, &input.permissions)?;
    if !profile_requires_pin(&current) && (role == "ADMIN" || has_permission_values(&permissions, PERMISSION_MANAGE_PROFILES)) {
        return Err("Este perfil não exige PIN. Gere um código de acesso para a pessoa criar o PIN antes de conceder acesso à administração".to_string());
    }
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
        let resposta = super::operator_errors::mapear_erro_sql(e);
        if resposta.starts_with("AUTOOS:23505") {
            resposta
        } else {
            super::operator_errors::trocar_frase(&resposta, "Não foi possível atualizar o perfil. Tente novamente.")
        }
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

/// Helper interno para conectar ao PostgreSQL via tokio-postgres.
/// Quando `use_tls` é true, tenta TLS (necessário para conexões remotas/Supabase).
/// Quando `use_tls` é false, conecta sem TLS (modo local).
async fn try_connect_pg(conn_str: &str, use_tls: bool) -> Result<tokio_postgres::Client, String> {
    if use_tls {
        let connector = TlsConnector::new()
            .map_err(|e| format!("Falha ao criar TLS connector: {}", e))?;
        let tls = MakeTlsConnector::new(connector);
        let (client, connection) = tokio_postgres::connect(conn_str, tls)
            .await
            .map_err(|e| format!("Falha na conexão TLS: {}", e))?;
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                warn!("Erro na conexão TLS tokio-postgres: {}", e);
            }
        });
        Ok(client)
    } else {
        let (client, connection) = tokio_postgres::connect(conn_str, NoTls)
            .await
            .map_err(|e| format!("Falha na conexão NoTls: {}", e))?;
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                warn!("Erro na conexão NoTls tokio-postgres: {}", e);
            }
        });
        Ok(client)
    }
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn verificar_credenciais_banco(
    host: String,
    port: u16,
    database: String,
    username: String,
    password: String,
) -> Result<bool, String> {
    let conn_str = format!(
        "host={} port={} dbname={} user={} password={}",
        host, port, database, username, password
    );

    // TLS first for remote/Supabase connections, falls back to NoTls for local PostgreSQL
    let client = match try_connect_pg(&conn_str, true).await {
        Ok(client) => client,
        Err(e) => {
            warn!(
                "TLS connection failed (expected for local PostgreSQL), falling back to NoTls: {}",
                e
            );
            match try_connect_pg(&conn_str, false).await {
                Ok(client) => client,
                Err(e) => {
                    warn!("Falha ao conectar com tokio-postgres para verificação: {}", e);
                    return Ok(false);
                }
            }
        }
    };

    match client.query_one("SELECT 1", &[]).await {
        Ok(_) => Ok(true),
        Err(e) => {
            warn!("Erro ao executar query de teste na conexão: {}", e);
            Ok(false)
        }
    }
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn redefinir_pin_via_db(
    host: String,
    port: u16,
    database: String,
    username: String,
    password: String,
    profile_id: i32,
    new_pin: String,
) -> Result<bool, String> {
    record_security_event(
        "PIN_RECOVERY_ATTEMPT",
        None,
        format!("Tentativa de recovery de PIN para o perfil {}", profile_id),
        true,
    )
    .await;

    let credenciais_validas = verificar_credenciais_banco(
        host, port, database, username, password,
    )
    .await
    .map_err(|e| format!("Erro ao verificar credenciais: {}", e))?;

    if !credenciais_validas {
        record_security_event(
            "PIN_RECOVERY_FAILED",
            None,
            format!("Credenciais inválidas para recovery do perfil {}", profile_id),
            false,
        )
        .await;
        return Err("Credenciais do banco de dados inválidas".to_string());
    }

    validate_pin_format(&new_pin)?;

    let profile = to_profile_summary(fetch_profile_record_by_id(profile_id).await?)?;
    if new_pin.trim().is_empty() {
        return Err("Informe um PIN de 4 a 8 dígitos.".to_string());
    }
    store_profile_pin(profile_id, &new_pin)?;
    mark_profile_pin_required(profile_id).await?;

    record_security_event(
        "PIN_RECOVERY_SUCCESS",
        None,
        format!("PIN redefinido via recovery para o perfil {}", profile.nome),
        true,
    )
    .await;

    Ok(true)
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
        super::operator_errors::mapear_erro_sql(e)
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
        super::operator_errors::mapear_erro_sql(e)
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
pub async fn deletar_perfil(
    profile_id: i32,
    admin_pin: String,
    db_username: String,
    db_password: String,
    db_host: String,
    db_port: u16,
    db_name: String,
) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;

    let stored = load_profile_pin(actor.id)?;
    if let Some(ref stored_pin) = stored {
        if !verify_pin(admin_pin.trim(), stored_pin) {
            spawn_security_event(
                "PROFILE_DELETE_FAILED",
                Some(actor.clone()),
                "PIN do administrador inválido".to_string(),
                false,
            );
            return Err("PIN do administrador inválido".to_string());
        }
    } else {
        return Err("O perfil administrador não possui PIN configurado".to_string());
    }

    let conn_str = format!(
        "host={} port={} dbname={} user={} password={}",
        db_host, db_port, db_name, db_username, db_password
    );

    let client = match try_connect_pg(&conn_str, true).await {
        Ok(client) => client,
        Err(_) => {
            match try_connect_pg(&conn_str, false).await {
                Ok(client) => client,
                Err(_) => {
                    spawn_security_event(
                        "PROFILE_DELETE_FAILED",
                        Some(actor.clone()),
                        "Credenciais do PostgreSQL inválidas".to_string(),
                        false,
                    );
                    return Err("Credenciais do PostgreSQL inválidas".to_string());
                }
            }
        }
    };

    drop(client);

    let profile = to_profile_summary(fetch_profile_record_by_id_any(profile_id).await?)?;

    let active = fetch_active_profile_record().await?;
    if active.id == profile_id {
        return Err("Não é possível excluir o perfil atualmente ativo. Troque de perfil primeiro.".to_string());
    }

    if count_active_profiles_excluding(profile_id).await? == 0 {
        return Err("Deve permanecer pelo menos um perfil ativo no sistema".to_string());
    }

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM security_profiles WHERE id = $1")
        .bind(profile_id)
        .execute(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao excluir perfil de segurança {}: {}", profile_id, e);
            super::operator_errors::mapear_erro_sql(e)
        })?;

    if let Ok(entry) = get_keyring_entry(&profile_keyring_user(profile_id)) {
        let _ = entry.delete_password();
    }

    record_security_event(
        "PROFILE_DELETED",
        Some(&actor),
        format!("Perfil {} excluído permanentemente", profile.nome),
        true,
    )
    .await;

    Ok(true)
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
        super::operator_errors::mapear_erro_sql(e)
    })
}

fn validate_email_format(email: &str) -> Result<(), String> {
    let trimmed = email.trim();
    if trimmed.is_empty() {
        return Err("Email é obrigatório".to_string());
    }
    if !trimmed.contains('@') {
        return Err("Email inválido".to_string());
    }
    let parts: Vec<&str> = trimmed.split('@').collect();
    if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() || !parts[1].contains('.') {
        return Err("Email inválido".to_string());
    }
    Ok(())
}

fn validate_senha_format(senha: &str) -> Result<(), String> {
    if senha.len() < 6 {
        return Err("Senha deve ter no mínimo 6 caracteres".to_string());
    }
    Ok(())
}

fn hash_company_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| {
            error!("Erro ao gerar hash da senha da empresa: {}", error);
            "Não foi possível proteger a senha da empresa".to_string()
        })
}

fn verify_company_password(password: &str, password_hash: &str) -> bool {
    PasswordHash::new(password_hash)
        .ok()
        .and_then(|parsed| Argon2::default().verify_password(password.as_bytes(), &parsed).ok())
        .is_some()
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn registrar_empresa(
    nome: String,
    email: String,
    cnpj: Option<String>,
    senha: String,
) -> Result<RegistroEmpresaResult, String> {
    validate_email_format(&email)?;
    validate_senha_format(&senha)?;

    let nome = nome.trim();
    if nome.is_empty() {
        return Err("Nome da empresa é obrigatório".to_string());
    }
    let senha_hash = hash_company_password(&senha)?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let existing = sqlx::query("SELECT id FROM empresas WHERE email = $1")
        .bind(&email)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao verificar email existente: {}", e);
            super::operator_errors::mapear_erro_sql(e)
        })?;

    if existing.is_some() {
        return Err("Email já cadastrado".to_string());
    }

    let mut tx = pool.begin().await.map_err(|e| {
        error!("Erro ao iniciar transação de registro de empresa: {}", e);
        super::operator_errors::mapear_erro_sql(e)
    })?;

    let row = sqlx::query(
        "INSERT INTO empresas (nome, email, cnpj, status, senha_hash) VALUES ($1, $2, $3, 'pendente', $4) RETURNING id"
    )
    .bind(nome)
    .bind(&email)
    .bind(cnpj.as_deref())
    .bind(&senha_hash)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        error!("Erro ao registrar empresa: {}", e);
        super::operator_errors::mapear_erro_sql(e)
    })?;

    let empresa_id: i32 = row.try_get("id").map_err(super::operator_errors::mapear_erro_sql)?;

    let permissions = serde_json::to_string(&ALL_PERMISSIONS.iter().map(|p| p.to_string()).collect::<Vec<_>>())
        .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, empresa_id, pin_required, atualizado_em) \
         VALUES ($1, $2, $3, true, true, $4, false, NOW())"
    )
    .bind("Administrador Local")
    .bind("ADMIN")
    .bind(&permissions)
    .bind(empresa_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        error!("Erro ao criar perfil administrador para empresa {}: {}", empresa_id, e);
        super::operator_errors::mapear_erro_sql(e)
    })?;

    tx.commit().await.map_err(|e| {
        error!("Erro ao confirmar transação de registro de empresa: {}", e);
        super::operator_errors::mapear_erro_sql(e)
    })?;

    Ok(RegistroEmpresaResult {
        empresa_id,
        status: "pendente".to_string(),
        mensagem: "Empresa registrada com sucesso. Aguarde aprovação.".to_string(),
    })
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn login_empresa(
    email: String,
    senha: String,
) -> Result<LoginEmpresaResult, String> {
    validate_email_format(&email)?;
    validate_senha_format(&senha)?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let row = sqlx::query("SELECT id, nome, status, senha_hash FROM empresas WHERE email = $1")
        .bind(&email)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao buscar empresa por email: {}", e);
            super::operator_errors::mapear_erro_sql(e)
        })?;

    let Some(row) = row else {
        return Err("Email não cadastrado".to_string());
    };

    let empresa_id: i32 = row.try_get("id").map_err(super::operator_errors::mapear_erro_sql)?;
    let nome: String = row.try_get("nome").map_err(super::operator_errors::mapear_erro_sql)?;
    let status: String = row.try_get("status").map_err(super::operator_errors::mapear_erro_sql)?;
    let senha_hash: Option<String> = row.try_get("senha_hash").map_err(super::operator_errors::mapear_erro_sql)?;

    let Some(senha_hash) = senha_hash else {
        warn!(email = %email, "Login negado: empresa sem credencial central configurada");
        return Err("Esta conta ainda não possui uma senha central configurada. Solicite a recuperação de acesso.".to_string());
    };
    if !verify_company_password(&senha, &senha_hash) {
        warn!(email = %email, "Login de empresa com senha inválida");
        return Err("Email ou senha inválidos".to_string());
    }

    match status.as_str() {
        "pendente" => Err("Conta pendente de aprovação".to_string()),
        "suspenso" => Err("Conta suspensa".to_string()),
        "ativo" => Ok(LoginEmpresaResult {
            empresa_id,
            nome,
            status,
        }),
        _ => Err("Status da conta inválido".to_string()),
    }
}

/// Provisions a PIN for a new machine using an enrollment code.
///
/// Flow: validate enrollment code → create security profile (TECNICO role) → store PIN in keyring.
/// Called from the EnrollmentDialog when a new machine enters a code + sets a PIN.
#[tauri::command]
#[instrument(skip_all)]
pub async fn provision_pin_with_enrollment(
    enrollment_code: String,
    pin: String,
    profile_name: String,
) -> Result<serde_json::Value, String> {
    use crate::commands::enrollment::validate_enrollment_code;

    validate_pin_format(&pin)?;

    let nome = profile_name.trim();
    if nome.len() < 3 {
        return Err("Nome do perfil deve ter no mínimo 3 caracteres".to_string());
    }

    // Validate the enrollment code (marks it as used in Supabase)
    let validation = validate_enrollment_code(enrollment_code).await?;
    let empresa_id = validation["empresa_id"]
        .as_str()
        .unwrap_or("00000000-0000-0000-0000-000000000001");

    // Create a new security profile with TECNICO role (default for enrolled machines)
    let role = "TECNICO";
    let permissions: Vec<String> = Vec::new();
    let permissions_json = serde_json::to_string(&permissions).map_err(|e| e.to_string())?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let row = sqlx::query(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em)
         VALUES ($1, $2, $3, true, false, NOW()) RETURNING id",
    )
    .bind(nome)
    .bind(role)
    .bind(&permissions_json)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao criar perfil via enrollment: {}", e);
        super::operator_errors::mapear_erro_sql(e)
    })?;

    let profile_id: i32 = row.try_get("id").map_err(super::operator_errors::mapear_erro_sql)?;

    // Store PIN in keyring
    store_profile_pin(profile_id, &pin)?;

    // Audit event (fire-and-forget)
    spawn_security_event(
        "ENROLLMENT_PROVISIONED",
        None,
        format!(
            "Perfil '{}' (id={}) provisionado via enrollment code para empresa {}",
            nome, profile_id, empresa_id
        ),
        true,
    );

    debug!(
        "Perfil {} provisionado via enrollment (profile_id={}, empresa_id={})",
        nome, profile_id, empresa_id
    );

    Ok(serde_json::json!({
        "success": true,
        "profile_id": profile_id,
    }))
}

// ─── Perfil: primeiro acesso por código, personalização e tour ───────────────

/// Ícones de avatar oferecidos na interface (nomes do lucide-react em kebab-case).
const AVATAR_ICONES: [&str; 12] = [
    "headphones", "wrench", "printer", "coffee", "star", "zap",
    "leaf", "flame", "rocket", "heart", "music", "gamepad-2",
];
const AVATAR_CORES: [&str; 10] = [
    "#2563EB", "#4F46E5", "#7C3AED", "#C026D3", "#E11D48",
    "#EA580C", "#B45309", "#15803D", "#0F766E", "#475569",
];
/// Sem caracteres ambíguos (0/O, 1/I/L) para o código ser ditado sem erro.
const CODIGO_ALFABETO: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODIGO_TAMANHO: usize = 6;
const CODIGO_VALIDADE_HORAS: i64 = 24;
/// Palpites errados que um código aguenta antes de ser revogado. Contados no banco: não
/// somem ao reiniciar o app e não se misturam com o bloqueio de tentativas de PIN.
const CODIGO_MAX_TENTATIVAS: i32 = 5;

#[derive(Debug, Serialize)]
pub struct CodigoPrimeiroAcesso {
    pub profile_id: i32,
    pub nome: String,
    pub codigo: String,
    pub expira_em: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct PersonalizacaoPerfilInput {
    pub nome: String,
    pub avatar_icone: Option<String>,
    pub avatar_cor: Option<String>,
    pub tema: Option<String>,
    pub concluir_onboarding: bool,
}

fn gerar_codigo_acesso() -> String {
    use rand::Rng;
    let mut rng = rand::rngs::OsRng;
    (0..CODIGO_TAMANHO)
        .map(|_| CODIGO_ALFABETO[rng.gen_range(0..CODIGO_ALFABETO.len())] as char)
        .collect()
}

pub(crate) fn normalizar_codigo_acesso(raw: &str) -> String {
    raw.chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_uppercase())
        .collect()
}

fn formatar_codigo_acesso(codigo: &str) -> String {
    let (inicio, fim) = codigo.split_at(CODIGO_TAMANHO / 2);
    format!("{}-{}", inicio, fim)
}

fn validar_personalizacao(input: &PersonalizacaoPerfilInput) -> Result<(), String> {
    let nome = input.nome.trim();
    if nome.chars().count() < 3 || nome.chars().count() > 40 {
        return Err("O nome deve ter entre 3 e 40 caracteres.".to_string());
    }
    if let Some(icone) = input.avatar_icone.as_deref() {
        if !AVATAR_ICONES.contains(&icone) {
            return Err("Ícone de perfil inválido.".to_string());
        }
    }
    if let Some(cor) = input.avatar_cor.as_deref() {
        if !AVATAR_CORES.contains(&cor) {
            return Err("Cor de perfil inválida.".to_string());
        }
    }
    if let Some(tema) = input.tema.as_deref() {
        if tema != "light" && tema != "dark" {
            return Err("Tema inválido.".to_string());
        }
    }
    Ok(())
}

/// Revoga os códigos abertos do perfil e emite um novo dentro da transação recebida.
///
/// Dois administradores podem emitir ao mesmo tempo para o mesmo perfil: a linha do perfil é
/// travada para serializar as emissões (a segunda espera, revoga o código da primeira e emite
/// o seu) e o índice único parcial garante, no banco, no máximo um código aberto por perfil.
pub(crate) async fn emitir_codigo_primeiro_acesso(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    profile_id: i32,
    actor_id: i32,
) -> Result<(String, DateTime<Utc>), String> {
    sqlx::query("SELECT id FROM security_profiles WHERE id = $1 FOR UPDATE")
        .bind(profile_id)
        .fetch_one(&mut **tx)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;

    sqlx::query(
        "UPDATE codigos_primeiro_acesso SET revogado_em = NOW()
         WHERE profile_id = $1 AND usado_em IS NULL AND revogado_em IS NULL",
    )
    .bind(profile_id)
    .execute(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    let codigo = gerar_codigo_acesso();
    let expira_em: DateTime<Utc> = sqlx::query_scalar(
        "INSERT INTO codigos_primeiro_acesso (profile_id, codigo_hash, expira_em, criado_por_profile_id)
         VALUES ($1, $2, NOW() + make_interval(hours => $3), $4)
         RETURNING expira_em",
    )
    .bind(profile_id)
    .bind(hash_pin_argon2(&codigo)?)
    .bind(CODIGO_VALIDADE_HORAS as i32)
    .bind(actor_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    Ok((codigo, expira_em))
}

/// Cria um perfil sem PIN local e devolve o código que a pessoa usa no primeiro acesso.
/// O administrador nunca define nem conhece o PIN definitivo.
#[tauri::command]
#[instrument(skip_all)]
pub async fn criar_perfil_com_codigo(input: SecurityProfileInput, admin_pin: String) -> Result<CodigoPrimeiroAcesso, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    confirm_authenticated_profile_pin(&actor, &admin_pin).await?;

    let nome = input.nome.trim();
    if nome.chars().count() < 3 {
        return Err("Nome do perfil deve ter no mínimo 3 caracteres".to_string());
    }
    let role = normalize_role(&input.role)?;
    let permissions = normalize_permissions(&role, &input.permissions)?;
    let permissions_json = serde_json::to_string(&permissions).map_err(|e| e.to_string())?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let mut tx = pool.begin().await.map_err(super::operator_errors::mapear_erro_sql)?;
    // O novo membro herda a empresa de quem o cadastrou.
    let profile_id: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, pin_required, empresa_id, atualizado_em)
         VALUES ($1, $2, $3, true, false, true, (SELECT empresa_id FROM security_profiles WHERE id = $4), NOW())
         RETURNING id",
    )
    .bind(nome)
    .bind(&role)
    .bind(&permissions_json)
    .bind(actor.id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        let resposta = super::operator_errors::mapear_erro_sql(e);
        if resposta.starts_with("AUTOOS:23505") {
            resposta
        } else {
            super::operator_errors::trocar_frase(&resposta, "Não foi possível criar o perfil. Tente novamente.")
        }
    })?;
    let (codigo, expira_em) = emitir_codigo_primeiro_acesso(&mut tx, profile_id, actor.id).await?;
    tx.commit().await.map_err(super::operator_errors::mapear_erro_sql)?;

    record_security_event(
        "PROFILE_CREATED",
        Some(&actor),
        format!("Perfil {} criado com papel {} e código de primeiro acesso", nome, role),
        true,
    )
    .await;

    Ok(CodigoPrimeiroAcesso {
        profile_id,
        nome: nome.to_string(),
        codigo: formatar_codigo_acesso(&codigo),
        expira_em: expira_em.to_rfc3339(),
    })
}

/// Gera um novo código para um perfil existente: outro computador ou PIN esquecido.
/// Qualquer código anterior ainda aberto deixa de valer. Como o código permite
/// criar um PIN novo para o perfil, exige o PIN do administrador, igual à troca de PIN.
#[tauri::command]
#[instrument(skip_all)]
pub async fn gerar_codigo_primeiro_acesso(profile_id: i32, admin_pin: String) -> Result<CodigoPrimeiroAcesso, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    confirm_authenticated_profile_pin(&actor, &admin_pin).await?;
    let profile = fetch_profile_record_by_id(profile_id).await?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let mut tx = pool.begin().await.map_err(super::operator_errors::mapear_erro_sql)?;
    let (codigo, expira_em) = emitir_codigo_primeiro_acesso(&mut tx, profile.id, actor.id).await?;
    tx.commit().await.map_err(super::operator_errors::mapear_erro_sql)?;

    record_security_event(
        "ACCESS_CODE_ISSUED",
        Some(&actor),
        format!("Código de primeiro acesso gerado para o perfil {}", profile.nome),
        true,
    )
    .await;

    Ok(CodigoPrimeiroAcesso {
        profile_id: profile.id,
        nome: profile.nome,
        codigo: formatar_codigo_acesso(&codigo),
        expira_em: expira_em.to_rfc3339(),
    })
}

/// Confere o código sem consumi-lo. Palpite errado é contado no banco e revoga o código ao
/// atingir `CODIGO_MAX_TENTATIVAS`. A transação é curta e termina aqui, antes de qualquer
/// espera pelo keyring, para não deixar a linha do código travada.
pub(crate) async fn conferir_codigo_primeiro_acesso(
    pool: &PgPool,
    summary: &SecurityProfileSummary,
    codigo: &str,
) -> Result<i32, String> {
    let profile_id = summary.id;
    let mut tx = pool.begin().await.map_err(super::operator_errors::mapear_erro_sql)?;

    let abertos: Vec<(i32, String)> = sqlx::query_as(
        "SELECT id, codigo_hash FROM codigos_primeiro_acesso
         WHERE profile_id = $1 AND usado_em IS NULL AND revogado_em IS NULL AND expira_em > NOW()
         FOR UPDATE",
    )
    .bind(profile_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    let encontrado = abertos.into_iter().find(|(_, hash)| {
        PasswordHash::new(hash)
            .map(|parsed| Argon2::default().verify_password(codigo.as_bytes(), &parsed).is_ok())
            .unwrap_or(false)
    });

    let Some((codigo_id, _)) = encontrado else {
        let revogados: i64 = sqlx::query_scalar(
            "WITH atualizados AS (
                 UPDATE codigos_primeiro_acesso
                    SET tentativas = tentativas + 1,
                        revogado_em = CASE WHEN tentativas + 1 >= $2 THEN NOW() ELSE revogado_em END
                  WHERE profile_id = $1 AND usado_em IS NULL AND revogado_em IS NULL AND expira_em > NOW()
              RETURNING revogado_em
             )
             SELECT COUNT(*) FILTER (WHERE revogado_em IS NOT NULL) FROM atualizados",
        )
        .bind(profile_id)
        .bind(CODIGO_MAX_TENTATIVAS)
        .fetch_one(&mut *tx)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
        tx.commit().await.map_err(super::operator_errors::mapear_erro_sql)?;

        let detalhe = if revogados > 0 {
            "Código de primeiro acesso inválido; revogado por excesso de tentativas"
        } else {
            "Código de primeiro acesso inválido ou expirado"
        };
        record_security_event("ACCESS_CODE_FAILED", Some(summary), detalhe, false).await;
        return Err(if revogados > 0 {
            "Muitas tentativas inválidas: o código foi bloqueado. Peça um novo código ao administrador.".to_string()
        } else {
            "Código inválido ou expirado. Peça um novo código ao administrador.".to_string()
        });
    };

    // Nada mudou: só libera a linha.
    tx.rollback().await.map_err(super::operator_errors::mapear_erro_sql)?;
    Ok(codigo_id)
}

/// Consome o código com uma única instrução condicional. Devolve `false` se ele já foi usado,
/// revogado ou expirou desde a conferência (por exemplo, usado em outro computador).
pub(crate) async fn consumir_codigo_primeiro_acesso(pool: &PgPool, codigo_id: i32) -> Result<bool, String> {
    let result = sqlx::query(
        "UPDATE codigos_primeiro_acesso SET usado_em = NOW()
         WHERE id = $1 AND usado_em IS NULL AND revogado_em IS NULL AND expira_em > NOW()",
    )
    .bind(codigo_id)
    .execute(pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    Ok(result.rows_affected() == 1)
}

fn delete_profile_pin_record(profile_id: i32) -> Result<(), String> {
    let entry = get_keyring_entry(&profile_keyring_user(profile_id))?;
    match entry.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => {
            error!("Erro ao remover PIN do acesso sensível: {}", e);
            Err(KEYRING_UNAVAILABLE_MESSAGE.to_string())
        }
    }
}

/// Devolve o keyring ao estado anterior à ativação (PIN antigo, ou nenhum PIN).
pub(crate) async fn restaurar_pin_anterior(profile_id: i32, anterior: Option<StoredSensitivePin>) {
    let resultado = run_keyring_blocking(KEYRING_WRITE_TIMEOUT, move || match anterior {
        Some(record) => store_profile_pin_record(profile_id, &record),
        None => delete_profile_pin_record(profile_id),
    })
    .await;
    if let Err(motivo) = resultado {
        warn!("Não foi possível desfazer a gravação do PIN do perfil {}: {}", profile_id, motivo);
    }
}

/// Usa o código para ativar o perfil neste computador: grava o PIN escolhido pela
/// pessoa no keyring local e abre a sessão. Não exige sessão prévia.
///
/// Ordem: (1) confere o código numa transação curta; (2) grava o PIN no keyring, sem nenhuma
/// transação aberta, com limite de 30 s; (3) consome o código com um UPDATE condicional. Se o
/// keyring recusar ou demorar, o código continua valendo. Se o código deixar de valer entre
/// (1) e (3), o PIN anterior volta ao keyring. Palpites errados são contados no banco.
#[tauri::command]
#[instrument(skip_all)]
pub async fn ativar_perfil_com_codigo(
    profile_id: i32,
    codigo: String,
    pin: String,
    confirm_pin: String,
) -> Result<SensitiveAccessStatus, String> {
    if pin.trim().is_empty() {
        return Err("Crie um PIN de 4 a 8 dígitos.".to_string());
    }
    validate_pin_format(&pin)?;
    if pin.trim() != confirm_pin.trim() {
        return Err("Os PINs não conferem.".to_string());
    }

    let record = fetch_profile_record_by_id(profile_id).await?;
    let summary = to_profile_summary(record)?;
    let codigo = normalizar_codigo_acesso(&codigo);
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let codigo_id = conferir_codigo_primeiro_acesso(&pool, &summary, &codigo).await?;

    // Uma única chamada ao keyring, com um só limite de tempo: guarda o PIN anterior (recuperação
    // de PIN) para voltar se o código não puder ser consumido e grava o novo.
    let pin_para_gravar = pin.clone();
    let anterior = match run_keyring_blocking(KEYRING_WRITE_TIMEOUT, move || {
        let anterior = load_profile_pin(profile_id).ok().flatten();
        store_profile_pin(profile_id, &pin_para_gravar)?;
        Ok(anterior)
    })
    .await
    {
        Ok(anterior) => anterior,
        Err(motivo) => {
            record_security_event("ACCESS_CODE_FAILED", Some(&summary), "Falha ao gravar o PIN no cofre de senhas do sistema; o código continua válido", false).await;
            return Err(format!("{motivo} O código continua válido."));
        }
    };

    match consumir_codigo_primeiro_acesso(&pool, codigo_id).await {
        Ok(true) => {}
        Ok(false) => {
            restaurar_pin_anterior(profile_id, anterior).await;
            record_security_event("ACCESS_CODE_FAILED", Some(&summary), "O código deixou de valer durante a ativação", false).await;
            return Err("Este código não vale mais (já foi usado, revogado ou expirou). Peça um novo código ao administrador.".to_string());
        }
        Err(erro) => {
            restaurar_pin_anterior(profile_id, anterior).await;
            return Err(erro);
        }
    }

    mark_profile_pin_required(profile_id).await?;
    reset_unlock_attempts(profile_id);
    let summary = to_profile_summary(fetch_profile_record_by_id(profile_id).await?)?;
    unlock_session(summary.clone())?;
    record_security_event("ACCESS_CODE_REDEEMED", Some(&summary), "Perfil ativado neste computador com código de primeiro acesso", true).await;
    status_snapshot().await
}

/// Salva nome, ícone, cor e tema do perfil da sessão. Com `concluir_onboarding`,
/// marca o primeiro acesso como concluído.
#[tauri::command]
#[instrument(skip_all)]
pub async fn salvar_personalizacao_perfil(input: PersonalizacaoPerfilInput) -> Result<SensitiveAccessStatus, String> {
    let profile = require_sensitive_access()?;
    validar_personalizacao(&input)?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let nome = input.nome.trim();
    sqlx::query(
        "UPDATE security_profiles
         SET nome = $1, avatar_icone = $2, avatar_cor = $3, tema = $4,
             onboarding_concluido_em = CASE WHEN $5 THEN COALESCE(onboarding_concluido_em, NOW()) ELSE onboarding_concluido_em END,
             atualizado_em = NOW()
         WHERE id = $6 AND ativo = true",
    )
    .bind(nome)
    .bind(input.avatar_icone.as_deref())
    .bind(input.avatar_cor.as_deref())
    .bind(input.tema.as_deref())
    .bind(input.concluir_onboarding)
    .bind(profile.id)
    .execute(&pool)
    .await
    .map_err(|e| {
        let resposta = super::operator_errors::mapear_erro_sql(e);
        if resposta.starts_with("AUTOOS:23505") {
            resposta
        } else {
            super::operator_errors::trocar_frase(&resposta, "Não foi possível salvar o perfil. Tente novamente.")
        }
    })?;

    if profile.nome != nome {
        record_security_event(
            "PROFILE_RENAMED",
            Some(&profile),
            format!("Perfil {} passou a se chamar {}", profile.nome, nome),
            true,
        )
        .await;
    }
    status_snapshot().await
}

/// Registra que o tour apresentou todas as permissões atuais do perfil da sessão.
#[tauri::command]
#[instrument(skip_all)]
pub async fn registrar_tour_visto() -> Result<SensitiveAccessStatus, String> {
    let profile = require_sensitive_access()?;
    let atual = to_profile_summary(fetch_profile_record_by_id(profile.id).await?)?;
    let vistas = serde_json::to_string(&atual.permissions).map_err(|e| e.to_string())?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE security_profiles SET tour_permissoes_vistas = $1 WHERE id = $2")
        .bind(vistas)
        .bind(atual.id)
        .execute(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
    status_snapshot().await
}

/// Últimos eventos de auditoria do próprio perfil (não exige gerenciar perfis).
#[tauri::command]
#[instrument(skip_all)]
pub async fn listar_minhas_acoes(limit: Option<i32>) -> Result<Vec<SecurityAuditEventRow>, String> {
    let profile = require_sensitive_access()?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let max_items = limit.unwrap_or(5).clamp(1, 20) as i64;

    sqlx::query_as::<_, SecurityAuditEventRow>(
        "SELECT id, event_type, profile_id, profile_name, details, success, created_at::text AS created_at
         FROM security_audit_log
         WHERE profile_id = $1 AND success = true
         ORDER BY created_at DESC
         LIMIT $2"
    )
    .bind(profile.id)
    .bind(max_items)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao listar ações do perfil: {}", e);
        super::operator_errors::mapear_erro_sql(e)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Os testes de sessão mexem em estáticos do processo (sessão e flag de inatividade).
    static SESSION_TEST_LOCK: Mutex<()> = Mutex::new(());

    fn session_test_guard() -> std::sync::MutexGuard<'static, ()> {
        SESSION_TEST_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn unlocked_test_session(inactivity_lock: bool, expires_in: Duration) {
        INACTIVITY_LOCK_ENABLED.store(inactivity_lock, Ordering::Relaxed);
        unlock_session(SecurityProfileSummary {
            id: 9001,
            nome: "Sessão de teste".to_string(),
            role: "TECNICO".to_string(),
            ..Default::default()
        })
        .expect("sessão de teste");
        session_state().lock().unwrap().unlocked_until = Some(Utc::now() + expires_in);
    }

    fn session_expiry() -> DateTime<Utc> {
        session_state().lock().unwrap().unlocked_until.expect("sessão aberta")
    }

    #[test]
    fn background_reads_do_not_extend_the_session_but_user_actions_do() {
        let _guard = session_test_guard();
        unlocked_test_session(true, Duration::minutes(1));
        let before = session_expiry();

        // O sino do portal consulta a cada 30 s: não pode prorrogar os 15 minutos.
        for _ in 0..3 {
            require_sensitive_access_without_touch().expect("sessão ainda aberta");
        }
        assert_eq!(session_expiry(), before);

        require_sensitive_access().expect("ação do usuário");
        assert!(session_expiry() > Utc::now() + Duration::minutes(10));

        INACTIVITY_LOCK_ENABLED.store(false, Ordering::Relaxed);
        clear_session().unwrap();
    }

    #[test]
    fn expired_session_is_locked_for_background_reads_and_user_actions_when_the_lock_is_on() {
        let _guard = session_test_guard();
        unlocked_test_session(true, -Duration::minutes(1));

        assert!(require_sensitive_access_without_touch().is_err());
        assert!(require_sensitive_access().is_err());
        assert!(current_session_profile().unwrap().is_none());

        INACTIVITY_LOCK_ENABLED.store(false, Ordering::Relaxed);
        clear_session().unwrap();
    }

    #[test]
    fn with_the_lock_off_the_session_never_expires() {
        let _guard = session_test_guard();
        unlocked_test_session(false, -Duration::minutes(1));

        assert!(require_sensitive_access_without_touch().is_ok());
        assert!(require_sensitive_access().is_ok());
        assert!(session_expiry() > Utc::now() + Duration::minutes(10));

        clear_session().unwrap();
    }

    #[tokio::test]
    async fn keyring_call_that_never_answers_gives_up_instead_of_holding_the_worker() {
        let started = std::time::Instant::now();
        let result: Result<(), String> = run_keyring_blocking(std::time::Duration::from_millis(50), || {
            std::thread::sleep(std::time::Duration::from_millis(600));
            Ok(())
        })
        .await;

        assert_eq!(result.unwrap_err(), KEYRING_TIMEOUT_MESSAGE);
        assert!(started.elapsed() < std::time::Duration::from_millis(400));
    }

    #[tokio::test]
    async fn keyring_call_passes_through_success_and_its_own_error() {
        let ok = run_keyring_blocking(std::time::Duration::from_secs(5), || Ok(7)).await;
        assert_eq!(ok, Ok(7));
        let failed: Result<(), String> =
            run_keyring_blocking(std::time::Duration::from_secs(5), || Err(KEYRING_UNAVAILABLE_MESSAGE.to_string())).await;
        assert_eq!(failed.unwrap_err(), KEYRING_UNAVAILABLE_MESSAGE);
    }

    #[test]
    fn keyring_messages_are_in_portuguese_and_leak_no_platform_detail() {
        for message in [KEYRING_UNAVAILABLE_MESSAGE, KEYRING_TIMEOUT_MESSAGE] {
            assert!(message.contains("cofre de senhas"));
            assert!(!message.to_lowercase().contains("zbus"));
            assert!(!message.contains("Platform"));
        }
    }

    #[tokio::test]
    async fn company_lookup_does_not_expose_database_error_details() {
        let error = sqlx::Error::Io(std::io::Error::other("private connection detail"));
        let message = active_session_company_query_error(error).await;

        assert!(message.contains("Erro ao identificar a empresa"));
        assert!(message.contains("Não foi possível alcançar o banco"));
        assert!(!message.contains("private connection detail"));
    }

    #[test]
    fn company_password_hash_requires_the_original_password() {
        let hash = hash_company_password("senha-segura-123").expect("hash deve ser criado");
        assert!(verify_company_password("senha-segura-123", &hash));
        assert!(!verify_company_password("senha-incorreta", &hash));
    }

    #[test]
    fn stale_keyring_pin_is_detected_when_profile_id_is_reused() {
        let profile = SecurityProfileRecord {
            id: 1,
            nome: "Administrador Local".to_string(),
            role: "ADMIN".to_string(),
            permissions: "[]".to_string(),
            pin_required: true,
            ativo: true,
            is_default: true,
            criado_em: chrono::NaiveDate::from_ymd_opt(2026, 8, 13)
                .expect("data válida")
                .and_hms_opt(12, 0, 0)
                .expect("hora válida"),
            avatar_icone: None,
            avatar_cor: None,
            tema: None,
            onboarding_concluido_em: None,
            tour_permissoes_vistas: None,
        };
        let stale = StoredSensitivePin {
            pin_hash: "$argon2id$placeholder".to_string(),
            created_at: "2026-08-12T12:00:00Z".to_string(),
        };
        let current = StoredSensitivePin {
            pin_hash: "$argon2id$placeholder".to_string(),
            created_at: "2026-08-13T12:00:01Z".to_string(),
        };

        assert!(pin_record_is_older_than_profile(&stale, &profile));
        assert!(!pin_record_is_older_than_profile(&current, &profile));
    }

    fn build_profile(role: &str, permissions: &[&str]) -> SecurityProfileSummary {
        SecurityProfileSummary {
            id: 1,
            nome: "Operador".to_string(),
            role: role.to_string(),
            permissions: permissions.iter().map(|permission| permission.to_string()).collect(),
            pin_configured: true,
            pin_required: true,
            is_default: false,
            ativo: true,
            ..Default::default()
        }
    }

    #[test]
    fn codigo_de_acesso_usa_apenas_caracteres_sem_ambiguidade() {
        for _ in 0..50 {
            let codigo = gerar_codigo_acesso();
            assert_eq!(codigo.len(), CODIGO_TAMANHO);
            assert!(codigo.bytes().all(|byte| CODIGO_ALFABETO.contains(&byte)));
        }
    }

    #[test]
    fn promocao_a_administrador_nao_depende_do_keyring_deste_computador() {
        // Ativado só em outro computador: sem PIN aqui, mas o banco diz que exige PIN.
        let outro_pc = SecurityProfileSummary { pin_configured: false, pin_required: true, ..build_profile("TECNICO", &[]) };
        assert!(profile_requires_pin(&outro_pc));
        // Perfil antigo que tem PIN neste computador continua valendo.
        let local = SecurityProfileSummary { pin_configured: true, pin_required: false, ..build_profile("TECNICO", &[]) };
        assert!(profile_requires_pin(&local));
        // Sem PIN em lugar nenhum e sem exigência: não pode virar administrador.
        let sem_pin = SecurityProfileSummary { pin_configured: false, pin_required: false, ..build_profile("TECNICO", &[]) };
        assert!(!profile_requires_pin(&sem_pin));
    }

    #[test]
    fn codigo_digitado_e_normalizado_antes_da_conferencia() {
        assert_eq!(normalizar_codigo_acesso(" k7q-42m "), "K7Q42M");
        assert_eq!(formatar_codigo_acesso("K7Q42M"), "K7Q-42M");
    }

    #[test]
    fn personalizacao_aceita_apenas_opcoes_da_interface() {
        let valida = PersonalizacaoPerfilInput {
            nome: "Juliana".to_string(),
            avatar_icone: Some("headphones".to_string()),
            avatar_cor: Some("#0F766E".to_string()),
            tema: Some("dark".to_string()),
            concluir_onboarding: true,
        };
        assert!(validar_personalizacao(&valida).is_ok());
        assert!(validar_personalizacao(&PersonalizacaoPerfilInput { nome: "Jo".to_string(), ..Default::default() }).is_err());
        assert!(validar_personalizacao(&PersonalizacaoPerfilInput { avatar_icone: Some("skull".to_string()), ..valida_clone(&valida) }).is_err());
        assert!(validar_personalizacao(&PersonalizacaoPerfilInput { avatar_cor: Some("#123456".to_string()), ..valida_clone(&valida) }).is_err());
        assert!(validar_personalizacao(&PersonalizacaoPerfilInput { tema: Some("system".to_string()), ..valida_clone(&valida) }).is_err());
    }

    fn valida_clone(input: &PersonalizacaoPerfilInput) -> PersonalizacaoPerfilInput {
        PersonalizacaoPerfilInput {
            nome: input.nome.clone(),
            avatar_icone: input.avatar_icone.clone(),
            avatar_cor: input.avatar_cor.clone(),
            tema: input.tema.clone(),
            concluir_onboarding: input.concluir_onboarding,
        }
    }

    #[test]
    fn basic_operator_does_not_need_sensitive_permissions() {
        assert_eq!(normalize_permissions("ATENDENTE", &[]).unwrap(), Vec::<String>::new());
        assert!(normalize_permissions("CUSTOM", &["UNKNOWN".to_string()]).is_err());
    }

    #[test]
    fn missing_local_pin_never_downgrades_a_required_identity() {
        for role in ["ATENDENTE", "TECNICO", "ADMIN"] {
            let mut profile = build_profile(role, &[]);
            profile.pin_configured = false;
            assert!(ensure_pinless_session_allowed(&profile).is_err());
        }
        let mut bootstrap_admin = build_profile("ADMIN", &[]);
        bootstrap_admin.pin_required = false;
        bootstrap_admin.pin_configured = false;
        assert!(ensure_pinless_session_allowed(&bootstrap_admin).is_err());
        let mut optional_operator = build_profile("CUSTOM", &[]);
        optional_operator.pin_required = false;
        optional_operator.pin_configured = false;
        assert!(ensure_pinless_session_allowed(&optional_operator).is_ok());
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
