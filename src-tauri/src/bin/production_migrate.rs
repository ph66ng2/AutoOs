use anyhow::{ensure, Context, Result};
use sqlx::{
    migrate::Migrator,
    postgres::{PgPool, PgPoolOptions},
};
use std::time::Duration;
use url::Url;

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

const REQUIRED_PROMOTION_MIGRATIONS: [i64; 3] = [27, 28, 29];

fn required_env(name: &str) -> Result<String> {
    std::env::var(name)
        .with_context(|| format!("variável obrigatória ausente: {name}"))
        .and_then(|value| {
            ensure!(
                !value.trim().is_empty(),
                "variável obrigatória vazia: {name}"
            );
            Ok(value)
        })
}

fn validate_production_target() -> Result<String> {
    ensure!(
        std::env::var("AUTOOS_MIGRATION_MODE").ok().as_deref() == Some("production"),
        "AUTOOS_MIGRATION_MODE=production é obrigatório"
    );
    ensure!(
        required_env("AUTOOS_PRODUCTION_MIGRATIONS_ENABLED")? == "true",
        "produção bloqueada: habilite AUTOOS_PRODUCTION_MIGRATIONS_ENABLED=true após configurar a proteção do ambiente"
    );
    ensure!(
        required_env("AUTOOS_PRODUCTION_MIGRATION_CONFIRM")? == "APLICAR EM PROD",
        "confirmação da implantação de produção ausente"
    );

    let database_url = required_env("AUTOOS_PRODUCTION_MIGRATION_DATABASE_URL")?;
    let expected_host = required_env("AUTOOS_PRODUCTION_DATABASE_HOST")?;
    let expected_user = required_env("AUTOOS_PRODUCTION_DATABASE_USER")?;
    let confirmed_host = required_env("AUTOOS_PRODUCTION_MIGRATION_CONFIRMED_HOST")?;
    let confirmed_user = required_env("AUTOOS_PRODUCTION_MIGRATION_CONFIRMED_USER")?;
    ensure!(
        confirmed_host == expected_host,
        "host confirmado não corresponde ao destino de produção configurado"
    );
    ensure!(
        confirmed_user == expected_user,
        "usuário confirmado não corresponde ao destino de produção configurado"
    );
    let parsed = Url::parse(&database_url).context("URL de migração de produção inválida")?;

    ensure!(
        matches!(parsed.scheme(), "postgres" | "postgresql"),
        "a conexão de produção precisa usar PostgreSQL"
    );
    ensure!(
        parsed.fragment().is_none(),
        "a URL de produção não pode conter fragmento"
    );
    let host = parsed.host_str().context("URL de produção sem host")?;
    ensure!(
        !host.contains('%') && !expected_host.contains('%'),
        "host de produção inválido"
    );
    ensure!(
        host.ends_with(".pooler.supabase.com") && host.eq_ignore_ascii_case(&expected_host),
        "host da URL não corresponde ao host Supavisor de produção configurado"
    );
    ensure!(
        parsed.port() == Some(5432),
        "a conexão de produção precisa usar Supavisor Session na porta 5432"
    );
    ensure!(
        parsed.path() == "/postgres" && !parsed.path().contains('%'),
        "a conexão de produção precisa apontar para o banco /postgres"
    );
    ensure!(
        !parsed.username().is_empty()
            && !parsed.username().contains('%')
            && !expected_user.contains('%')
            && parsed.username() == expected_user,
        "usuário da URL não corresponde ao usuário de produção configurado"
    );
    ensure!(
        parsed
            .password()
            .is_some_and(|password| !password.is_empty()),
        "a URL de produção precisa conter a credencial PostgreSQL"
    );
    let query_pairs = parsed.query_pairs().collect::<Vec<_>>();
    ensure!(
        query_pairs.len() == 1 && query_pairs[0].0 == "sslmode" && query_pairs[0].1 == "require",
        "a URL de produção aceita somente o parâmetro sslmode=require"
    );

    Ok(database_url)
}

fn validate_migration_set() -> Result<()> {
    let mut versions = MIGRATOR
        .iter()
        .map(|migration| migration.version)
        .collect::<Vec<_>>();
    versions.sort_unstable();

    for pair in versions.windows(2) {
        ensure!(
            pair[0] != pair[1],
            "versão SQLx {:04} duplicada no build; confira colisões de migrations entre branches",
            pair[0]
        );
    }

    ensure!(
        versions.len() == 29,
        "conjunto SQLx incompleto ou inesperado: esperadas 29 migrations (0001–0029), encontradas {}",
        versions.len()
    );
    for (index, version) in versions.iter().enumerate() {
        let expected = index as i64 + 1;
        ensure!(
            *version == expected,
            "sequência SQLx inválida: esperada migration {expected:04}, encontrada {version:04}"
        );
    }
    Ok(())
}

