//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/servicos.rs — CRUD de Serviços de Catálogo         ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  - listar_servicos: Lista serviços com busca                  ║
//! ║  - buscar_servico: Busca por ID                               ║
//! ║  - criar_servico: INSERT novo serviço                         ║
//! ║  - atualizar_servico: UPDATE por ID                           ║
//! ║  - deletar_servico: Soft delete (ativo = false)              ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::auth::{
    record_security_event, require_active_session_company_id, require_permission,
    PERMISSION_DELETE_RECORDS, PERMISSION_STOCK_CONTROL,
};
use crate::commands::types::{
    PaginatedResult, ServicoCatalogoInput, ServicoCatalogoRow, SERVICO_CATALOGO_SELECT,
};
use crate::commands::orcamento_estoque::parse_servicos;
use crate::db::get_pool;
use sqlx::{PgPool, Postgres, QueryBuilder};
use std::collections::HashSet;
use tracing::{error, info, instrument};

use super::equipamentos::PAGE_SIZE;

fn required_text(value: &str, field: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{} é obrigatório", field));
    }
    Ok(trimmed.to_string())
}

fn optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
}

fn required_concurrency_token(token: Option<&str>) -> Result<String, String> {
    token
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .ok_or_else(|| "Token de concorrência do serviço é obrigatório para atualizar o cadastro.".to_string())
}

fn duplicate_service_name_message(error: &sqlx::Error) -> Option<String> {
    let lower = error.to_string().to_lowercase();
    if lower.contains("ux_servicos_catalogo_nome_ativo") {
        return Some("Já existe um serviço ativo com esse nome.".to_string());
    }
    None
}

fn validate_preco_padrao(preco: f64) -> Result<(), String> {
    if !preco.is_finite() || preco < 0.0 {
        return Err("Preço padrão não pode ser negativo. Use 0,00 para garantia.".to_string());
    }
    Ok(())
}

