//! ╔══════════════════════════════════════════════════════════════╗
//! ║  db.rs — Inicialização do Banco PostgreSQL e Migrações     ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  Conecta ao PostgreSQL e valida o schema sem alterá-lo.     ║
//! ║  Migrações são responsabilidade exclusiva do pipeline.      ║
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
    migrate::Migrator,
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
const DATABASE_SCHEMA_TIMEOUT: Duration = Duration::from_secs(6);
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
            "O banco de dados informado não existe. No Supabase, use a URL do Session pooler completa e confirme que ela termina em /postgres?sslmode=require.".to_string()
        }
        sqlx::Error::Database(_) => {
            "O servidor PostgreSQL recusou a conexão ou a operação de inicialização.".to_string()
        }
        sqlx::Error::Migrate(_) => {
            "A conexão foi aberta, mas a URL não aponta para o banco de produção compatível com o AutoOS."
                .to_string()
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

pub async fn validate_connected_migration_history() -> Result<(), String> {
    let pool = get_pool().await?;
    tokio::time::timeout(
        DATABASE_SCHEMA_TIMEOUT,
        validate_runtime_schema_on_pool(&pool),
    )
    .await
    .map_err(|_| {
        format!(
            "A validação do schema excedeu {} segundos.",
            DATABASE_SCHEMA_TIMEOUT.as_secs()
        )
    })??;
    Ok(())
}

/// Valida a compatibilidade real do schema sem confiar no histórico de migrations.
/// Versões antigas do AutoOS podiam reconstruir `_sqlx_migrations`, embora as
/// tabelas permanecessem utilizáveis. O release deve verificar capacidades, não
/// checksums administrativos que não alteram o contrato do aplicativo.
pub async fn validate_migration_history(database_url: &str) -> Result<usize, String> {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .min_connections(0)
        .acquire_timeout(DATABASE_ACQUIRE_TIMEOUT)
        .connect(database_url)
        .await
        .map_err(|error| database_error_message(&error))?;

    let result = validate_runtime_schema_on_pool(&pool).await;
    pool.close().await;
    result
}

const REQUIRED_RUNTIME_TABLES: &[&str] = &[
    "clientes",
    "equipamentos",
    "verificacoes",
    "comunicacoes",
    "equipamento_imagens",
    "servicos_catalogo",
    "security_profiles",
    "security_audit_log",
];

const REQUIRED_RUNTIME_COLUMNS: &[(&str, &str)] = &[
    ("clientes", "id"),
    ("equipamentos", "id"),
    ("equipamentos", "serial_number"),
    ("equipamentos", "patrimonio"),
    ("equipamentos", "status"),
    ("equipamentos", "data_entrada"),
    ("equipamentos", "atualizado_em"),
    ("verificacoes", "equipamento_id"),
    ("verificacoes", "adjusted_at"),
    ("equipamento_imagens", "storage_path"),
    ("security_profiles", "permissions"),
];

const REQUIRED_RUNTIME_COLUMN_TYPES: &[(&str, &str, &str)] = &[
    ("equipamentos", "id", "int4"),
    ("security_profiles", "id", "int4"),
    ("security_profiles", "permissions", "text"),
    ("security_audit_log", "profile_id", "int4"),
    ("verificacoes", "adjusted_by_profile_id", "int4"),
];

async fn validate_runtime_schema_on_pool(pool: &PgPool) -> Result<usize, String> {
    let table_names = REQUIRED_RUNTIME_TABLES
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>();
    let missing_tables = sqlx::query_scalar::<_, String>(
        "SELECT required_name
         FROM unnest($1::text[]) AS required(required_name)
         WHERE to_regclass(format('public.%I', required_name)) IS NULL
         ORDER BY required_name",
    )
    .bind(table_names)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Não foi possível verificar as tabelas do AutoOS: {error}"))?;

    let column_tables = REQUIRED_RUNTIME_COLUMNS
        .iter()
        .map(|(table, _)| table.to_string())
        .collect::<Vec<_>>();
    let column_names = REQUIRED_RUNTIME_COLUMNS
        .iter()
        .map(|(_, column)| column.to_string())
        .collect::<Vec<_>>();
    let missing_columns = sqlx::query_scalar::<_, String>(
        "SELECT required_table || '.' || required_column
         FROM unnest($1::text[], $2::text[]) AS required(required_table, required_column)
         WHERE NOT EXISTS (
           SELECT 1 FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = required.required_table
             AND c.column_name = required.required_column
         )
         ORDER BY 1",
    )
    .bind(column_tables)
    .bind(column_names)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Não foi possível verificar as colunas do AutoOS: {error}"))?;

    let typed_tables = REQUIRED_RUNTIME_COLUMN_TYPES
        .iter()
        .map(|(table, _, _)| table.to_string())
        .collect::<Vec<_>>();
    let typed_columns = REQUIRED_RUNTIME_COLUMN_TYPES
        .iter()
        .map(|(_, column, _)| column.to_string())
        .collect::<Vec<_>>();
    let expected_types = REQUIRED_RUNTIME_COLUMN_TYPES
        .iter()
        .map(|(_, _, expected_type)| expected_type.to_string())
        .collect::<Vec<_>>();
    let incompatible_columns = sqlx::query_scalar::<_, String>(
        "SELECT required_table || '.' || required_column || ' esperado=' || expected_type ||
                ' encontrado=' || COALESCE(c.udt_name, 'ausente')
         FROM unnest($1::text[], $2::text[], $3::text[])
              AS required(required_table, required_column, expected_type)
         LEFT JOIN information_schema.columns c
           ON c.table_schema = 'public'
          AND c.table_name = required.required_table
          AND c.column_name = required.required_column
         WHERE c.udt_name IS DISTINCT FROM expected_type
         ORDER BY 1",
    )
    .bind(typed_tables)
    .bind(typed_columns)
    .bind(expected_types)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Não foi possível verificar os tipos do AutoOS: {error}"))?;

    if !missing_tables.is_empty()
        || !missing_columns.is_empty()
        || !incompatible_columns.is_empty()
    {
        let mut missing = missing_tables;
        missing.extend(missing_columns);
        missing.extend(incompatible_columns);
        return Err(format!(
            "Estruturas obrigatórias ausentes: {}.",
            missing.join(", ")
        ));
    }

    Ok(REQUIRED_RUNTIME_TABLES.len()
        + REQUIRED_RUNTIME_COLUMNS.len()
        + REQUIRED_RUNTIME_COLUMN_TYPES.len())
}

async fn validate_migration_history_on_pool(pool: &PgPool) -> Result<usize, String> {
    let applied = sqlx::query_as::<_, (i64, bool, Vec<u8>)>(
        "SELECT version, success, checksum FROM _sqlx_migrations ORDER BY version",
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Não foi possível ler o histórico de migrations: {error}"))?;

    let known = MIGRATOR.iter().collect::<Vec<_>>();
    if applied.len() != known.len() {
        return Err(format!(
            "Histórico incompatível: o build espera {} migrations, mas o banco registra {}.",
            known.len(),
            applied.len()
        ));
    }

    for migration in &known {
        let Some((_, success, checksum)) = applied
            .iter()
            .find(|(version, _, _)| *version == migration.version)
        else {
            return Err(format!("Migration {} ausente no banco.", migration.version));
        };
        if !success {
            return Err(format!(
                "Migration {} está registrada como falha.",
                migration.version
            ));
        }
        if checksum.as_slice() != migration.checksum.as_ref() {
            return Err(format!(
                "Checksum divergente na migration {}.",
                migration.version
            ));
        }
    }

    Ok(known.len())
}

fn schema_validation_error(message: String) -> sqlx::Error {
    sqlx::Error::Migrate(Box::new(sqlx::migrate::MigrateError::Source(Box::new(
        std::io::Error::new(std::io::ErrorKind::InvalidData, message),
    ))))
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

fn select_primary_database_url(
    process_url: Option<String>,
    bundled_url: Option<&str>,
    saved_url: Option<String>,
) -> Option<String> {
    process_url.or_else(|| {
        bundled_url
            .filter(|database_url| !database_url.is_empty())
            .map(str::to_owned)
            .or(saved_url)
    })
}

fn resolve_database_url() -> Result<String, sqlx::Error> {
    // Ordem: variável explícita do processo, endereço embutido no release e, por
    // último, configuração salva pelo fallback.
    if let Some(database_url) = select_primary_database_url(
        env::var("DATABASE_URL").ok(),
        option_env!("COMPILE_TIME_DATABASE_URL"),
        resolve_database_url_from_config_file(),
    ) {
        return Ok(database_url);
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

    // A validação é somente leitura e verifica o contrato real usado pelo app.
    // Ela não consulta `_sqlx_migrations` e não executa migrations, portanto não
    // disputa DDL/locks com outras máquinas e aceita históricos legados válidos.
    let schema_result = tokio::time::timeout(
        DATABASE_SCHEMA_TIMEOUT,
        validate_runtime_schema_on_pool(&pool),
    )
    .await
    .map_err(|_| {
        schema_validation_error(format!(
            "A validação estrutural excedeu {} segundos.",
            DATABASE_SCHEMA_TIMEOUT.as_secs()
        ))
    })?;
    if let Err(message) = schema_result {
        pool.close().await;
        return Err(schema_validation_error(message));
    }

    if let Ok(mut guard) = POOL.lock() {
        *guard = Some(pool.clone());
    }
    if let Ok(mut guard) = INIT_ERROR.lock() {
        *guard = None;
    }
    Ok(pool)
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
    fn reports_schema_validation_without_claiming_to_update_it() {
        let message = database_error_message(&schema_validation_error("incompatível".to_string()));
        assert!(message.contains("não aponta para o banco de produção"));
        assert!(!message.contains("atualização"));
    }

    #[test]
    fn explains_the_supabase_database_name_for_3d000() {
        struct MissingDatabase;
        impl std::fmt::Debug for MissingDatabase {
            fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("MissingDatabase")
            }
        }
        impl std::fmt::Display for MissingDatabase {
            fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("database missing")
            }
        }
        impl std::error::Error for MissingDatabase {}
        impl sqlx::error::DatabaseError for MissingDatabase {
            fn message(&self) -> &str {
                "database missing"
            }
            fn code(&self) -> Option<std::borrow::Cow<'_, str>> {
                Some("3D000".into())
            }
            fn as_error(&self) -> &(dyn std::error::Error + Send + Sync + 'static) {
                self
            }
            fn as_error_mut(&mut self) -> &mut (dyn std::error::Error + Send + Sync + 'static) {
                self
            }
            fn into_error(self: Box<Self>) -> Box<dyn std::error::Error + Send + Sync + 'static> {
                self
            }
            fn kind(&self) -> sqlx::error::ErrorKind {
                sqlx::error::ErrorKind::Other
            }
        }

        let message = database_error_message(&sqlx::Error::Database(Box::new(MissingDatabase)));
        assert!(message.contains("/postgres?sslmode=require"));
    }

    #[test]
    fn retries_only_transient_network_errors() {
        assert!(is_transient_connect_error(&sqlx::Error::PoolTimedOut));
        assert!(is_transient_connect_error(&sqlx::Error::Io(
            io::Error::new(io::ErrorKind::TimedOut, "offline",)
        )));
        assert!(!is_transient_connect_error(&sqlx::Error::InvalidArgument(
            "invalid".to_string(),
        )));
    }

    #[test]
    fn bundled_release_url_wins_over_saved_fallback() {
        let selected = select_primary_database_url(
            None,
            Some("postgresql://release"),
            Some("postgresql://saved".to_string()),
        );

        assert_eq!(selected.as_deref(), Some("postgresql://release"));
    }

    #[test]
    fn saved_url_is_used_when_build_has_no_embedded_database() {
        let selected =
            select_primary_database_url(None, None, Some("postgresql://saved".to_string()));

        assert_eq!(selected.as_deref(), Some("postgresql://saved"));
    }

    #[test]
    fn explicit_process_url_keeps_highest_priority() {
        let selected = select_primary_database_url(
            Some("postgresql://process".to_string()),
            Some("postgresql://release"),
            Some("postgresql://saved".to_string()),
        );

        assert_eq!(selected.as_deref(), Some("postgresql://process"));
    }
}