fn require_expected_migrations() -> Result<()> {
    for version in REQUIRED_PROMOTION_MIGRATIONS {
        ensure!(
            MIGRATOR
                .iter()
                .any(|migration| migration.version == version),
            "migration SQLx {version:04} não está presente neste build"
        );
    }
    Ok(())
}

async fn require_established_history(pool: &PgPool) -> Result<()> {
    let history_exists: bool =
        sqlx::query_scalar("SELECT to_regclass('public._sqlx_migrations') IS NOT NULL")
            .fetch_one(pool)
            .await
            .context("não foi possível verificar o histórico SQLx de produção")?;
    ensure!(
        history_exists,
        "banco de produção sem histórico SQLx; a implantação foi interrompida"
    );

    let expected_versions_applied: bool = sqlx::query_scalar(
        "SELECT NOT EXISTS (
             SELECT expected.version
               FROM generate_series(1, 28) AS expected(version)
               LEFT JOIN public._sqlx_migrations AS applied
                 ON applied.version = expected.version AND applied.success = true
              WHERE applied.version IS NULL
         )",
    )
    .fetch_one(pool)
    .await
    .context("não foi possível validar as migrations SQLx 0001–0028")?;
    ensure!(
        expected_versions_applied,
        "produção não tem todas as migrations SQLx 0001–0028 aplicadas com sucesso"
    );

    let failed_migrations: i64 =
        sqlx::query_scalar("SELECT count(*) FROM public._sqlx_migrations WHERE success = false")
            .fetch_one(pool)
            .await
            .context("não foi possível validar migrations SQLx com falha")?;
    ensure!(
        failed_migrations == 0,
        "histórico SQLx de produção contém migrations com falha"
    );
    Ok(())
}

async fn preflight_migration_0027(pool: &PgPool) -> Result<()> {
    let already_applied: bool = sqlx::query_scalar(
        "SELECT EXISTS (
             SELECT 1 FROM public._sqlx_migrations
              WHERE version = 27 AND success = true
         )",
    )
    .fetch_one(pool)
    .await
    .context("não foi possível consultar o status da migration SQLx 0027")?;
    if already_applied {
        return Ok(());
    }

    let schema_ready: bool = sqlx::query_scalar(
        "SELECT to_regclass('public.produtos') IS NOT NULL
             AND to_regclass('public.security_profiles') IS NOT NULL",
    )
    .fetch_one(pool)
    .await
    .context("não foi possível verificar as tabelas exigidas pela migration 0027")?;
    ensure!(
        schema_ready,
        "tabelas necessárias à migration SQLx 0027 não existem em produção"
    );

    let duplicate_products = sqlx::query_as::<_, (String, i64)>(
        "SELECT codigo, count(*)::bigint
           FROM public.produtos
          WHERE ativo = true AND empresa_id IS NULL AND codigo IS NOT NULL
          GROUP BY codigo
         HAVING count(*) > 1
          ORDER BY codigo",
    )
    .fetch_all(pool)
    .await
    .context("não foi possível conferir códigos de produtos sem empresa duplicados")?;
    let duplicate_profiles = sqlx::query_as::<_, (String, i64)>(
        "SELECT lower(btrim(nome)) AS nome_normalizado, count(*)::bigint
           FROM public.security_profiles
          GROUP BY lower(btrim(nome))
         HAVING count(*) > 1
          ORDER BY nome_normalizado",
    )
    .fetch_all(pool)
    .await
    .context("não foi possível conferir nomes de perfil duplicados")?;

    if !duplicate_products.is_empty() || !duplicate_profiles.is_empty() {
        for (code, rows) in &duplicate_products {
            eprintln!("SQLX_0027_CONFLICT product_code={code:?} active_rows={rows}");
        }
        for (name, rows) in &duplicate_profiles {
            eprintln!("SQLX_0027_CONFLICT normalized_profile_name={name:?} rows={rows}");
        }
        anyhow::bail!(
            "SQLX_0027_BLOCKED: encontrados {} grupos de produtos ativos sem empresa com código repetido e {} grupos de perfis com nomes repetidos após trim/caixa (inclui perfis inativos). Nenhuma migration foi aplicada. Corrija os grupos listados e tente novamente.",
            duplicate_products.len(),
            duplicate_profiles.len()
        );
    }

    println!("SQLX_0027_PREFLIGHT_OK: sem conflitos de produto ou perfil.");
    Ok(())
}

