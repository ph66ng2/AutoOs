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

use crate::commands::util::{local_app_data_dir, DATABASE_CONFIG_FILE};
use sqlx::{migrate::Migrator, postgres::PgPool};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tracing::{warn, info};

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

#[derive(Debug, Clone)]
pub struct KnownMigration {
    pub version: i64,
    pub description: String,
}

static POOL: Mutex<Option<PgPool>> = Mutex::new(None);
static INIT_ERROR: Mutex<Option<String>> = Mutex::new(None);

pub async fn get_pool() -> Result<PgPool, String> {
    let guard = POOL.lock().map_err(|e| format!("Lock do pool corrompido: {}", e))?;
    guard.clone().ok_or_else(|| {
        let err_guard = INIT_ERROR.lock().unwrap_or_else(|e| panic!("Lock de erro corrompido: {}", e));
        err_guard.clone().unwrap_or_else(|| "Pool de conexões não inicializado".to_string())
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
    let config_path = local_app_data_dir()
        .ok()?
        .join(DATABASE_CONFIG_FILE);
    if !config_path.is_file() {
        return None;
    }
    let contents = fs::read_to_string(&config_path).ok()?;
    let config: serde_json::Value = serde_json::from_str(&contents).ok()?;
    let host = config.get("host")?.as_str()?;
    let port = config.get("port")?.as_u64()? as u16;
    let database = config.get("database")?.as_str()?;
    let username = config.get("username")?.as_str()?;
    let password = config.get("password")?.as_str()?;
    Some(format!(
        "postgres://{}:{}@{}:{}/{}",
        username, password, host, port, database
    ))
}

fn resolve_database_url() -> Result<String, sqlx::Error> {
    let _ = dotenv::dotenv();

    if let Ok(database_url) = env::var("DATABASE_URL") {
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

    if let Some(database_url) = resolve_database_url_from_config_file() {
        return Ok(database_url);
    }

    Err(database_url_missing_error())
}

pub async fn init_database() -> Result<PgPool, sqlx::Error> {
    let database_url = resolve_database_url()?;
    connect_and_setup_pool(&database_url).await
}

pub async fn init_database_with_url(database_url: &str) -> Result<PgPool, sqlx::Error> {
    connect_and_setup_pool(database_url).await
}

async fn connect_and_setup_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let pool = PgPool::connect(database_url).await?;

    // Tenta rodar migrações; se falhar, trunca _sqlx_migrations e tenta novamente
    if let Err(e) = MIGRATOR.run(&pool).await {
        warn!("Migração falhou na primeira tentativa: {}. Truncando _sqlx_migrations e tentando novamente...", e);

        let _ = sqlx::query("TRUNCATE TABLE _sqlx_migrations")
            .execute(&pool)
            .await;

        if let Err(e2) = MIGRATOR.run(&pool).await {
            warn!("Migração falhou mesmo após truncar _sqlx_migrations: {}. Continuando com o banco existente.", e2);
        } else {
            info!("Migrações reaplicadas com sucesso após truncar _sqlx_migrations.");
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