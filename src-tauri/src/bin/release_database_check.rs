#![allow(dead_code, unused_imports)]

#[path = "../commands/mod.rs"]
mod commands;
#[path = "../db.rs"]
mod db;

use anyhow::{Context, Result};

#[tokio::main]
async fn main() -> Result<()> {
    let database_url = std::env::var("AUTOOS_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .context("AUTOOS_DATABASE_URL não configurada para o preflight")?;

    let schema_object_count = db::validate_migration_history(&database_url)
        .await
        .map_err(anyhow::Error::msg)
        .context("preflight do banco de release recusado")?;

    println!("RELEASE_DATABASE_CHECK_OK schema_objects={schema_object_count}");
    Ok(())
}
