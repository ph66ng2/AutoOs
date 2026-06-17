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
    record_security_event, require_permission, PERMISSION_DELETE_RECORDS, PERMISSION_STOCK_CONTROL,
};
use crate::commands::types::{ServicoCatalogoInput, ServicoCatalogoRow, SERVICO_CATALOGO_SELECT};
use crate::db::get_pool;
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

#[tauri::command]
#[instrument(skip_all, fields(page = page))]
pub async fn listar_servicos(
    page: Option<i32>,
    busca: Option<String>,
    apenas_ativos: Option<bool>,
) -> Result<Vec<ServicoCatalogoRow>, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let offset = page.unwrap_or(0) * PAGE_SIZE;
    let mut query_builder = sqlx::QueryBuilder::<sqlx::Postgres>::new(SERVICO_CATALOGO_SELECT);
    query_builder.push(" WHERE 1=1");

    if apenas_ativos.unwrap_or(true) {
        query_builder.push(" AND ativo = true");
    }

    if let Some(busca) = busca.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        let pattern = format!("%{}%", busca);
        query_builder.push(" AND (nome ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR COALESCE(descricao, '') ILIKE ");
        query_builder.push_bind(pattern);
        query_builder.push(")");
    }

    query_builder.push(" ORDER BY nome ASC LIMIT ");
    query_builder.push_bind(PAGE_SIZE);
    query_builder.push(" OFFSET ");
    query_builder.push_bind(offset);

    query_builder
        .build_query_as::<ServicoCatalogoRow>()
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao listar serviços: {}", e);
            e.to_string()
        })
}

#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn buscar_servico(id: i32) -> Result<ServicoCatalogoRow, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let query = format!("{} WHERE id = $1", SERVICO_CATALOGO_SELECT);
    sqlx::query_as::<_, ServicoCatalogoRow>(&query)
        .bind(id)
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
    let nome = required_text(&input.nome, "Nome do serviço")?;
    let descricao = optional_text(input.descricao.as_deref());

    if input.preco_padrao <= 0.0 {
        return Err("Preço padrão deve ser maior que zero.".to_string());
    }

    let row = sqlx::query_scalar::<_, i32>(
        r#"
        INSERT INTO servicos_catalogo (nome, descricao, preco_padrao)
        VALUES ($1, $2, $3)
        RETURNING id
        "#,
    )
    .bind(nome.clone())
    .bind(descricao)
    .bind(input.preco_padrao)
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
    let nome = required_text(&input.nome, "Nome do serviço")?;
    let descricao = optional_text(input.descricao.as_deref());
    let concurrency_token = required_concurrency_token(input.atualizado_em.as_deref())?;

    if input.preco_padrao <= 0.0 {
        return Err("Preço padrão deve ser maior que zero.".to_string());
    }

    let updated_rows = sqlx::query(
        r#"
        UPDATE servicos_catalogo SET
            nome = $1,
            descricao = $2,
            preco_padrao = $3,
            atualizado_em = NOW()
        WHERE id = $4 AND atualizado_em = $5::TIMESTAMPTZ
        "#,
    )
    .bind(nome.clone())
    .bind(descricao)
    .bind(input.preco_padrao)
    .bind(id)
    .bind(concurrency_token)
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
            "Conflito de concorrência: o serviço foi alterado por outro usuário. Recarregue a tela e tente novamente."
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
    let result = sqlx::query("UPDATE servicos_catalogo SET ativo = false, atualizado_em = NOW() WHERE id = $1")
        .bind(id)
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
