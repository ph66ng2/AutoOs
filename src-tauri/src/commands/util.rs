//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/util.rs — Comandos Utilitários                     ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  - greet: Saudação de teste (debug)                          ║
//! ║  - salvar_arquivo_temp: Salva bytes em arquivo temporário    ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::auth::{
    record_security_event, require_permission, PERMISSION_CONFIG_SMTP, PERMISSION_MANAGE_PROFILES,
};
use crate::db::{get_pool, known_migrations, run_pending_migrations};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime};
use tracing::{debug, error, info, instrument};
use url::Url;

const AUTOOS_TEMP_DIR: &str = "autoos";
const AUTOOS_BACKUP_DIR: &str = "AutoOS/backups";
const AUTOOS_ORDERS_DIR: &str = "Ordens de Servico";
const AUTOOS_QUOTES_DIR: &str = "Orcamentos";
const AUTOOS_EQUIPMENT_IMAGES_DIR: &str = "Imagens Equipamentos";
const AUTOOS_STATUS_REPORTS_DIR: &str = "Relatorios de Status";
const AUTOOS_LOCAL_DATA_DIR: &str = "AutoOS";
const AUTOOS_LOG_DIR: &str = "logs";
const AUTOOS_SUPPORT_DIR: &str = "support";
const LOCAL_TEMP_RETENTION_DAYS: u64 = 7;
const LOCAL_LOG_RETENTION_DAYS: u64 = 14;
const LOCAL_SUPPORT_RETENTION_DAYS: u64 = 30;