fn add_service_filters(
    query: &mut QueryBuilder<Postgres>,
    empresa_id: i32,
    busca: Option<&str>,
    apenas_ativos: bool,
) {
    query.push(" WHERE empresa_id = ").push_bind(empresa_id);
    if apenas_ativos {
        query.push(" AND ativo = true");
    }

    if let Some(busca) = busca.map(str::trim).filter(|value| !value.is_empty()) {
        let pattern = format!("%{}%", busca);
        query
            .push(" AND (nome ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR COALESCE(descricao, '') ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
}

async fn query_service_page(
    pool: &PgPool,
    empresa_id: i32,
    page: Option<i32>,
    busca: Option<&str>,
    apenas_ativos: bool,
    page_size: i32,
) -> Result<PaginatedResult<ServicoCatalogoRow>, String> {
    let mut count_query = QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM servicos_catalogo");
    add_service_filters(&mut count_query, empresa_id, busca, apenas_ativos);
    let total = count_query
        .build_query_scalar::<i64>()
        .fetch_one(pool)
        .await
        .map_err(|error| format!("Erro ao contar serviços: {}", error))?;

    let safe_page = page.unwrap_or(0).max(0) as i64;
    let mut items_query = QueryBuilder::<Postgres>::new(SERVICO_CATALOGO_SELECT);
    add_service_filters(&mut items_query, empresa_id, busca, apenas_ativos);
    items_query
        .push(" ORDER BY nome ASC, id ASC LIMIT ")
        .push_bind(page_size)
        .push(" OFFSET ")
        .push_bind(safe_page * i64::from(page_size));

    let items = items_query
        .build_query_as::<ServicoCatalogoRow>()
        .fetch_all(pool)
        .await
        .map_err(|error| format!("Erro ao listar serviços: {}", error))?;

    Ok(PaginatedResult {
        items,
        total,
        below_minimum: None,
    })
}

async fn validate_suggested_products_belong_to_company(
    pool: &PgPool,
    empresa_id: i32,
    pecas: &[serde_json::Value],
) -> Result<(), String> {
    let mut product_ids = Vec::with_capacity(pecas.len());
    for peca in pecas {
        let id = peca
            .get("produto_id")
            .and_then(serde_json::Value::as_i64)
            .and_then(|value| i32::try_from(value).ok())
            .filter(|value| *value > 0)
            .ok_or_else(|| "Uma peça vinculada não possui um produto válido.".to_string())?;
        product_ids.push(id);
    }

    product_ids.sort_unstable();
    let unique_ids: HashSet<i32> = product_ids.iter().copied().collect();
    if unique_ids.len() != product_ids.len() {
        return Err("Cada produto só pode ser vinculado uma vez ao mesmo serviço.".to_string());
    }
    if product_ids.is_empty() {
        return Ok(());
    }

    let owned_ids = sqlx::query_scalar::<_, i32>(
        "SELECT id FROM produtos
         WHERE empresa_id = $1 AND ativo = true AND id = ANY($2)",
    )
    .bind(empresa_id)
    .bind(&product_ids)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Erro ao validar peças vinculadas: {}", error))?;

    if owned_ids.len() != product_ids.len() {
        return Err("Uma peça vinculada não pertence à empresa ativa ou está inativa.".to_string());
    }
    Ok(())
}

#[tauri::command]
#[instrument(skip_all, fields(page = page))]
pub async fn listar_servicos(
    page: Option<i32>,
    busca: Option<String>,
    apenas_ativos: Option<bool>,
) -> Result<Vec<ServicoCatalogoRow>, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    Ok(query_service_page(
        &pool,
        empresa_id,
        page,
        busca.as_deref(),
        apenas_ativos.unwrap_or(true),
        PAGE_SIZE,
    )
    .await?
    .items)
}

#[tauri::command]
#[instrument(skip_all, fields(page = page))]
pub async fn listar_servicos_paginados(
    page: Option<i32>,
    busca: Option<String>,
    apenas_ativos: Option<bool>,
) -> Result<PaginatedResult<ServicoCatalogoRow>, String> {
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    query_service_page(
        &pool,
        empresa_id,
        page,
        busca.as_deref(),
        apenas_ativos.unwrap_or(true),
        super::equipamentos::UI_PAGE_SIZE,
    )
    .await
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn listar_servicos_catalogo_ativos() -> Result<Vec<ServicoCatalogoRow>, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let query = format!(
        "{} WHERE empresa_id = $1 AND ativo = true ORDER BY nome ASC, id ASC",
        SERVICO_CATALOGO_SELECT
    );
    sqlx::query_as::<_, ServicoCatalogoRow>(sqlx::AssertSqlSafe(&*query))
        .bind(empresa_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao listar serviços ativos do catálogo: {}", e);
            e.to_string()
        })
}

#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn buscar_servico(id: i32) -> Result<ServicoCatalogoRow, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let query = format!("{} WHERE id = $1 AND empresa_id = $2", SERVICO_CATALOGO_SELECT);
    sqlx::query_as::<_, ServicoCatalogoRow>(sqlx::AssertSqlSafe(&*query))
        .bind(id)
        .bind(empresa_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            error!("Serviço {} não encontrado: {}", id, e);
            e.to_string()
        })
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn criar_servico(input: ServicoCatalogoInput) -> Result<ServicoCatalogoRow, String> {
    let actor = require_permission(PERMISSION_STOCK_CONTROL)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let nome = required_text(&input.nome, "Nome do serviço")?;
    let descricao = optional_text(input.descricao.as_deref());

    validate_preco_padrao(input.preco_padrao)?;
    parse_servicos(&serde_json::json!([{"id":"catalogo","pecas":input.pecas_sugeridas}]).to_string())?;
    validate_suggested_products_belong_to_company(&pool, empresa_id, &input.pecas_sugeridas).await?;

    let row = sqlx::query_scalar::<_, i32>(
        r#"
        INSERT INTO servicos_catalogo (empresa_id, nome, descricao, preco_padrao, pecas_sugeridas)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        "#,
    )
    .bind(empresa_id)
    .bind(nome.clone())
    .bind(descricao)
    .bind(input.preco_padrao)
    .bind(serde_json::Value::Array(input.pecas_sugeridas.clone()))
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        if let Some(message) = duplicate_service_name_message(&e) {
            return message;
        }
        error!("Erro ao criar serviço '{}': {}", nome, e);
        e.to_string()
    })?;

    record_security_event(
        "SERVICE_CATALOG_CREATED",
        Some(&actor),
        format!("servico_id={}; nome={}", row, nome),
        true,
    )
    .await;
    info!("Serviço de catálogo criado: id={}", row);
    buscar_servico(row).await
}

