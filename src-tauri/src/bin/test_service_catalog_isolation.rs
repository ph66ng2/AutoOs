//! Integração: catálogo de serviços e vínculos com estoque são isolados por empresa.
#[path = "../commands/mod.rs"]
mod commands;
#[path = "../db.rs"]
mod db;
#[path = "../test_support/memory_keyring.rs"]
mod memory_keyring;

use anyhow::{anyhow, bail, Context, Result};
use commands::types::ServicoCatalogoInput;
use commands::{auth, servicos};
use sqlx::PgPool;
use url::Url;

struct Fixture {
    companies: [i32; 2],
    profiles: [i32; 2],
    product_a: [i32; 2],
    product_b: i32,
    prefix: String,
}

fn validate_test_database_url() -> Result<String> {
    let database_url = std::env::var("DATABASE_URL")
        .map_err(|_| anyhow!("Configure DATABASE_URL para executar o teste de isolamento"))?;
    let parsed = Url::parse(&database_url).map_err(|_| anyhow!("DATABASE_URL inválida"))?;
    let database_name = parsed.path().trim_start_matches('/');
    if database_name != "test_autoos" && !database_name.starts_with("autoos_stock_test") {
        bail!("O teste de isolamento só pode usar test_autoos ou autoos_stock_test*");
    }
    Ok(database_url)
}

async fn create_fixture(pool: &PgPool, prefix: &str) -> Result<Fixture> {
    let mut tx = pool
        .begin()
        .await
        .context("start isolation fixture transaction")?;
    let company_a: i32 = sqlx::query_scalar(
        "INSERT INTO empresas (nome, email, status) VALUES ($1, $2, 'ativo') RETURNING id",
    )
    .bind(format!("{} Empresa A", prefix))
    .bind(format!("{}-a@example.test", prefix))
    .fetch_one(&mut *tx)
    .await
    .context("create company A")?;
    let company_b: i32 = sqlx::query_scalar(
        "INSERT INTO empresas (nome, email, status) VALUES ($1, $2, 'ativo') RETURNING id",
    )
    .bind(format!("{} Empresa B", prefix))
    .bind(format!("{}-b@example.test", prefix))
    .fetch_one(&mut *tx)
    .await
    .context("create company B")?;

    let permissions = serde_json::to_string(&[auth::PERMISSION_STOCK_CONTROL])?;
    let profile_a: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, empresa_id, atualizado_em)
         VALUES ($1, 'ADMIN', $2, true, false, $3, NOW()) RETURNING id",
    )
    .bind(format!("{} Perfil A", prefix))
    .bind(&permissions)
    .bind(company_a)
    .fetch_one(&mut *tx)
    .await
    .context("create company A profile")?;
    let profile_b: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, empresa_id, atualizado_em)
         VALUES ($1, 'ADMIN', $2, true, false, $3, NOW()) RETURNING id",
    )
    .bind(format!("{} Perfil B", prefix))
    .bind(permissions)
    .bind(company_b)
    .fetch_one(&mut *tx)
    .await
    .context("create company B profile")?;

    let mut product_a = [0; 2];
    for (index, slot) in product_a.iter_mut().enumerate() {
        *slot = sqlx::query_scalar(
            "INSERT INTO produtos (empresa_id, codigo, nome, categoria, quantidade_estoque, preco_custo, preco_venda, ativo)
             VALUES ($1, $2, $3, 'PEÇA', 10, 1, 5, true) RETURNING id",
        )
        .bind(company_a)
        .bind(format!("{}-A-{}", prefix, index))
        .bind(format!("{} Peça A{}", prefix, index))
        .fetch_one(&mut *tx)
        .await
        .context("create company A stock item")?;
    }
    let product_b: i32 = sqlx::query_scalar(
        "INSERT INTO produtos (empresa_id, codigo, nome, categoria, quantidade_estoque, preco_custo, preco_venda, ativo)
         VALUES ($1, $2, $3, 'PEÇA', 10, 1, 5, true) RETURNING id",
    )
    .bind(company_b)
    .bind(format!("{}-B-0", prefix))
    .bind(format!("{} Peça B", prefix))
    .fetch_one(&mut *tx)
    .await
    .context("create company B stock item")?;
    tx.commit().await.context("commit isolation fixture")?;

    Ok(Fixture {
        companies: [company_a, company_b],
        profiles: [profile_a, profile_b],
        product_a,
        product_b,
        prefix: prefix.to_string(),
    })
}

async fn activate_profile(profile_id: i32) -> Result<()> {
    auth::set_active_security_profile(profile_id, "1357".to_string(), Some("1357".to_string()))
        .await
        .map_err(|error| anyhow!(error))?;
    Ok(())
}

fn piece(product_id: i32, name: &str) -> serde_json::Value {
    serde_json::json!({
        "produto_id": product_id,
        "nome": name,
        "quantidade": 1,
        "valor_unitario": 5
    })
}