#[derive(Debug, Serialize, FromRow)]
struct DatabaseIdentityRow {
    database_name: String,
    schema_name: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct AppliedMigrationRow {
    version: i64,
    description: String,
    installed_on: Option<String>,
    success: bool,
}

#[derive(Debug, Serialize)]
pub struct DatabaseMigrationStatus {
    pub version: i64,
    pub description: String,
    pub installed_on: Option<String>,
    pub success: bool,
    pub applied: bool,
}

#[derive(Debug, Serialize)]
pub struct DatabaseSchemaStatus {
    pub database_name: String,
    pub schema_name: String,
    pub latest_known_version: Option<i64>,
    pub latest_applied_version: Option<i64>,
    pub applied_count: usize,
    pub known_count: usize,
    pub pending_count: usize,
    pub migrations: Vec<DatabaseMigrationStatus>,
}

#[derive(Debug, Serialize)]
pub struct PostgresBackupToolsStatus {
    pub database_name: String,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub backup_directory: String,
    pub pg_dump_available: bool,
    pub pg_restore_available: bool,
    pub psql_available: bool,
}

#[derive(Debug, Serialize)]
pub struct PostgresBackupResult {
    pub file_name: String,
    pub file_path: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct PostgresRestoreResult {
    pub file_path: String,
    pub restored_with: String,
    pub restored_at: String,
}

#[derive(Debug)]
struct ParsedDatabaseUrl {
    database_name: String,
    host: Option<String>,
    port: Option<u16>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SupportFileSummary {
    pub file_name: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub modified_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LocalHousekeepingStatus {
    pub temp_files_removed: usize,
    pub log_files_removed: usize,
    pub support_files_removed: usize,
}

#[derive(Debug, Serialize)]
pub struct WindowsBundleReadiness {
    pub product_name: String,
    pub version: String,
    pub identifier: String,
    pub targets: String,
    pub has_certificate_thumbprint: bool,
    pub has_timestamp_url: bool,
    pub icon_count: usize,
    pub blockers: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct LocalSupportStatus {
    pub product_name: String,
    pub app_version: String,
    pub app_identifier: String,
    pub target_os: String,
    pub build_profile: String,
    pub log_directory: String,
    pub support_directory: String,
    pub temp_directory: String,
    pub backup_directory: String,
    pub capability_permissions: Vec<String>,
    pub capability_review: String,
    pub recent_log_files: Vec<SupportFileSummary>,
    pub recent_support_files: Vec<SupportFileSummary>,
    pub recent_temp_files: Vec<SupportFileSummary>,
    pub schema_status: Option<DatabaseSchemaStatus>,
    pub schema_error: Option<String>,
    pub backup_tools_status: Option<PostgresBackupToolsStatus>,
    pub backup_tools_error: Option<String>,
    pub windows_bundle: WindowsBundleReadiness,
    pub housekeeping: LocalHousekeepingStatus,
}

#[derive(Debug, Serialize)]
pub struct LocalSupportBundleResult {
    pub file_name: String,
    pub file_path: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
struct TauriConfigSnapshot {
    #[serde(rename = "productName")]
    product_name: String,
    version: String,
    identifier: String,
    bundle: TauriBundleSnapshot,
}

#[derive(Debug, Deserialize)]
struct TauriBundleSnapshot {
    active: bool,
    targets: serde_json::Value,
    icon: Option<Vec<String>>,
    windows: Option<TauriBundleWindowsSnapshot>,
}

#[derive(Debug, Deserialize)]
struct TauriBundleWindowsSnapshot {
    #[serde(rename = "certificateThumbprint")]
    certificate_thumbprint: Option<String>,
    #[serde(rename = "timestampUrl")]
    timestamp_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CapabilitySnapshot {
    permissions: Vec<CapabilityPermissionEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum CapabilityPermissionEntry {
    Simple(String),
    Scoped { identifier: String },
}

pub(crate) fn local_app_data_dir() -> Result<PathBuf, String> {
    let base_dir = if cfg!(target_os = "windows") {
        env::var("LOCALAPPDATA")
            .map(PathBuf::from)
            .or_else(|_| env::var("APPDATA").map(PathBuf::from))
            .or_else(|_| env::current_dir().map(|dir| dir.join(".autoos")))
            .map_err(|e| format!("Não foi possível localizar a pasta local de dados do app: {}", e))?
    } else if let Ok(home) = env::var("HOME") {
        PathBuf::from(home).join(".local").join("share")
    } else {
        env::current_dir().map_err(|e| format!("Não foi possível localizar a pasta local de dados do app: {}", e))?
    };

    let app_dir = base_dir.join(AUTOOS_LOCAL_DATA_DIR);
    fs::create_dir_all(&app_dir).map_err(|e| format!("Erro ao preparar diretório local do app: {}", e))?;
    Ok(app_dir)
}

pub(crate) fn autoos_logs_dir() -> Result<PathBuf, String> {
    let dir = local_app_data_dir()?.join(AUTOOS_LOG_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("Erro ao preparar diretório de logs: {}", e))?;
    Ok(dir)
}

fn autoos_support_dir() -> Result<PathBuf, String> {
    let dir = local_app_data_dir()?.join(AUTOOS_SUPPORT_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("Erro ao preparar diretório de suporte: {}", e))?;
    Ok(dir)
}

fn list_recent_files(directory: &Path, limit: usize) -> Result<Vec<SupportFileSummary>, String> {
    if !directory.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(directory).map_err(|e| format!("Erro ao listar diretório {}: {}", directory.display(), e))? {
        let entry = entry.map_err(|e| format!("Erro ao ler entrada de {}: {}", directory.display(), e))?;
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Erro ao ler metadados de {}: {}", entry.path().display(), e))?;
        if !metadata.is_file() {
            continue;
        }

        let modified_at = metadata
            .modified()
            .ok()
            .map(|value| DateTime::<Utc>::from(value).to_rfc3339());
        entries.push(SupportFileSummary {
            file_name: entry.file_name().to_string_lossy().to_string(),
            file_path: entry.path().to_string_lossy().to_string(),
            size_bytes: metadata.len(),
            modified_at,
        });
    }

    entries.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));
    entries.truncate(limit);
    Ok(entries)
}

fn prune_old_files(directory: &Path, max_age_days: u64) -> Result<usize, String> {
    if !directory.exists() {
        return Ok(0);
    }

    let now = SystemTime::now();
    let max_age = Duration::from_secs(max_age_days * 24 * 60 * 60);
    let mut removed = 0;

    for entry in fs::read_dir(directory).map_err(|e| format!("Erro ao listar diretório {}: {}", directory.display(), e))? {
        let entry = entry.map_err(|e| format!("Erro ao ler entrada de {}: {}", directory.display(), e))?;
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Erro ao ler metadados de {}: {}", entry.path().display(), e))?;
        if !metadata.is_file() {
            continue;
        }

        if let Ok(modified_at) = metadata.modified() {
            if now.duration_since(modified_at).unwrap_or_default() > max_age {
                fs::remove_file(entry.path())
                    .map_err(|e| format!("Erro ao remover artefato antigo {}: {}", entry.path().display(), e))?;
                removed += 1;
            }
        }
    }

    Ok(removed)
}

pub(crate) fn run_local_housekeeping() -> Result<LocalHousekeepingStatus, String> {
    let temp_files_removed = prune_old_files(&autoos_temp_dir()?, LOCAL_TEMP_RETENTION_DAYS)?;
    let log_files_removed = prune_old_files(&autoos_logs_dir()?, LOCAL_LOG_RETENTION_DAYS)?;
    let support_files_removed = prune_old_files(&autoos_support_dir()?, LOCAL_SUPPORT_RETENTION_DAYS)?;

    Ok(LocalHousekeepingStatus {
        temp_files_removed,
        log_files_removed,
        support_files_removed,
    })
}

fn load_tauri_config_snapshot() -> Result<TauriConfigSnapshot, String> {
    serde_json::from_str(include_str!("../../tauri.conf.json"))
        .map_err(|e| format!("Falha ao interpretar tauri.conf.json: {}", e))
}

fn load_capability_permissions() -> Result<Vec<String>, String> {
    let capability: CapabilitySnapshot = serde_json::from_str(include_str!("../../capabilities/default.json"))
        .map_err(|e| format!("Falha ao interpretar capability principal: {}", e))?;

    Ok(capability
        .permissions
        .into_iter()
        .map(|permission| match permission {
            CapabilityPermissionEntry::Simple(value) => value,
            CapabilityPermissionEntry::Scoped { identifier } => identifier,
        })
        .collect())
}

fn build_windows_bundle_readiness(config: &TauriConfigSnapshot) -> WindowsBundleReadiness {
    let windows = config.bundle.windows.as_ref();
    let has_certificate_thumbprint = windows
        .and_then(|value| value.certificate_thumbprint.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some();
    let has_timestamp_url = windows
        .and_then(|value| value.timestamp_url.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some();

    let mut blockers = Vec::new();
    if !config.bundle.active {
        blockers.push("Empacotamento Tauri está desativado.".to_string());
    }
    if !has_certificate_thumbprint {
        blockers.push("Assinatura Windows pendente: certificateThumbprint não configurado em tauri.conf.json.".to_string());
    }
    if !has_timestamp_url {
        blockers.push("Timestamp Authenticode pendente: timestampUrl não configurado em tauri.conf.json.".to_string());
    }

    WindowsBundleReadiness {
        product_name: config.product_name.clone(),
        version: config.version.clone(),
        identifier: config.identifier.clone(),
        targets: config
            .bundle
            .targets
            .as_str()
            .map(|value| value.to_string())
            .unwrap_or_else(|| config.bundle.targets.to_string()),
        has_certificate_thumbprint,
        has_timestamp_url,
        icon_count: config.bundle.icon.as_ref().map(|icons| icons.len()).unwrap_or_default(),
        blockers,
    }
}

fn autoos_temp_dir() -> Result<PathBuf, String> {
    let temp_dir = env::temp_dir().join(AUTOOS_TEMP_DIR);
    fs::create_dir_all(&temp_dir).map_err(|e| {
        error!("Erro ao preparar diretório temporário do app: {}", e);
        format!("Erro ao preparar diretório temporário: {}", e)
    })?;
    Ok(temp_dir)
}

fn sanitize_temp_filename(filename: &str) -> Result<String, String> {
    let trimmed = filename.trim();
    if trimmed.is_empty() {
        return Err("Nome do arquivo temporário é obrigatório".to_string());
    }

    let path = Path::new(trimmed);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("Nome do arquivo temporário inválido".to_string());
    }

    let leaf = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Nome do arquivo temporário inválido".to_string())?;

    let sanitized: String = leaf
        .chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '-' | '_' => character,
            _ => '_',
        })
        .collect();

    if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
        return Err("Nome do arquivo temporário inválido".to_string());
    }

    Ok(sanitized)
}

fn current_database_url() -> Result<String, String> {
    env::var("DATABASE_URL").map_err(|_| {
        "DATABASE_URL não configurada. Ajuste a conexão PostgreSQL antes de usar o backup.".to_string()
    })
}

fn sanitize_backup_component(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => character,
            _ => '_',
        })
        .collect()
}

fn default_backup_directory() -> Result<PathBuf, String> {
    let base_dir = if cfg!(target_os = "windows") {
        if let Ok(user_profile) = env::var("USERPROFILE") {
            PathBuf::from(user_profile).join("Documents")
        } else if let (Ok(home_drive), Ok(home_path)) = (env::var("HOMEDRIVE"), env::var("HOMEPATH")) {
            PathBuf::from(format!("{}{}", home_drive, home_path)).join("Documents")
        } else {
            env::current_dir().map_err(|e| format!("Não foi possível localizar a pasta Documents: {}", e))?
        }
    } else if let Ok(home) = env::var("HOME") {
        PathBuf::from(home)
    } else {
        env::current_dir().map_err(|e| format!("Não foi possível localizar a pasta de backup: {}", e))?
    };

    let backup_dir = base_dir.join(AUTOOS_BACKUP_DIR);
    fs::create_dir_all(&backup_dir).map_err(|e| {
        error!("Erro ao preparar diretório de backup: {}", e);
        format!("Erro ao preparar diretório de backup: {}", e)
    })?;

    Ok(backup_dir)
}

fn default_documents_directory() -> Result<PathBuf, String> {
    let base_dir = if cfg!(target_os = "windows") {
        if let Ok(user_profile) = env::var("USERPROFILE") {
            PathBuf::from(user_profile).join("Documents")
        } else if let (Ok(home_drive), Ok(home_path)) = (env::var("HOMEDRIVE"), env::var("HOMEPATH")) {
            PathBuf::from(format!("{}{}", home_drive, home_path)).join("Documents")
        } else {
            env::current_dir().map_err(|e| format!("Não foi possível localizar a pasta Documents: {}", e))?
        }
    } else if let Ok(home) = env::var("HOME") {
        PathBuf::from(home).join("Documents")
    } else {
        env::current_dir().map_err(|e| format!("Não foi possível localizar a pasta Documents: {}", e))?
    };

    fs::create_dir_all(&base_dir).map_err(|e| {
        error!("Erro ao preparar diretório Documents: {}", e);
        format!("Erro ao preparar diretório Documents: {}", e)
    })?;

    Ok(base_dir)
}

fn default_orders_directory() -> Result<PathBuf, String> {
    let orders_dir = default_documents_directory()?.join(AUTOOS_ORDERS_DIR);
    fs::create_dir_all(&orders_dir).map_err(|e| {
        error!("Erro ao preparar diretório de ordens de serviço: {}", e);
        format!("Erro ao preparar diretório de ordens de serviço: {}", e)
    })?;
    Ok(orders_dir)
}

fn default_quotes_directory() -> Result<PathBuf, String> {
    let quotes_dir = default_documents_directory()?.join(AUTOOS_QUOTES_DIR);
    fs::create_dir_all(&quotes_dir).map_err(|e| {
        error!("Erro ao preparar diretório de orçamentos: {}", e);
        format!("Erro ao preparar diretório de orçamentos: {}", e)
    })?;
    Ok(quotes_dir)
}

fn default_equipment_images_directory() -> Result<PathBuf, String> {
    let images_dir = default_documents_directory()?.join(AUTOOS_EQUIPMENT_IMAGES_DIR);
    fs::create_dir_all(&images_dir).map_err(|e| {
        error!("Erro ao preparar diretório de imagens de equipamentos: {}", e);
        format!("Erro ao preparar diretório de imagens de equipamentos: {}", e)
    })?;
    Ok(images_dir)
}

fn default_status_reports_directory() -> Result<PathBuf, String> {
    let reports_dir = default_documents_directory()?.join(AUTOOS_STATUS_REPORTS_DIR);
    fs::create_dir_all(&reports_dir).map_err(|e| {
        error!("Erro ao preparar diretório de relatórios de status: {}", e);
        format!("Erro ao preparar diretório de relatórios de status: {}", e)
    })?;
    Ok(reports_dir)
}

fn sanitize_filename_component(value: &str) -> String {
    let sanitized: String = value
        .trim()
        .chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' => character,
            _ => '_',
        })
        .collect();

