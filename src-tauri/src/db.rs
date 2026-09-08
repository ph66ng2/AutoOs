//! ╔══════════════════════════════════════════════════════════════╗
//! ║  db.rs — Inicialização do Banco PostgreSQL e Migrações     ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  Cria as 6 tabelas do sistema e executa migrações seguras   ║
//! ║  com PostgreSQL e sqlx.                                      ║
//! ║                                                              ║
//! ║  TABELAS:                                                    ║
//! ║  1. clientes — PF/PJ com endereço completo                  ║
//! ║  2. equipamentos — impressoras em manutenção (FK → clientes)║
//! ║  3. produtos — estoque de insumos (toners, peças)           ║
//! ║  4. movimentacoes_estoque — log de entrada/saída (FK → prod)║
//! ║  5. verificacoes — diagnóstico técnico (FK → equipamentos)  ║
//! ║  6. comunicacoes — log de WhatsApp/Email (FK → equipamentos)║
//! ║                                                              ║
//! ║  DEPENDE DE: sqlx com PostgreSQL                             ║
//! ║  USADO POR: main.rs (init_database no setup)                ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::util::{local_app_data_dir, DatabaseConnectionConfig, DATABASE_CONFIG_FILE};
use sqlx::{
    migrate::{MigrateError, Migrator},
    postgres::{PgPool, PgPoolOptions},
};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tracing::warn;

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

#[derive(Debug, Clone)]
pub struct KnownMigration {
    pub version: i64,
    pub description: String,
}

static POOL: Mutex<Option<PgPool>> = Mutex::new(None);
static INIT_ERROR: Mutex<Option<String>> = Mutex::new(None);

const DATABASE_ACQUIRE_TIMEOUT: Duration = Duration::from_secs(6);
const DATABASE_MAX_CONNECTIONS: u32 = 5;
const STARTUP_CONNECT_ATTEMPTS: usize = 2;
const STARTUP_RETRY_DELAY: Duration = Duration::from_millis(750);

pub async fn get_pool() -> Result<PgPool, String> {
    let guard = POOL
        .lock()
        .map_err(|e| format!("Lock do pool corrompido: {}", e))?;
    guard.clone().ok_or_else(|| {
        let err_guard = INIT_ERROR
            .lock()
            .unwrap_or_else(|e| panic!("Lock de erro corrompido: {}", e));
        err_guard
            .clone()
            .unwrap_or_else(|| "Pool de conexões não inicializado".to_string())
    })
}

pub fn is_database_initialized() -> bool {
    POOL.lock().map(|g| g.is_some()).unwrap_or(false)
}

pub fn database_init_error() -> Option<String> {
    INIT_ERROR.lock().ok().and_then(|g| g.clone())
}

pub fn clear_database_init_error() {
    if let Ok(mut guard) = INIT_ERROR.lock() {
        *guard = None;
    }
}

fn set_database_init_error(message: impl Into<String>) {
    if let Ok(mut guard) = INIT_ERROR.lock() {
        *guard = Some(message.into());
    }
}

pub fn database_error_message(error: &sqlx::Error) -> String {
    match error {
        sqlx::Error::PoolTimedOut => {
            "A conexão com o banco excedeu 6 segundos. Verifique a internet e tente novamente."
                .to_string()
        }
        sqlx::Error::Io(_) => {
            "Não foi possível alcançar o banco. Verifique a internet, DNS ou compatibilidade IPv4/IPv6."
                .to_string()
        }
        sqlx::Error::Tls(_) => {
            "Falha ao estabelecer a conexão segura TLS com o banco.".to_string()
        }
        sqlx::Error::Configuration(_) | sqlx::Error::ConfigFile(_) => {
            "A URL de conexão PostgreSQL está ausente ou possui formato inválido.".to_string()
        }
        sqlx::Error::Database(database_error) if database_error.code().as_deref() == Some("28P01") => {
            "Usuário ou senha do banco inválidos.".to_string()
        }
        sqlx::Error::Database(database_error) if database_error.code().as_deref() == Some("3D000") => {
            "O banco de dados informado não existe.".to_string()
        }
        sqlx::Error::Database(_) => {
            "O servidor PostgreSQL recusou a conexão ou a operação de inicialização.".to_string()
        }
        sqlx::Error::Migrate(_) => {
            "A conexão foi aberta, mas a atualização do schema falhou.".to_string()
        }
        _ => "Não foi possível inicializar o banco de dados.".to_string(),
    }
}

