//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/util.rs — Comandos Utilitários                     ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  - greet: Saudação de teste (debug)                          ║
//! ║  - salvar_arquivo_temp: Salva bytes em arquivo temporário    ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::auth::{record_security_event, require_permission, PERMISSION_MANAGE_PROFILES};
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

fn local_app_data_dir() -> Result<PathBuf, String> {
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
    if config.version == "0.0.1" {
        blockers.push("Versionamento de distribuição ainda parece placeholder (0.0.1).".to_string());
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
