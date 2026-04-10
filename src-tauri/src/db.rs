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

/// Inicializa o banco PostgreSQL, aplica migrações versionadas e disponibiliza a pool global.
/// Chamada uma única vez no `main.rs` durante o `setup` do Tauri.
pub async fn init_database() -> Result<PgPool, sqlx::Error> {
    let _ = dotenv::dotenv();

    let database_url = env::var("DATABASE_URL").map_err(|_| {
        sqlx::Error::Configuration(Box::new(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "DATABASE_URL não configurada. Defina a conexão em src-tauri/.env ou nas variáveis de ambiente.",
        )))
    })?;
    
    let pool = PgPool::connect(&database_url).await?;
    MIGRATOR.run(&pool).await?;

    let _ = POOL.set(pool.clone());

    Ok(pool)
}