fn is_transient_connect_error(error: &sqlx::Error) -> bool {
    matches!(error, sqlx::Error::PoolTimedOut | sqlx::Error::Io(_))
}

pub fn known_migrations() -> Vec<KnownMigration> {
    MIGRATOR
        .iter()
        .map(|migration| KnownMigration {
            version: migration.version,
            description: migration.description.to_string(),
        })
        .collect()
}

pub async fn run_pending_migrations() -> Result<(), String> {
    let pool = get_pool().await?;
    MIGRATOR.run(&pool).await.map_err(|e| e.to_string())
}

fn database_url_missing_error() -> sqlx::Error {
    sqlx::Error::Configuration(Box::new(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "DATABASE_URL não configurada. Defina a conexão em src-tauri/.env ou nas variáveis de ambiente.",
    )))
}

fn push_env_candidate(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    if !candidates.contains(&path) {
        candidates.push(path);
    }
}

fn collect_env_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    push_env_candidate(
        &mut candidates,
        Path::new(env!("CARGO_MANIFEST_DIR")).join(".env"),
    );

    if let Ok(executable_path) = env::current_exe() {
        let mut current_dir = executable_path.parent();
        for _ in 0..4 {
            if let Some(dir) = current_dir {
                push_env_candidate(&mut candidates, dir.join(".env"));
                current_dir = dir.parent();
            } else {
                break;
            }
        }
    }

    candidates
}

fn resolve_database_url_from_config_file() -> Option<String> {
    let config_path = local_app_data_dir().ok()?.join(DATABASE_CONFIG_FILE);
    if !config_path.is_file() {
        return None;
    }
    let contents = fs::read_to_string(&config_path).ok()?;
    let config: DatabaseConnectionConfig = serde_json::from_str(&contents).ok()?;
    config.to_database_url().ok()
}

fn should_replace_legacy_direct_config(config_url: &str, release_url: &str) -> bool {
    let Ok(config) = url::Url::parse(config_url) else {
        return false;
    };
    let Ok(release) = url::Url::parse(release_url) else {
        return false;
    };
    let Some(config_host) = config.host_str() else {
        return false;
    };
    let Some(project_ref) = config_host
        .strip_prefix("db.")
        .and_then(|host| host.strip_suffix(".supabase.co"))
    else {
        return false;
    };

    release
        .host_str()
        .is_some_and(|host| host.ends_with(".pooler.supabase.com"))
        && release.username().strip_prefix("postgres.") == Some(project_ref)
}

fn resolve_database_url() -> Result<String, sqlx::Error> {
    // Uma variável definida explicitamente pelo processo continua sendo a maior prioridade.
    if let Ok(database_url) = env::var("DATABASE_URL") {
        return Ok(database_url);
    }

    // A escolha feita no fallback deve sobreviver aos próximos boots e substituir
    // o endereço padrão compilado no release.
    if let Some(database_url) = resolve_database_url_from_config_file() {
        if let Some(release_url) = option_env!("COMPILE_TIME_DATABASE_URL") {
            if should_replace_legacy_direct_config(&database_url, release_url) {
                warn!("Configuração direta Supabase antiga substituída pelo Session pooler do release");
                return Ok(release_url.to_string());
            }
        }
        return Ok(database_url);
    }

    // No executável distribuído, o endereço validado no pipeline deve prevalecer
    // inclusive sobre um recurso .env deixado por uma instalação antiga.
    if let Some(database_url) = option_env!("COMPILE_TIME_DATABASE_URL") {
        if !database_url.is_empty() {
            return Ok(database_url.to_string());
        }
    }

    for env_path in collect_env_candidates() {
        if !env_path.is_file() {
            continue;
        }

        if dotenv::from_path(&env_path).is_ok() {
            if let Ok(database_url) = env::var("DATABASE_URL") {
                return Ok(database_url);
            }
        }
    }

    Err(database_url_missing_error())
}

