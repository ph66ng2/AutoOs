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

use sqlx::{migrate::Migrator, postgres::PgPool};
use std::env;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

#[derive(Debug, Clone)]
pub struct KnownMigration {
    pub version: i64,
    pub description: String,
}

/// Pool global para acesso pelos comandos sem precisar de State.
static POOL: OnceLock<PgPool> = OnceLock::new();

/// Obtém referência ao pool global de conexões PostgreSQL.
/// Retorna erro se o pool não foi inicializado.
pub async fn get_pool() -> Result<PgPool, String> {
    POOL.get()
        .cloned()
        .ok_or_else(|| "Pool de conexões não inicializado".to_string())
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

    Err(database_url_missing_error())
}

/// Inicializa o banco PostgreSQL, aplica migrações versionadas e disponibiliza a pool global.
/// Chamada uma única vez no `main.rs` durante o `setup` do Tauri.
pub async fn init_database() -> Result<PgPool, sqlx::Error> {
    let database_url = resolve_database_url()?;
    
    let pool = PgPool::connect(&database_url).await?;
    MIGRATOR.run(&pool).await?;

    let _ = POOL.set(pool.clone());

    Ok(pool)
}