async fn verify_promoted_schema(pool: &PgPool) -> Result<()> {
    for version in REQUIRED_PROMOTION_MIGRATIONS {
        let applied: bool = sqlx::query_scalar(
            "SELECT EXISTS (
                 SELECT 1 FROM public._sqlx_migrations
                  WHERE version = $1 AND success = true
             )",
        )
        .bind(version)
        .fetch_one(pool)
        .await
        .with_context(|| format!("não foi possível confirmar a migration {version:04}"))?;
        ensure!(
            applied,
            "migration SQLx {version:04} não consta como aplicada"
        );
    }

    let indexes_exist: bool = sqlx::query_scalar(
        "SELECT to_regclass('public.ux_security_profiles_nome_normalizado') IS NOT NULL
             AND to_regclass('public.ux_produtos_codigo_ativo_sem_empresa') IS NOT NULL",
    )
    .fetch_one(pool)
    .await
    .context("não foi possível confirmar os índices criados pela migration 0027")?;
    ensure!(
        indexes_exist,
        "índices da migration SQLx 0027 não foram encontrados"
    );

    let equipment_token_is_required: bool = sqlx::query_scalar(
        "SELECT attnotnull
           FROM pg_attribute
          WHERE attrelid = 'public.equipamentos'::regclass
            AND attname = 'atualizado_em'
            AND NOT attisdropped",
    )
    .fetch_optional(pool)
    .await
    .context("não foi possível confirmar equipamentos.atualizado_em")?
    .unwrap_or(false);
    ensure!(
        equipment_token_is_required,
        "equipamentos.atualizado_em continua aceitando NULL após a migration 0028"
    );

    let portal_schema_exists: bool = sqlx::query_scalar(
        "SELECT to_regclass('public.links_status_publico') IS NOT NULL
             AND to_regclass('public.status_portal_config') IS NOT NULL
             AND to_regclass('public.status_portal_rate_limits') IS NOT NULL
             AND EXISTS (
                 SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'equipamentos'
                    AND column_name = 'status_alterado_em'
             )",
    )
    .fetch_one(pool)
    .await
    .context("não foi possível confirmar as estruturas do portal público")?;
    ensure!(
        portal_schema_exists,
        "estruturas da migration SQLx 0029 não foram encontradas"
    );

    let applied_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM public._sqlx_migrations WHERE success = true")
            .fetch_one(pool)
            .await
            .context("não foi possível conferir o histórico final SQLx")?;
    ensure!(
        applied_count == MIGRATOR.iter().count() as i64,
        "histórico SQLx final incompleto: esperado {}, encontrado {applied_count}",
        MIGRATOR.iter().count()
    );
    Ok(())
}

async fn required_promotion_migrations_already_applied(pool: &PgPool) -> Result<bool> {
    let applied_count: i64 = sqlx::query_scalar(
        "SELECT count(*)
           FROM public._sqlx_migrations
          WHERE version = ANY($1) AND success = true",
    )
    .bind(REQUIRED_PROMOTION_MIGRATIONS.as_slice())
    .fetch_one(pool)
    .await
    .context("não foi possível consultar o status inicial das migrations 0027–0029")?;
    Ok(applied_count == REQUIRED_PROMOTION_MIGRATIONS.len() as i64)
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let preflight_only = args.first().map(String::as_str) == Some("--preflight-only");
    ensure!(
        args.is_empty() || (args.len() == 1 && preflight_only),
        "uso: production_migrate [--preflight-only]"
    );

    validate_migration_set()?;
    require_expected_migrations()?;
    let database_url = validate_production_target()?;
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(15))
        .connect(&database_url)
        .await
        .context("falha ao conectar ao banco configurado para migrações de produção")?;

    let result = async {
        require_established_history(&pool).await?;
        preflight_migration_0027(&pool).await?;
        if preflight_only {
            return Ok::<(), anyhow::Error>(());
        }
        let required_were_already_applied =
            required_promotion_migrations_already_applied(&pool).await?;
        tokio::time::timeout(Duration::from_secs(600), MIGRATOR.run(&pool))
            .await
            .context("aplicação de migrations excedeu 10 minutos")?
            .context("SQLx não conseguiu aplicar as migrations pendentes")?;
        verify_promoted_schema(&pool).await?;
        println!(
            "PRODUCTION_MIGRATIONS_OK status={}",
            if required_were_already_applied {
                "already_applied"
            } else {
                "applied_and_verified"
            }
        );
        Ok::<(), anyhow::Error>(())
    }
    .await;

    pool.close().await;
    result?;
    if preflight_only {
        println!("PRODUCTION_MIGRATIONS_PREFLIGHT_OK: nenhuma migration foi aplicada.");
    }
    Ok(())
}