    sanitized
        .trim_matches('_')
        .chars()
        .take(80)
        .collect::<String>()
}

fn reveal_file_in_manager(file_path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg("/select,")
            .arg(file_path)
            .spawn()
            .map_err(|e| format!("Arquivo salvo, mas não foi possível abrir o Explorer: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let file_path_string = file_path.to_string_lossy().to_string();
        let mut commands: Vec<(&str, Vec<String>)> = vec![
            ("nautilus", vec!["--select".to_string(), file_path_string.clone()]),
            ("dolphin", vec!["--select".to_string(), file_path_string.clone()]),
            ("nemo", vec!["--no-desktop".to_string(), file_path_string.clone()]),
        ];

        for (command_name, args) in commands.drain(..) {
            if Command::new(command_name).args(&args).spawn().is_ok() {
                return Ok(());
            }
        }

        let parent = file_path.parent().unwrap_or(file_path);
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("Arquivo salvo, mas não foi possível abrir a pasta: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(file_path)
            .spawn()
            .map_err(|e| format!("Arquivo salvo, mas não foi possível abrir o Finder: {}", e))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Ok(())
}

fn parse_database_url(database_url: &str) -> Result<ParsedDatabaseUrl, String> {
    let parsed = Url::parse(database_url).map_err(|e| format!("DATABASE_URL inválida: {}", e))?;
    let database_name = parsed
        .path_segments()
        .and_then(|segments| segments.filter(|segment| !segment.is_empty()).next_back())
        .ok_or_else(|| "Não foi possível identificar o nome do banco na DATABASE_URL.".to_string())?
        .to_string();

    Ok(ParsedDatabaseUrl {
        database_name,
        host: parsed.host_str().map(|value| value.to_string()),
        port: parsed.port(),
    })
}

fn command_available(command_name: &str) -> bool {
    Command::new(command_name)
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn summarize_stderr(stderr: &[u8]) -> String {
    let message = String::from_utf8_lossy(stderr).replace(['\r', '\n'], " ");
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return "sem detalhes adicionais retornados pelo pg_dump".to_string();
    }

    trimmed.chars().take(300).collect()
}

fn normalize_restore_file_path(file_path: &str) -> Result<PathBuf, String> {
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err("Informe o caminho completo do arquivo de backup a restaurar.".to_string());
    }

    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err("Informe um caminho absoluto para o arquivo de backup (.dump ou .sql).".to_string());
    }

    let metadata = fs::metadata(&path).map_err(|e| format!("Arquivo de backup não encontrado: {}", e))?;
    if !metadata.is_file() {
        return Err("O caminho informado não aponta para um arquivo de backup válido.".to_string());
    }

    fs::canonicalize(path).map_err(|e| format!("Não foi possível resolver o caminho do backup: {}", e))
}

fn allowed_app_document_roots() -> Result<Vec<PathBuf>, String> {
    Ok(vec![
        default_orders_directory()?,
        default_quotes_directory()?,
        default_status_reports_directory()?,
        autoos_temp_dir()?,
    ])
}

fn resolve_allowed_app_document_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Caminho de origem do anexo é obrigatório".to_string());
    }

    let requested_path = PathBuf::from(trimmed);
    if !requested_path.is_absolute() {
        return Err("Caminho de origem do anexo deve ser absoluto".to_string());
    }

    let canonical = fs::canonicalize(&requested_path).map_err(|e| {
        error!("Erro ao resolver caminho de origem do anexo: {}", e);
        format!("Erro ao acessar arquivo de origem do anexo: {}", e)
    })?;

    let metadata = fs::metadata(&canonical).map_err(|e| {
        error!("Erro ao acessar arquivo de origem do anexo: {}", e);
        format!("Erro ao acessar arquivo de origem do anexo: {}", e)
    })?;
    if !metadata.is_file() {
        return Err("Origem do anexo não é um arquivo válido".to_string());
    }

    for root in allowed_app_document_roots()? {
        let canonical_root = fs::canonicalize(&root).unwrap_or(root);
        if canonical.starts_with(&canonical_root) {
            return Ok(canonical);
        }
    }

    Err("Origem do anexo deve estar em um diretório gerado pelo AutoOS".to_string())
}

