#![allow(dead_code)]

#[path = "../db.rs"]
mod db;
#[path = "../commands/mod.rs"]
mod commands;

use anyhow::{Context, Result};

#[tokio::main]
async fn main() -> Result<()> {
    db::init_database()
        .await
        .context("failed to init database for support readiness check")?;

    let support = commands::util::collect_local_support_status()
        .await
        .map_err(anyhow::Error::msg)
        .context("failed to collect local support status")?;
    let bundle = commands::util::export_local_support_bundle()
        .await
        .map_err(anyhow::Error::msg)
        .context("failed to export local support bundle")?;

    println!("P1_SUPPORT_LOG_DIR_OK={}", support.log_directory);
    println!("P1_SUPPORT_CAPABILITY_OK={}", support.capability_permissions.join(","));
    println!("P1_SUPPORT_BUILD_BLOCKERS_OK={}", support.windows_bundle.blockers.join(" | "));
    println!("P1_SUPPORT_BUNDLE_OK={}", bundle.file_path);
    println!("P1_SUPPORT_OK");

    Ok(())
}