pub async fn init_database() -> Result<PgPool, sqlx::Error> {
    clear_database_init_error();
    let result = async {
        let database_url = resolve_database_url()?;
        connect_and_setup_pool_with_retry(&database_url).await
    }
    .await;

    if let Err(error) = &result {
        set_database_init_error(database_error_message(error));
    }
    result
}

pub async fn init_database_with_url(database_url: &str) -> Result<PgPool, sqlx::Error> {
    clear_database_init_error();
    let result = connect_and_setup_pool(database_url).await;
    if let Err(error) = &result {
        set_database_init_error(database_error_message(error));
    }
    result
}

async fn connect_and_setup_pool_with_retry(database_url: &str) -> Result<PgPool, sqlx::Error> {
    for attempt in 1..=STARTUP_CONNECT_ATTEMPTS {
        match connect_and_setup_pool(database_url).await {
            Ok(pool) => return Ok(pool),
            Err(error)
                if attempt < STARTUP_CONNECT_ATTEMPTS && is_transient_connect_error(&error) =>
            {
                warn!(
                    "Tentativa transitória de conexão {}/{} falhou; nova tentativa em {} ms",
                    attempt,
                    STARTUP_CONNECT_ATTEMPTS,
                    STARTUP_RETRY_DELAY.as_millis()
                );
                tokio::time::sleep(STARTUP_RETRY_DELAY).await;
            }
            Err(error) => return Err(error),
        }
    }

    unreachable!("o loop de conexão sempre retorna sucesso ou erro")
}

async fn connect_and_setup_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(DATABASE_MAX_CONNECTIONS)
        .min_connections(0)
        .acquire_timeout(DATABASE_ACQUIRE_TIMEOUT)
        .idle_timeout(Duration::from_secs(5 * 60))
        .max_lifetime(Duration::from_secs(30 * 60))
        .connect(database_url)
        .await?;

    // O banco de produção possui um checksum legado na migração inicial. Ele só
    // pode ser tolerado quando todas as versões conhecidas já estão aplicadas;
    // migração pendente ou qualquer outro erro continua sendo fatal. Nunca
    // altere ou trunque o histórico para mascarar incompatibilidade.
    if let Err(error) = MIGRATOR.run(&pool).await {
        let can_use_legacy_schema = matches!(&error, MigrateError::VersionMismatch(_))
            && all_known_migrations_are_applied(&pool).await?;
        if can_use_legacy_schema {
            warn!("Checksum legado detectado com todas as migrações aplicadas; mantendo histórico intacto");
        } else {
            return Err(sqlx::Error::Migrate(Box::new(error)));
        }
    }

    if let Ok(mut guard) = POOL.lock() {
        *guard = Some(pool.clone());
    }
    if let Ok(mut guard) = INIT_ERROR.lock() {
        *guard = None;
    }
    Ok(pool)
}

async fn all_known_migrations_are_applied(pool: &PgPool) -> Result<bool, sqlx::Error> {
    let applied = sqlx::query_as::<_, (i64, bool)>(
        "SELECT version, success FROM _sqlx_migrations ORDER BY version",
    )
    .fetch_all(pool)
    .await?;

    Ok(MIGRATOR.iter().all(|known| {
        applied
            .iter()
            .any(|(version, success)| *version == known.version && *success)
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    #[test]
    fn classifies_timeout_without_exposing_connection_details() {
        let message = database_error_message(&sqlx::Error::PoolTimedOut);
        assert!(message.contains("6 segundos"));
        assert!(!message.contains("postgres"));
    }

    #[test]
    fn retries_only_transient_network_errors() {
        assert!(is_transient_connect_error(&sqlx::Error::PoolTimedOut));
        assert!(is_transient_connect_error(&sqlx::Error::Io(io::Error::new(
            io::ErrorKind::TimedOut,
            "offline",
        ))));
        assert!(!is_transient_connect_error(&sqlx::Error::InvalidArgument(
            "invalid".to_string(),
        )));
    }

    #[test]
    fn replaces_legacy_direct_supabase_url_for_the_same_project() {
        let direct = "postgresql://postgres:secret@db.projectref.supabase.co:5432/postgres";
        let pooler = "postgresql://postgres.projectref:secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require";

        assert!(should_replace_legacy_direct_config(direct, pooler));
        assert!(!should_replace_legacy_direct_config(
            direct,
            "postgresql://postgres.other:secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres",
        ));
    }
}