fn ensure_restore_path_in_backup_directory(restore_path: &Path) -> Result<(), String> {
    let backup_root = default_backup_directory()?;
    let canonical_backup_root = fs::canonicalize(&backup_root).unwrap_or(backup_root);
    if !restore_path.starts_with(&canonical_backup_root) {
        return Err("O backup deve estar no diretório de backups do AutoOS.".to_string());
    }

    Ok(())
}

fn detect_restore_tool(file_path: &Path) -> Result<&'static str, String> {
    let extension = file_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());

    match extension.as_deref() {
        Some("dump") => Ok("pg_restore"),
        Some("sql") => Ok("psql"),
        _ => Err("Formato de backup não suportado. Use um arquivo .dump ou .sql.".to_string()),
    }
}

/// Salvar bytes em arquivo temporário.
/// Útil para salvar PDFs gerados no frontend para anexar a emails.
#[tauri::command]
#[instrument(skip_all, fields(bytes_len = bytes.len()))]
pub async fn salvar_arquivo_temp(filename: String, bytes: Vec<u8>) -> Result<String, String> {
    let safe_filename = sanitize_temp_filename(&filename)?;
    debug!("Salvando arquivo temporário seguro ({} bytes)", bytes.len());

    let file_path: PathBuf = autoos_temp_dir()?.join(&safe_filename);

    fs::write(&file_path, &bytes).map_err(|e| {
        error!("Erro ao salvar arquivo temporário seguro: {}", e);
        format!("Erro ao salvar arquivo: {}", e)
    })?;

    let path_str = file_path.to_string_lossy().to_string();
    info!("Arquivo temporário salvo com sucesso");
    Ok(path_str)
}

/// Copia um arquivo já gerado pelo app (ex.: PDF do orçamento salvo em
/// `Documents/Orcamentos`) para o diretório temporário do AutoOS, devolvendo
/// o caminho temporário. Esse caminho é o único aceito como anexo pelo
/// comando `enviar_email` (ver `resolve_allowed_attachment_path` em smtp.rs).
#[tauri::command]
#[instrument(skip_all)]
pub async fn copiar_anexo_email_para_temp(
    origem: String,
    filename: String,
) -> Result<String, String> {
    let _actor = require_permission(PERMISSION_CONFIG_SMTP)?;
    let origem_path = resolve_allowed_app_document_path(&origem)?;

    let safe_filename = sanitize_temp_filename(&filename)?;
    let destino = autoos_temp_dir()?.join(&safe_filename);

    fs::copy(&origem_path, &destino).map_err(|e| {
        error!("Erro ao copiar anexo para diretório temporário: {}", e);
        format!("Erro ao copiar anexo para diretório temporário: {}", e)
    })?;

    let destino_str = destino.to_string_lossy().to_string();
    debug!("Anexo copiado para temporário: {}", destino_str);
    Ok(destino_str)
}

/// Remove um arquivo previamente salvo no diretório temporário do AutoOS.
/// Usado para apagar anexos de email após o envio. Apenas caminhos dentro
/// do diretório temporário do app são aceitos.
#[tauri::command]
#[instrument(skip_all)]
pub async fn remover_anexo_email_temp(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Caminho do anexo temporário é obrigatório".to_string());
    }

    let allowed_root = autoos_temp_dir()?;
    let allowed_root = fs::canonicalize(&allowed_root).map_err(|e| {
        error!("Erro ao resolver diretório temporário seguro: {}", e);
        "Diretório temporário seguro indisponível".to_string()
    })?;

    let requested = PathBuf::from(trimmed);
    if !requested.is_absolute() {
        return Err("Caminho do anexo temporário deve ser absoluto".to_string());
    }

    if !requested.exists() {
        debug!("Anexo temporário já foi removido: {}", trimmed);
        return Ok(());
    }

    let canonical = fs::canonicalize(&requested).map_err(|e| {
        error!("Erro ao resolver caminho do anexo temporário: {}", e);
        format!("Erro ao acessar anexo temporário: {}", e)
    })?;

    if !canonical.starts_with(&allowed_root) {
        return Err("Anexo fora do diretório temporário permitido".to_string());
    }

    fs::remove_file(&canonical).map_err(|e| {
        error!("Erro ao remover anexo temporário: {}", e);
        format!("Erro ao remover anexo temporário: {}", e)
    })?;

    debug!("Anexo temporário removido: {}", canonical.display());
    Ok(())
}