async fn assert_company_isolation(pool: &PgPool, fixture: &Fixture) -> Result<()> {
    activate_profile(fixture.profiles[0]).await?;
    let shared_name = format!("{} Troca da cabeça", fixture.prefix);
    let service_a = servicos::criar_servico(ServicoCatalogoInput {
        nome: shared_name.clone(),
        descricao: Some("Descrição original da empresa A".into()),
        preco_padrao: 100.0,
        pecas_sugeridas: vec![piece(fixture.product_a[0], "Peça A original")],
        ..ServicoCatalogoInput::default()
    })
    .await
    .map_err(|error| anyhow!(error))?;

    activate_profile(fixture.profiles[1]).await?;
    if servicos::buscar_servico(service_a.id).await.is_ok() {
        bail!("empresa B conseguiu ler o serviço da empresa A");
    }
    if servicos::atualizar_servico(
        service_a.id,
        ServicoCatalogoInput {
            nome: format!("{} tentativa indevida", fixture.prefix),
            descricao: Some("Não pode gravar".into()),
            preco_padrao: 999.0,
            atualizado_em: service_a.atualizado_em.clone(),
            pecas_sugeridas: vec![piece(fixture.product_b, "Peça B")],
        },
    )
    .await
    .is_ok()
    {
        bail!("empresa B conseguiu alterar o serviço da empresa A");
    }
    if servicos::criar_servico(ServicoCatalogoInput {
        nome: format!("{} vínculo inválido", fixture.prefix),
        preco_padrao: 20.0,
        pecas_sugeridas: vec![piece(fixture.product_a[0], "Peça A")],
        ..ServicoCatalogoInput::default()
    })
    .await
    .is_ok()
    {
        bail!("empresa B conseguiu vincular uma peça da empresa A");
    }

    // Mesmo nome nas duas empresas deve resultar em dois cadastros independentes.
    let service_b = servicos::criar_servico(ServicoCatalogoInput {
        nome: shared_name,
        descricao: Some("Descrição própria da empresa B".into()),
        preco_padrao: 200.0,
        pecas_sugeridas: vec![piece(fixture.product_b, "Peça B")],
        ..ServicoCatalogoInput::default()
    })
    .await
    .map_err(|error| anyhow!(error))?;

    activate_profile(fixture.profiles[0]).await?;
    servicos::atualizar_servico(
        service_a.id,
        ServicoCatalogoInput {
            nome: format!("{} Serviço A editado", fixture.prefix),
            descricao: Some("Empresa A editou seu próprio serviço".into()),
            preco_padrao: 150.0,
            atualizado_em: service_a.atualizado_em,
            pecas_sugeridas: vec![piece(fixture.product_a[1], "Peça A nova")],
        },
    )
    .await
    .map_err(|error| anyhow!(error))?;

    // Adiciona 61 serviços para confirmar que a sétima página vai além do limite legado de 50.
    sqlx::query(
        "INSERT INTO servicos_catalogo (empresa_id, nome, preco_padrao, pecas_sugeridas, ativo)
         SELECT $1, $2 || serie::TEXT, 0, '[]'::jsonb, true
         FROM generate_series(1, 61) AS serie",
    )
    .bind(fixture.companies[0])
    .bind(format!("{} Paginação ", fixture.prefix))
    .execute(pool)
    .await
    .context("seed service pagination records")?;

    let page_seven = servicos::listar_servicos_paginados(Some(6), None, Some(true))
        .await
        .map_err(|error| anyhow!(error))?;
    if page_seven.total != 62 || page_seven.items.len() != 2 {
        bail!(
            "paginação deveria retornar total 62 e 2 serviços na página 7; recebeu total {} e {} itens",
            page_seven.total,
            page_seven.items.len()
        );
    }

    activate_profile(fixture.profiles[1]).await?;
    let service_b_after_edit = servicos::buscar_servico(service_b.id)
        .await
        .map_err(|error| anyhow!(error))?;
    if service_b_after_edit.nome != format!("{} Troca da cabeça", fixture.prefix)
        || service_b_after_edit.descricao.as_deref() != Some("Descrição própria da empresa B")
        || service_b_after_edit.preco_padrao != Some(200.0)
        || service_b_after_edit.pecas_sugeridas[0]["produto_id"] != fixture.product_b
    {
        bail!("editar serviço ou vínculo da empresa A alterou o cadastro da empresa B");
    }
    Ok(())
}

async fn cleanup(pool: &PgPool, fixture: &Fixture, previous_default: Option<i32>) -> Result<()> {
    let _ = auth::lock_sensitive_access().await;
    let mut tx = pool
        .begin()
        .await
        .context("start isolation cleanup transaction")?;
    sqlx::query("DELETE FROM servicos_catalogo WHERE empresa_id = ANY($1)")
        .bind(&fixture.companies[..])
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM produtos WHERE empresa_id = ANY($1)")
        .bind(&fixture.companies[..])
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM security_audit_log WHERE profile_id = ANY($1)")
        .bind(&fixture.profiles[..])
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM security_profiles WHERE id = ANY($1)")
        .bind(&fixture.profiles[..])
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM empresas WHERE id = ANY($1)")
        .bind(&fixture.companies[..])
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE security_profiles SET is_default = false, atualizado_em = NOW() WHERE ativo = true AND is_default = true")
        .execute(&mut *tx)
        .await?;
    if let Some(profile_id) = previous_default {
        sqlx::query("UPDATE security_profiles SET is_default = true, atualizado_em = NOW() WHERE id = $1 AND ativo = true")
            .bind(profile_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await.context("commit isolation cleanup")?;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    memory_keyring::install();
    let database_url = validate_test_database_url()?;
    std::env::set_var("DATABASE_URL", database_url);
    let pool = db::init_database()
        .await
        .context("initialize test database")?;
    let previous_default: Option<i32> = sqlx::query_scalar(
        "SELECT id FROM security_profiles WHERE ativo = true AND is_default = true ORDER BY id LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .context("read prior active profile")?;
    let prefix = format!("CatalogIsolation-{}", uuid::Uuid::new_v4().simple());
    let fixture = create_fixture(&pool, &prefix).await?;
    let outcome = assert_company_isolation(&pool, &fixture).await;
    let cleanup_outcome = cleanup(&pool, &fixture, previous_default).await;
    cleanup_outcome?;
    outcome?;
    println!("SERVICE_CATALOG_COMPANY_ISOLATION_OK");
    println!("SERVICE_CATALOG_PAGINATION_OVER_50_OK");
    Ok(())
}
