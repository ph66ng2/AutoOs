use anyhow::{bail, Context, Result};
use sqlx::{migrate::Migrator, postgres::{PgPool, PgPoolOptions}};
use std::time::Duration;
use url::Url;

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

async fn migration_0027_conflicts(pool: &PgPool) -> Result<Vec<String>> {
    let schema_ready: bool = sqlx::query_scalar(
        "SELECT to_regclass('public.produtos') IS NOT NULL
            AND to_regclass('public.security_profiles') IS NOT NULL",
    )
    .fetch_one(pool)
    .await
    .context("não foi possível verificar as tabelas da migration 0027")?;
    if !schema_ready {
        return Ok(Vec::new());
    }

    let mut conflicts: Vec<String> = sqlx::query_scalar(
        "SELECT format('produtos: código %L, ids=%s, nomes=%s', codigo,
                      array_agg(id ORDER BY id), array_agg(nome ORDER BY id))
         FROM produtos
         WHERE ativo = true AND empresa_id IS NULL AND codigo IS NOT NULL
         GROUP BY codigo
         HAVING count(*) > 1
         ORDER BY codigo",
    )
    .fetch_all(pool)
    .await
    .context("não foi possível listar códigos de produtos duplicados")?;
    let profile_conflicts: Vec<String> = sqlx::query_scalar(
        "SELECT format('perfis: nome normalizado %L, ids=%s, nomes=%s', lower(btrim(nome)),
                      array_agg(id ORDER BY id), array_agg(nome ORDER BY id))
         FROM security_profiles
         GROUP BY lower(btrim(nome))
         HAVING count(*) > 1
         ORDER BY lower(btrim(nome))",
    )
    .fetch_all(pool)
    .await
    .context("não foi possível listar nomes de perfil duplicados")?;
    conflicts.extend(profile_conflicts);
    Ok(conflicts)
}

fn validate_ci_target(database_url: &str, migration_mode: Option<&str>) -> Result<()> {
    if migration_mode != Some("ci") {
        bail!("AUTOOS_MIGRATION_MODE=ci é obrigatório");
    }

    let parsed = Url::parse(database_url).context("DATABASE_URL inválida")?;
    let host = parsed.host_str().context("DATABASE_URL sem host")?;
    if !matches!(host, "localhost" | "127.0.0.1" | "::1") {
        bail!("ci_migrate aceita somente PostgreSQL local descartável");
    }

    if parsed.path().trim_start_matches('/') != "test_autoos" {
        bail!("ci_migrate aceita somente o banco test_autoos");
    }

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL não configurada")?;
    validate_ci_target(
        &database_url,
        std::env::var("AUTOOS_MIGRATION_MODE").ok().as_deref(),
    )?;

    let pool = PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&database_url)
        .await
        .context("falha ao conectar no PostgreSQL descartável da CI")?;

    let conflicts = migration_0027_conflicts(&pool).await?;
    if !conflicts.is_empty() {
        pool.close().await;
        bail!(
            "SQLX_0027_BLOCKED: corrija os conflitos antes de migrar:\n- {}",
            conflicts.join("\n- ")
        );
    }

    let migration_result = tokio::time::timeout(Duration::from_secs(60), MIGRATOR.run(&pool)).await;
    match migration_result {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            pool.close().await;
            if matches!(error, sqlx::migrate::MigrateError::VersionMismatch(_)) {
                bail!("Histórico SQLx incompatível: rode scripts/check-sqlx-database-history.mjs com AUTOOS_MIGRATION_DATABASE_URL. Se a divergência for a 0023 conhecida da master, use scripts/reconcile-sqlx-master-0023.mjs --apply após conferir o schema.");
            }
            return Err(error).context("falha ao aplicar migrations no banco descartável da CI");
        }
        Err(_) => {
            pool.close().await;
            bail!("migrations da CI excederam 60 segundos");
        }
    }

    let applied_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations WHERE success = true")
            .fetch_one(&pool)
            .await
            .context("falha ao validar migrations aplicadas na CI")?;
    let expected_count = MIGRATOR.iter().count() as i64;
    pool.close().await;

    if applied_count != expected_count {
        bail!("histórico incompleto na CI: esperado {expected_count}, encontrado {applied_count}");
    }

    println!("CI_MIGRATIONS_OK migrations={applied_count}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_explicit_local_test_database() {
        assert!(validate_ci_target(
            "postgres://test:test@localhost:5432/test_autoos",
            Some("ci")
        )
        .is_ok());
    }

    #[test]
    fn rejects_production_hosts() {
        assert!(validate_ci_target(
            "postgres://postgres:secret@project.pooler.supabase.com:5432/postgres",
            Some("ci")
        )
        .is_err());
    }

    #[test]
    fn rejects_execution_without_ci_guard() {
        assert!(
            validate_ci_target("postgres://test:test@localhost:5432/test_autoos", None).is_err()
        );
    }
}