/// Salva PDF da Ordem de Serviço em Documents/Ordens de Servico
/// e tenta abrir o gerenciador de arquivos com o arquivo selecionado.
/// Se `nome_arquivo` for fornecido, usa esse nome em vez de gerar um timestamped.
#[tauri::command]
#[instrument(skip_all, fields(bytes_len = bytes.len()))]
pub async fn salvar_ordem_servico_pdf(bytes: Vec<u8>, empresa_nome: Option<String>, nome_arquivo: Option<String>) -> Result<String, String> {
    debug!("Salvando ordem de serviço ({} bytes)", bytes.len());

    let file_name = if let Some(nome) = nome_arquivo.filter(|n| !n.is_empty()) {
        nome
    } else {
        let empresa = sanitize_filename_component(empresa_nome.as_deref().unwrap_or("Empresa"));
        let empresa = if empresa.is_empty() {
            "Empresa".to_string()
        } else {
            empresa
        };
        let created_at = Utc::now();
        format!(
            "OrdemServico_{}_{}.pdf",
            empresa,
            created_at.format("%Y-%m-%d_%H-%M-%S")
        )
    };

    let file_path = default_orders_directory()?.join(&file_name);

    fs::write(&file_path, &bytes).map_err(|e| {
        error!("Erro ao salvar ordem de serviço: {}", e);
        format!("Erro ao salvar ordem de serviço: {}", e)
    })?;

    if let Err(reveal_error) = reveal_file_in_manager(&file_path) {
        error!("{}", reveal_error);
        return Err(reveal_error);
    }

    let path_str = file_path.to_string_lossy().to_string();
    info!("Ordem de serviço salva com sucesso em {}", path_str);
    Ok(path_str)
}

/// Salva PDF do Orçamento em Documents/Orcamentos
/// e tenta abrir o gerenciador de arquivos com o arquivo selecionado.
/// Se `nome_arquivo` for fornecido, usa esse nome em vez de gerar um timestamped.
#[tauri::command]
#[instrument(skip_all, fields(bytes_len = bytes.len()))]
pub async fn salvar_orcamento_pdf(bytes: Vec<u8>, empresa_nome: Option<String>, nome_arquivo: Option<String>) -> Result<String, String> {
    debug!("Salvando orçamento ({} bytes)", bytes.len());

    let file_name = if let Some(nome) = nome_arquivo.filter(|n| !n.is_empty()) {
        nome
    } else {
        let empresa = sanitize_filename_component(empresa_nome.as_deref().unwrap_or("Cliente"));
        let empresa = if empresa.is_empty() {
            "Cliente".to_string()
        } else {
            empresa
        };
        let created_at = Utc::now();
        format!(
            "Orcamento_{}_{}.pdf",
            empresa,
            created_at.format("%Y-%m-%d_%H-%M-%S")
        )
    };

    let file_path = default_quotes_directory()?.join(&file_name);

    fs::write(&file_path, &bytes).map_err(|e| {
        error!("Erro ao salvar orçamento: {}", e);
        format!("Erro ao salvar orçamento: {}", e)
    })?;

    if let Err(reveal_error) = reveal_file_in_manager(&file_path) {
        error!("{}", reveal_error);
        return Err(reveal_error);
    }

    let path_str = file_path.to_string_lossy().to_string();
    info!("Orçamento salvo com sucesso em {}", path_str);
    Ok(path_str)
}

fn resolve_document_directory(nome_arquivo: &str) -> Result<PathBuf, String> {
    if nome_arquivo.starts_with("Orcamento_") || nome_arquivo.starts_with("orcamento_") {
        default_quotes_directory()
    } else if nome_arquivo.starts_with("OrdemServico_") || nome_arquivo.starts_with("ordemservico_") {
        default_orders_directory()
    } else if nome_arquivo.starts_with("RelatorioStatus_") || nome_arquivo.starts_with("relatoriostatus_") {
        default_status_reports_directory()
    } else {
        default_orders_directory()
    }
}

/// Check if a document exists in the appropriate Documents subdirectory.
#[tauri::command]
pub async fn verificar_documento_existe(nome_arquivo: String) -> Result<bool, String> {
    let dir = resolve_document_directory(&nome_arquivo)?;
    let path = dir.join(&nome_arquivo);
    Ok(path.exists())
}