#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn atualizar_servico(id: i32, input: ServicoCatalogoInput) -> Result<ServicoCatalogoRow, String> {
    let actor = require_permission(PERMISSION_STOCK_CONTROL)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let nome = required_text(&input.nome, "Nome do serviço")?;
    let descricao = optional_text(input.descricao.as_deref());
    let concurrency_token = required_concurrency_token(input.atualizado_em.as_deref())?;

    validate_preco_padrao(input.preco_padrao)?;
    parse_servicos(&serde_json::json!([{"id":"catalogo","pecas":input.pecas_sugeridas}]).to_string())?;
    validate_suggested_products_belong_to_company(&pool, empresa_id, &input.pecas_sugeridas).await?;

    let updated_rows = sqlx::query(
        r#"
        UPDATE servicos_catalogo SET
            nome = $1,
            descricao = $2,
            preco_padrao = $3,
            pecas_sugeridas = $6,
            atualizado_em = NOW()
        WHERE id = $4 AND atualizado_em = $5::TIMESTAMPTZ AND empresa_id = $7
        "#,
    )
    .bind(nome.clone())
    .bind(descricao)
    .bind(input.preco_padrao)
    .bind(id)
    .bind(concurrency_token)
    .bind(serde_json::Value::Array(input.pecas_sugeridas.clone()))
    .bind(empresa_id)
    .execute(&pool)
    .await
    .map_err(|e| {
        if let Some(message) = duplicate_service_name_message(&e) {
            return message;
        }
        error!("Erro ao atualizar serviço {}: {}", id, e);
        e.to_string()
    })?
    .rows_affected();

    if updated_rows == 0 {
        return Err(
            "Serviço não encontrado na empresa ativa ou foi alterado por outro usuário. Recarregue a tela e tente novamente."
                .to_string(),
        );
    }

    record_security_event(
        "SERVICE_CATALOG_UPDATED",
        Some(&actor),
        format!("servico_id={}; nome={}", id, nome),
        true,
    )
    .await;
    buscar_servico(id).await
}

#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn deletar_servico(id: i32) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_DELETE_RECORDS)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let result = sqlx::query("UPDATE servicos_catalogo SET ativo = false, atualizado_em = NOW() WHERE id = $1 AND empresa_id = $2")
        .bind(id)
        .bind(empresa_id)
        .execute(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao desativar serviço {}: {}", id, e);
            e.to_string()
        })?;

    let deleted = result.rows_affected() > 0;
    record_security_event(
        "SERVICE_CATALOG_DELETED",
        Some(&actor),
        format!("servico_id={}; deleted={}", id, deleted),
        deleted,
    )
    .await;
    Ok(deleted)
}

#[cfg(test)]
mod tests {
    use super::validate_preco_padrao;

    #[test]
    fn aceita_preco_zero_de_garantia() {
        assert!(validate_preco_padrao(0.0).is_ok());
    }

    #[test]
    fn aceita_preco_positivo() {
        assert!(validate_preco_padrao(150.5).is_ok());
    }

    #[test]
    fn rejeita_preco_negativo() {
        let erro = validate_preco_padrao(-0.01).expect_err("preço negativo deve falhar");
        assert!(erro.contains("não pode ser negativo"));
    }
}