/// Open an existing document in the file manager.
#[tauri::command]
pub async fn abrir_documento(nome_arquivo: String) -> Result<String, String> {
    let dir = resolve_document_directory(&nome_arquivo)?;
    let path = dir.join(&nome_arquivo);
    if !path.exists() {
        return Err("Documento não encontrado".to_string());
    }
    reveal_file_in_manager(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn abrir_url(url: String) -> Result<(), String> {
    let url_trimmed = url.trim().to_string();
    if url_trimmed.is_empty() || (!url_trimmed.starts_with("http://") && !url_trimmed.starts_with("https://")) {
        return Err("URL inválida".to_string());
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url_trimmed)
            .spawn()
            .map_err(|e| format!("Erro ao abrir navegador: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &url_trimmed])
            .spawn()
            .map_err(|e| format!("Erro ao abrir navegador: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url_trimmed)
            .spawn()
            .map_err(|e| format!("Erro ao abrir navegador: {}", e))?;
    }
    Ok(())
}

/// Salva imagem de equipamento em Documents/Imagens Equipamentos
/// e tenta abrir o gerenciador de arquivos com o arquivo selecionado.
#[tauri::command]
#[instrument(skip_all, fields(bytes_len = bytes.len()))]
pub async fn salvar_imagem_equipamento(
    bytes: Vec<u8>,
    file_name: Option<String>,
    mime_type: Option<String>,
) -> Result<String, String> {
    debug!("Salvando imagem de equipamento ({} bytes)", bytes.len());

    let base_name = sanitize_filename_component(file_name.as_deref().unwrap_or("imagem_equipamento"));
    let base_name = if base_name.is_empty() {
        "imagem_equipamento".to_string()
    } else {
        base_name
    };
    let extension = match mime_type.as_deref().unwrap_or("image/jpeg") {
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "jpg",
    };

    let created_at = Utc::now();
    let file_name = format!(
        "{}_{}.{}",
        base_name,
        created_at.format("%Y-%m-%d_%H-%M-%S"),
        extension
    );

    let file_path = default_equipment_images_directory()?.join(file_name);
    fs::write(&file_path, &bytes).map_err(|e| {
        error!("Erro ao salvar imagem do equipamento: {}", e);
        format!("Erro ao salvar imagem do equipamento: {}", e)
    })?;

    if let Err(reveal_error) = reveal_file_in_manager(&file_path) {
        error!("{}", reveal_error);
        return Err(reveal_error);
    }

    let path_str = file_path.to_string_lossy().to_string();
    info!("Imagem de equipamento salva com sucesso em {}", path_str);
    Ok(path_str)
}

/// Salva PDF de relatório de status em Documents/Relatorios de Status
/// e tenta abrir o gerenciador de arquivos com o arquivo selecionado.
#[tauri::command]
#[instrument(skip_all, fields(bytes_len = bytes.len()))]
pub async fn salvar_relatorio_status_pdf(bytes: Vec<u8>, empresa_nome: Option<String>) -> Result<String, String> {
    debug!("Salvando relatório de status ({} bytes)", bytes.len());

    let empresa = sanitize_filename_component(empresa_nome.as_deref().unwrap_or("Cliente"));
    let empresa = if empresa.is_empty() {
        "Cliente".to_string()
    } else {
        empresa
    };

    let created_at = Utc::now();
    let file_name = format!(
        "RelatorioStatus_{}_{}.pdf",
        empresa,
        created_at.format("%Y-%m-%d_%H-%M-%S")
    );

    let file_path = default_status_reports_directory()?.join(file_name);
    fs::write(&file_path, &bytes).map_err(|e| {
        error!("Erro ao salvar relatório de status: {}", e);
        format!("Erro ao salvar relatório de status: {}", e)
    })?;

    if let Err(reveal_error) = reveal_file_in_manager(&file_path) {
        error!("{}", reveal_error);
        return Err(reveal_error);
    }

    let path_str = file_path.to_string_lossy().to_string();
    info!("Relatório de status salvo com sucesso em {}", path_str);
    Ok(path_str)
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn obter_status_ferramentas_backup_postgres() -> Result<PostgresBackupToolsStatus, String> {
    require_permission(PERMISSION_MANAGE_PROFILES)?;
    build_backup_tools_status().await
}

async fn build_backup_tools_status() -> Result<PostgresBackupToolsStatus, String> {
    let database_url = current_database_url()?;
    let parsed = parse_database_url(&database_url)?;
    let backup_directory = default_backup_directory()?;

    Ok(PostgresBackupToolsStatus {
        database_name: parsed.database_name,
        host: parsed.host,
        port: parsed.port,
        backup_directory: backup_directory.to_string_lossy().to_string(),
        pg_dump_available: command_available("pg_dump"),
        pg_restore_available: command_available("pg_restore"),
        psql_available: command_available("psql"),
    })
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn gerar_backup_postgres() -> Result<PostgresBackupResult, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    let database_url = current_database_url()?;
    let parsed = parse_database_url(&database_url)?;
    let backup_directory = default_backup_directory()?;

    if !command_available("pg_dump") {
        let details = "pg_dump não encontrado no PATH do sistema";
        record_security_event("BACKUP_GENERATE_FAILED", Some(&actor), details, false).await;
        return Err("O utilitário pg_dump não foi encontrado. Instale o PostgreSQL ou adicione a pasta bin ao PATH desta máquina.".to_string());
    }

    let created_at = Utc::now();
    let file_name = format!(
        "autoos-{}-{}.dump",
        sanitize_backup_component(&parsed.database_name),
        created_at.format("%Y%m%d-%H%M%S")
    );
    let file_path = backup_directory.join(&file_name);

    let output = Command::new("pg_dump")
        .arg("--format=custom")
        .arg("--no-owner")
        .arg("--no-privileges")
        .arg("--file")
        .arg(&file_path)
        .arg("--dbname")
        .arg(&database_url)
        .output()
        .map_err(|e| format!("Falha ao iniciar pg_dump: {}", e))?;

    if !output.status.success() {
        let stderr = summarize_stderr(&output.stderr);
        let details = format!("Falha no backup do banco {}: {}", parsed.database_name, stderr);
        record_security_event("BACKUP_GENERATE_FAILED", Some(&actor), details, false).await;
        return Err(format!("Falha ao gerar backup PostgreSQL: {}", stderr));
    }

    let details = format!("Backup PostgreSQL gerado em {}", file_path.to_string_lossy());
    record_security_event("BACKUP_GENERATED", Some(&actor), details, true).await;

    Ok(PostgresBackupResult {
        file_name,
        file_path: file_path.to_string_lossy().to_string(),
        created_at: created_at.to_rfc3339(),
    })
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn restaurar_backup_postgres(file_path: String) -> Result<PostgresRestoreResult, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    let database_url = current_database_url()?;
    let parsed = parse_database_url(&database_url)?;
    let restore_path = normalize_restore_file_path(&file_path)?;
    ensure_restore_path_in_backup_directory(&restore_path)?;
    let restore_tool = detect_restore_tool(&restore_path)?;

    if !command_available(restore_tool) {
        let details = format!("{} não encontrado no PATH durante restore", restore_tool);
        record_security_event("BACKUP_RESTORE_FAILED", Some(&actor), details, false).await;
        return Err(format!(
            "O utilitário {} não foi encontrado. Instale o PostgreSQL ou ajuste o PATH desta máquina.",
            restore_tool
        ));
    }

    let output = if restore_tool == "pg_restore" {
        Command::new("pg_restore")
            .arg("--clean")
            .arg("--if-exists")
            .arg("--no-owner")
            .arg("--no-privileges")
            .arg("--exit-on-error")
            .arg("--dbname")
            .arg(&database_url)
            .arg(&restore_path)
            .output()
            .map_err(|e| format!("Falha ao iniciar pg_restore: {}", e))?
    } else {
        Command::new("psql")
            .arg("--no-psqlrc")
            .arg("--set")
            .arg("ON_ERROR_STOP=1")
            .arg("--dbname")
            .arg(&database_url)
            .arg("--file")
            .arg(&restore_path)
            .output()
            .map_err(|e| format!("Falha ao iniciar psql: {}", e))?
    };

    if !output.status.success() {
        let stderr = summarize_stderr(&output.stderr);
        let details = format!(
            "Falha no restore do banco {} a partir de {}: {}",
            parsed.database_name,
            restore_path.to_string_lossy(),
            stderr
        );
        record_security_event("BACKUP_RESTORE_FAILED", Some(&actor), details, false).await;
        return Err(format!("Falha ao restaurar backup PostgreSQL: {}", stderr));
    }

    if let Err(error_value) = run_pending_migrations().await {
        let details = format!(
            "Restore concluído, mas falhou ao reaplicar migrações pendentes em {}: {}",
            parsed.database_name,
            error_value
        );
        record_security_event("BACKUP_RESTORE_FAILED", Some(&actor), details, false).await;
        return Err(format!(
            "Restore concluído, mas houve falha ao conferir/aplicar migrações pendentes: {}",
            error_value
        ));
    }

    let restored_at = Utc::now().to_rfc3339();
    let details = format!(
        "Restore PostgreSQL executado via {} a partir de {}",
        restore_tool,
        restore_path.to_string_lossy()
    );
    record_security_event("BACKUP_RESTORED", Some(&actor), details, true).await;

    Ok(PostgresRestoreResult {
        file_path: restore_path.to_string_lossy().to_string(),
        restored_with: restore_tool.to_string(),
        restored_at,
    })
}

/// Retorna o estado atual do schema do banco e das migrações conhecidas pelo app.
#[tauri::command]
#[instrument(skip_all)]
pub async fn obter_status_schema_banco() -> Result<DatabaseSchemaStatus, String> {
    let _actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    let pool = get_pool().await.map_err(|e| {
        error!("Erro ao obter pool para status do schema: {}", e);
        e
    })?;

    let identity = sqlx::query_as::<_, DatabaseIdentityRow>(
        "SELECT current_database() AS database_name, current_schema() AS schema_name"
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao consultar identidade do banco: {}", e);
        e.to_string()
    })?;

    let applied_rows = sqlx::query_as::<_, AppliedMigrationRow>(
        "SELECT version, description, installed_on::TEXT AS installed_on, success
         FROM _sqlx_migrations
         ORDER BY version ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao consultar migrações aplicadas: {}", e);
        e.to_string()
    })?;

    let mut applied_by_version = BTreeMap::new();
    for migration in applied_rows {
        applied_by_version.insert(migration.version, migration);
    }

    let known = known_migrations();
    let mut migrations = Vec::new();
    for migration in &known {
        if let Some(applied) = applied_by_version.remove(&migration.version) {
            migrations.push(DatabaseMigrationStatus {
                version: migration.version,
                description: migration.description.clone(),
                installed_on: applied.installed_on,
                success: applied.success,
                applied: true,
            });
        } else {
            migrations.push(DatabaseMigrationStatus {
                version: migration.version,
                description: migration.description.clone(),
                installed_on: None,
                success: false,
                applied: false,
            });
        }
    }

    for (_, applied) in applied_by_version {
        migrations.push(DatabaseMigrationStatus {
            version: applied.version,
            description: applied.description,
            installed_on: applied.installed_on,
            success: applied.success,
            applied: true,
        });
    }

    migrations.sort_by_key(|migration| migration.version);

    let latest_known_version = known.iter().map(|migration| migration.version).max();
    let latest_applied_version = migrations
        .iter()
        .filter(|migration| migration.applied && migration.success)
        .map(|migration| migration.version)
        .max();
    let applied_count = migrations.iter().filter(|migration| migration.applied && migration.success).count();
    let known_count = known.len();
    let pending_count = migrations.iter().filter(|migration| !migration.applied).count();

    Ok(DatabaseSchemaStatus {
        database_name: identity.database_name,
        schema_name: identity.schema_name,
        latest_known_version,
        latest_applied_version,
        applied_count,
        known_count,
        pending_count,
        migrations,
    })
}

pub(crate) async fn collect_local_support_status() -> Result<LocalSupportStatus, String> {
    let config = load_tauri_config_snapshot()?;
    let housekeeping = run_local_housekeeping()?;
    let log_directory = autoos_logs_dir()?;
    let support_directory = autoos_support_dir()?;
    let temp_directory = autoos_temp_dir()?;
    let backup_directory = default_backup_directory()?;
    let capability_permissions = load_capability_permissions()?;
    let capability_review = if capability_permissions.len() == 1 && capability_permissions[0] == "core:default" {
        "Capability principal reduzida ao baseline `core:default`; nenhuma permissão extra de shell permanece ativa.".to_string()
    } else {
        format!("Capability principal expõe permissões adicionais: {}", capability_permissions.join(", "))
    };

    let schema_snapshot = obter_status_schema_banco().await;
    let schema_error = schema_snapshot.as_ref().err().cloned();
    let schema_status = schema_snapshot.ok();

    let backup_snapshot = build_backup_tools_status().await;
    let backup_tools_error = backup_snapshot.as_ref().err().cloned();
    let backup_tools_status = backup_snapshot.ok();

    Ok(LocalSupportStatus {
        product_name: config.product_name.clone(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        app_identifier: config.identifier.clone(),
        target_os: env::consts::OS.to_string(),
        build_profile: if cfg!(debug_assertions) { "debug" } else { "release" }.to_string(),
        log_directory: log_directory.to_string_lossy().to_string(),
        support_directory: support_directory.to_string_lossy().to_string(),
        temp_directory: temp_directory.to_string_lossy().to_string(),
        backup_directory: backup_directory.to_string_lossy().to_string(),
        capability_permissions,
        capability_review,
        recent_log_files: list_recent_files(&log_directory, 5)?,
        recent_support_files: list_recent_files(&support_directory, 5)?,
        recent_temp_files: list_recent_files(&temp_directory, 5)?,
        schema_status,
        schema_error,
        backup_tools_status,
        backup_tools_error,
        windows_bundle: build_windows_bundle_readiness(&config),
        housekeeping,
    })
}

pub(crate) async fn export_local_support_bundle() -> Result<LocalSupportBundleResult, String> {
    let support_status = collect_local_support_status().await?;
    let support_directory = autoos_support_dir()?;
    let created_at = Utc::now();
    let file_name = format!("autoos-support-{}.json", created_at.format("%Y%m%d-%H%M%S"));
    let file_path = support_directory.join(&file_name);
    let payload = serde_json::to_vec_pretty(&support_status)
        .map_err(|e| format!("Falha ao serializar o pacote de suporte local: {}", e))?;

    fs::write(&file_path, payload).map_err(|e| {
        error!("Erro ao salvar pacote de suporte local: {}", e);
        format!("Erro ao salvar pacote de suporte local: {}", e)
    })?;

    Ok(LocalSupportBundleResult {
        file_name,
        file_path: file_path.to_string_lossy().to_string(),
        created_at: created_at.to_rfc3339(),
    })
}

pub(crate) const DATABASE_CONFIG_FILE: &str = "database-config.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DatabaseConnectionConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
}

impl DatabaseConnectionConfig {
    pub fn to_database_url(&self) -> String {
        format!(
            "postgres://{}:{}@{}:{}/{}",
            self.username, self.password, self.host, self.port, self.database
        )
    }
}

pub(crate) fn database_config_path() -> Result<PathBuf, String> {
    let dir = local_app_data_dir()?;
    Ok(dir.join(DATABASE_CONFIG_FILE))
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn carregar_config_banco() -> Result<Option<DatabaseConnectionConfig>, String> {
    let path = database_config_path()?;
    if !path.is_file() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path).map_err(|e| {
        error!("Erro ao ler configuração de banco: {}", e);
        format!("Erro ao ler configuração de banco: {}", e)
    })?;
    let config: DatabaseConnectionConfig = serde_json::from_str(&contents).map_err(|e| {
        error!("Erro ao parsear configuração de banco: {}", e);
        format!("Erro ao parsear configuração de banco: {}", e)
    })?;
    Ok(Some(config))
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn salvar_config_banco(config: DatabaseConnectionConfig) -> Result<(), String> {
    let path = database_config_path()?;
    let payload = serde_json::to_vec_pretty(&config)
        .map_err(|e| format!("Falha ao serializar configuração de banco: {}", e))?;
    fs::write(&path, payload).map_err(|e| {
        error!("Erro ao salvar configuração de banco: {}", e);
        format!("Erro ao salvar configuração de banco: {}", e)
    })?;
    info!("Configuração de banco salva em: {}", path.display());
    Ok(())
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn verificar_status_banco() -> Result<bool, String> {
    Ok(crate::db::is_database_initialized())
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn reiniciar_banco_com_config(config: DatabaseConnectionConfig) -> Result<bool, String> {
    let database_url = config.to_database_url();
    crate::db::init_database_with_url(&database_url)
        .await
        .map_err(|e| format!("Falha ao conectar com nova configuração: {}", e))?;
    Ok(true)
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn testar_config_banco(config: DatabaseConnectionConfig) -> Result<bool, String> {
    use sqlx::postgres::PgPoolOptions;
    let database_url = config.to_database_url();
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .map_err(|e| format!("Falha ao conectar ao banco: {}", e))?;
    let _ = sqlx::query("SELECT 1").fetch_one(&pool).await.map_err(|e| format!("Falha ao executar query de teste: {}", e))?;
    pool.close().await;
    Ok(true)
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn obter_config_banco_atual() -> Result<DatabaseConnectionConfig, String> {
    let path = database_config_path()?;
    if path.is_file() {
        let contents = fs::read_to_string(&path).map_err(|e| {
            error!("Erro ao ler configuração de banco: {}", e);
            format!("Erro ao ler configuração de banco: {}", e)
        })?;
        let mut config: DatabaseConnectionConfig = serde_json::from_str(&contents).map_err(|e| {
            error!("Erro ao parsear configuração de banco: {}", e);
            format!("Erro ao parsear configuração de banco: {}", e)
        })?;
        config.password = String::new();
        return Ok(config);
    }

    let database_url = env::var("DATABASE_URL").map_err(|_| {
        "Não foi possível determinar a configuração do banco de dados".to_string()
    })?;

    let parsed = Url::parse(&database_url).map_err(|e| {
        format!("DATABASE_URL inválida: {}", e)
    })?;

    let scheme = parsed.scheme();
    if scheme != "postgres" && scheme != "postgresql" {
        return Err("DATABASE_URL deve usar o esquema postgres:// ou postgresql://".to_string());
    }

    let host = parsed.host_str()
        .ok_or_else(|| "DATABASE_URL sem host".to_string())?
        .to_string();

    let port = parsed.port().unwrap_or(5432);

    let database = parsed.path()
        .trim_start_matches('/')
        .to_string();

    if database.is_empty() {
        return Err("DATABASE_URL sem nome do banco de dados".to_string());
    }

    let username = parsed.username()
        .to_string();

    if username.is_empty() {
        return Err("DATABASE_URL sem usuário".to_string());
    }

    Ok(DatabaseConnectionConfig {
        host,
        port,
        database,
        username,
        password: String::new(),
    })
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn obter_diagnostico_suporte_local() -> Result<LocalSupportStatus, String> {
    require_permission(PERMISSION_MANAGE_PROFILES)?;
    collect_local_support_status().await
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn exportar_pacote_suporte_local() -> Result<LocalSupportBundleResult, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    let result = export_local_support_bundle().await?;
    record_security_event(
        "SUPPORT_BUNDLE_EXPORTED",
        Some(&actor),
        format!("arquivo={}", result.file_path),
        true,
    )
    .await;
    Ok(result)
}
