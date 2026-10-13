//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/produtos.rs — CRUD de Produtos/Estoque             ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  - listar_produtos: Lista com paginação                      ║
//! ║  - buscar_produto: Busca por ID                              ║
//! ║  - criar_produto: INSERT novo produto                        ║
//! ║  - atualizar_produto: UPDATE por ID                          ║
//! ║  - deletar_produto: DELETE por ID                            ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::auth::{
    record_security_event, require_permission, require_active_session_company_id, PERMISSION_DELETE_RECORDS, PERMISSION_STOCK_CONTROL,
};
use crate::commands::types::{
    MovimentacaoEstoqueInput, PaginatedResult, ProdutoInput, ProdutoRow, PRODUTO_SELECT,
};
use crate::db::get_pool;
use sqlx::{PgPool, Postgres, QueryBuilder, Row};
use tracing::{debug, error, info, instrument};

use super::equipamentos::PAGE_SIZE;

fn required_text(value: &str, field: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{} é obrigatório", field));
    }

    Ok(trimmed.to_string())
}

fn validar_categoria(categoria: &str) -> Result<(), String> {
    if matches!(categoria, "IMPRESSORA" | "PEÇA" | "ETIQUETA" | "RIBBON" | "OUTROS") {
        Ok(())
    } else {
        Err("Categoria de estoque inválida.".to_string())
    }
}

fn add_product_filters(
    query: &mut QueryBuilder<Postgres>,
    empresa_id: i32,
    busca: Option<&str>,
    categoria: Option<&str>,
    apenas_estoque_baixo: bool,
) {
    query.push(" WHERE ativo = true AND empresa_id = ").push_bind(empresa_id);

    if let Some(busca) = busca.map(str::trim).filter(|value| !value.is_empty()) {
        let pattern = format!("%{}%", busca);
        query
            .push(" AND (codigo ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR nome ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR COALESCE(descricao, '') ILIKE ")
            .push_bind(pattern)
            .push(")");
    }

    if let Some(categoria) = categoria
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != "TODOS")
    {
        query.push(" AND categoria = ").push_bind(categoria.to_string());
    }

    if apenas_estoque_baixo {
        query.push(" AND quantidade_estoque < quantidade_minima");
    }
}

async fn query_product_page(
    pool: &PgPool,
    empresa_id: i32,
    page: Option<i32>,
    busca: Option<&str>,
    categoria: Option<&str>,
    apenas_estoque_baixo: bool,
) -> Result<PaginatedResult<ProdutoRow>, String> {
    let mut count_query = QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM produtos");
    add_product_filters(
        &mut count_query,
        empresa_id,
        busca,
        categoria,
        apenas_estoque_baixo,
    );
    let total = count_query
        .build_query_scalar::<i64>()
        .fetch_one(pool)
        .await
        .map_err(|error| format!("Erro ao contar produtos: {}", error))?;

    let below_minimum = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM produtos
         WHERE empresa_id = $1 AND ativo = true
           AND quantidade_estoque < quantidade_minima",
    )
    .bind(empresa_id)
    .fetch_one(pool)
    .await
    .map_err(|error| format!("Erro ao contar produtos abaixo do mínimo: {}", error))?;

    let safe_page = page.unwrap_or(0).max(0) as i64;
    let page_limit = i64::from(super::equipamentos::UI_PAGE_SIZE);
    let mut items_query = QueryBuilder::<Postgres>::new(PRODUTO_SELECT);
    add_product_filters(
        &mut items_query,
        empresa_id,
        busca,
        categoria,
        apenas_estoque_baixo,
    );
    // LIMIT e OFFSET são int8 aqui e em `query_product_rows`. O PostgreSQL
    // reaproveita a consulta preparada pelo texto; misturar int4 e int8 no
    // OFFSET quebra a tela com "incorrect binary data format in bind parameter 3".
    items_query
        .push(" ORDER BY id DESC LIMIT ")
        .push_bind(page_limit)
        .push(" OFFSET ")
        .push_bind(safe_page * page_limit);

    let items = items_query
        .build_query_as::<ProdutoRow>()
        .fetch_all(pool)
        .await
        .map_err(|error| format!("Erro ao listar produtos: {}", error))?;

    Ok(PaginatedResult {
        items,
        total,
        below_minimum: Some(below_minimum),
    })
}

fn optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
}

fn validate_movimentacao_input(input: &MovimentacaoEstoqueInput) -> Result<(String, String, Option<String>), String> {
    if input.quantidade <= 0 {
        return Err("Quantidade da movimentação deve ser maior que zero".to_string());
    }

    let movimento = input.tipo.trim().to_uppercase();
    if movimento != "ENTRADA" && movimento != "SAIDA" {
        return Err("Tipo de movimentação inválido".to_string());
    }

    let origem = input.origem.trim().to_string();
    if origem.is_empty() {
        return Err("Origem da movimentação é obrigatória".to_string());
    }

    let referencia = input
        .referencia
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());

    Ok((movimento, origem, referencia))
}

fn calculate_resulting_stock(quantidade_atual: i32, quantidade: i32, movimento: &str) -> Result<i32, String> {
    let quantidade_resultante = if movimento == "ENTRADA" {
        quantidade_atual + quantidade
    } else {
        quantidade_atual - quantidade
    };

    if quantidade_resultante < 0 {
        return Err("Estoque insuficiente para registrar a saída informada".to_string());
    }

    Ok(quantidade_resultante)
}

fn required_concurrency_token(token: Option<&str>, entity_label: &str) -> Result<String, String> {
    token
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .ok_or_else(|| format!("Token de concorrência de {} é obrigatório para atualizar o cadastro.", entity_label))
}

fn concurrency_conflict_message(entity_label: &str) -> String {
    format!(
        "Conflito de concorrência: {} foi alterado por outro técnico. Recarregue os dados antes de salvar novamente.",
        entity_label
    )
}

/// Listar produtos com paginação.
#[tauri::command]
#[instrument(skip_all, fields(page = page))]
pub async fn listar_produtos(
    page: Option<i32>,
    busca: Option<String>,
    categoria: Option<String>,
    apenas_estoque_baixo: Option<bool>,
) -> Result<Vec<ProdutoRow>, String> {
    debug!("Listando produtos");
    let pool = get_pool().await.map_err(|e| {
        error!("Erro ao obter pool: {}", e);
        e.to_string()
    })?;

    let empresa_id = require_active_session_company_id(&pool).await?;
    query_product_rows(
        &pool,
        empresa_id,
        page,
        busca.as_deref(),
        categoria.as_deref(),
        apenas_estoque_baixo.unwrap_or(false),
    )
    .await
}

async fn query_product_rows(
    pool: &PgPool,
    empresa_id: i32,
    page: Option<i32>,
    busca: Option<&str>,
    categoria: Option<&str>,
    apenas_estoque_baixo: bool,
) -> Result<Vec<ProdutoRow>, String> {
    let safe_page = i64::from(page.unwrap_or(0).max(0));
    let page_limit = i64::from(PAGE_SIZE);
    let offset = safe_page * page_limit;
    let mut query_builder = sqlx::QueryBuilder::<sqlx::Postgres>::new(format!(
        "{} WHERE ativo = true",
        PRODUTO_SELECT,
    ));

    query_builder.push(" AND empresa_id = ").push_bind(empresa_id);
    if let Some(busca) = busca.map(str::trim).filter(|value| !value.is_empty()) {
        let pattern = format!("%{}%", busca);
        query_builder.push(" AND (");
        query_builder.push("codigo ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR nome ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR COALESCE(descricao, '') ILIKE ");
        query_builder.push_bind(pattern);
        query_builder.push(")");
    }

    if let Some(categoria) = categoria.map(str::trim).filter(|value| !value.is_empty() && *value != "TODOS") {
        query_builder.push(" AND categoria = ");
        query_builder.push_bind(categoria.to_string());
    }

    if apenas_estoque_baixo {
        query_builder.push(" AND quantidade_estoque < quantidade_minima");
    }

    query_builder.push(" ORDER BY id DESC LIMIT ");
    query_builder.push_bind(page_limit);
    query_builder.push(" OFFSET ");
    query_builder.push_bind(offset);

    let rows = query_builder
        .build_query_as::<ProdutoRow>()
        .fetch_all(pool)
        .await
        .map_err(|e| {
            error!("Erro ao listar produtos: {}", e);
            e.to_string()
        })?;

    info!("Produtos listados: {} itens (página {})", rows.len(), page.unwrap_or(0));
    Ok(rows)
}

/// Lista uma página de produtos, sua contagem filtrada e o total abaixo do mínimo.
#[tauri::command]
#[instrument(skip_all, fields(page = page))]
pub async fn listar_produtos_paginados(
    page: Option<i32>,
    busca: Option<String>,
    categoria: Option<String>,
    apenas_estoque_baixo: Option<bool>,
) -> Result<PaginatedResult<ProdutoRow>, String> {
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    query_product_page(
        &pool,
        empresa_id,
        page,
        busca.as_deref(),
        categoria.as_deref(),
        apenas_estoque_baixo.unwrap_or(false),
    )
    .await
}

/// Buscar produto por ID.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn buscar_produto(id: i32) -> Result<ProdutoRow, String> {
    debug!("Buscando produto {}", id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;

    let query = format!("{} WHERE id = $1 AND empresa_id = $2", PRODUTO_SELECT);
    let row = sqlx::query_as::<_, ProdutoRow>(sqlx::AssertSqlSafe(&*query))
        .bind(id)
        .bind(empresa_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            error!("Produto {} não encontrado: {}", id, e);
            e.to_string()
        })?;

    info!("Produto {} encontrado", id);
    Ok(row)
}

/// Criar novo produto.
#[tauri::command]
#[instrument(skip_all, fields(codigo = %input.codigo))]
pub async fn criar_produto(input: ProdutoInput) -> Result<ProdutoRow, String> {
    let actor = require_permission(PERMISSION_STOCK_CONTROL)?;
    debug!("Criando produto: {}", input.codigo);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let codigo = required_text(&input.codigo, "Código")?;
    let nome = required_text(&input.nome, "Nome")?;
    let categoria = required_text(&input.categoria, "Categoria")?;
    validar_categoria(&categoria)?;
    let unidade_medida = optional_text(input.unidade_medida.as_deref()).unwrap_or_else(|| "UN".to_string());
    let quantidade_minima = input.quantidade_minima.unwrap_or(5);
    let quantidade_maxima = input.quantidade_maxima.unwrap_or(50);

    if input.quantidade_estoque < 0 {
        return Err("Quantidade em estoque não pode ser negativa".to_string());
    }
    if quantidade_minima < 0 {
        return Err("Quantidade mínima não pode ser negativa".to_string());
    }
    if quantidade_maxima < quantidade_minima {
        return Err("Quantidade máxima deve ser maior ou igual à quantidade mínima".to_string());
    }
    if input.preco_custo < 0.0 {
        return Err("Preço de custo não pode ser negativo".to_string());
    }
    if input.preco_venda < 0.0 {
        return Err("Preço de venda não pode ser negativo".to_string());
    }
    if let Some(rendimento) = input.rendimento {
        if rendimento < 0 {
            return Err("Rendimento não pode ser negativo".to_string());
        }
    }
    if let Some(prazo_entrega) = input.prazo_entrega {
        if prazo_entrega < 0 {
            return Err("Prazo de entrega não pode ser negativo".to_string());
        }
    }

    let row = sqlx::query(
        r#"
        INSERT INTO produtos (
            codigo, nome, descricao, categoria,
            quantidade_estoque, quantidade_minima, quantidade_maxima,
            unidade_medida, localizacao, preco_custo, preco_venda, margem_lucro,
            marca_original, tipo_cartucho, cor, rendimento, modelos_compativeis,
            fornecedor_principal, prazo_entrega, empresa_id
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        ) RETURNING id
        "#,
    )
    .bind(codigo)
    .bind(nome)
    .bind(optional_text(input.descricao.as_deref()))
    .bind(categoria)
    .bind(input.quantidade_estoque)
    .bind(quantidade_minima)
    .bind(quantidade_maxima)
    .bind(unidade_medida)
    .bind(optional_text(input.localizacao.as_deref()))
    .bind(input.preco_custo)
    .bind(input.preco_venda)
    .bind(input.margem_lucro)
    .bind(optional_text(input.marca_original.as_deref()))
    .bind(optional_text(input.tipo_cartucho.as_deref()))
    .bind(optional_text(input.cor.as_deref()))
    .bind(input.rendimento)
    .bind(optional_text(input.modelos_compativeis.as_deref()))
    .bind(optional_text(input.fornecedor_principal.as_deref()))
    .bind(input.prazo_entrega)
    .bind(empresa_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao criar produto: {}", e);
        super::operator_errors::erro_sql_para_operador(&e)
    })?;

    let id: i32 = row.get("id");
    record_security_event(
        "PRODUCT_CREATED",
        Some(&actor),
        format!("produto_id={}; codigo={}", id, input.codigo.trim()),
        true,
    )
    .await;
    info!("Produto criado: id={}", id);
    buscar_produto(id).await
}

/// Atualizar produto por ID.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn atualizar_produto(id: i32, input: ProdutoInput) -> Result<ProdutoRow, String> {
    let actor = require_permission(PERMISSION_STOCK_CONTROL)?;
    debug!("Atualizando produto {}", id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let concurrency_token = required_concurrency_token(input.atualizado_em.as_deref(), "produto")?;
    let codigo = required_text(&input.codigo, "Código")?;
    let nome = required_text(&input.nome, "Nome")?;
    let categoria = required_text(&input.categoria, "Categoria")?;
    validar_categoria(&categoria)?;
    let unidade_medida = optional_text(input.unidade_medida.as_deref()).unwrap_or_else(|| "UN".to_string());
    let quantidade_minima = input.quantidade_minima.unwrap_or(5);
    let quantidade_maxima = input.quantidade_maxima.unwrap_or(50);

    if input.quantidade_estoque < 0 {
        return Err("Quantidade em estoque não pode ser negativa".to_string());
    }
    if quantidade_minima < 0 {
        return Err("Quantidade mínima não pode ser negativa".to_string());
    }
    if quantidade_maxima < quantidade_minima {
        return Err("Quantidade máxima deve ser maior ou igual à quantidade mínima".to_string());
    }
    if input.preco_custo < 0.0 {
        return Err("Preço de custo não pode ser negativo".to_string());
    }
    if input.preco_venda < 0.0 {
        return Err("Preço de venda não pode ser negativo".to_string());
    }
    if let Some(rendimento) = input.rendimento {
        if rendimento < 0 {
            return Err("Rendimento não pode ser negativo".to_string());
        }
    }
    if let Some(prazo_entrega) = input.prazo_entrega {
        if prazo_entrega < 0 {
            return Err("Prazo de entrega não pode ser negativo".to_string());
        }
    }

    let updated_rows = sqlx::query(
        r#"
        UPDATE produtos SET
            codigo = $1, nome = $2, descricao = $3, categoria = $4,
            quantidade_estoque = $5, quantidade_minima = $6, quantidade_maxima = $7,
            unidade_medida = $8, localizacao = $9, preco_custo = $10,
            preco_venda = $11, margem_lucro = $12, marca_original = $13,
            tipo_cartucho = $14, cor = $15, rendimento = $16, modelos_compativeis = $17,
            fornecedor_principal = $18, prazo_entrega = $19, atualizado_em = NOW()
        WHERE id = $20 AND atualizado_em = $21::TIMESTAMPTZ AND empresa_id = $22
        "#,
    )
    .bind(codigo)
    .bind(nome)
    .bind(optional_text(input.descricao.as_deref()))
    .bind(categoria)
    .bind(input.quantidade_estoque)
    .bind(quantidade_minima)
    .bind(quantidade_maxima)
    .bind(unidade_medida)
    .bind(optional_text(input.localizacao.as_deref()))
    .bind(input.preco_custo)
    .bind(input.preco_venda)
    .bind(input.margem_lucro)
    .bind(optional_text(input.marca_original.as_deref()))
    .bind(optional_text(input.tipo_cartucho.as_deref()))
    .bind(optional_text(input.cor.as_deref()))
    .bind(input.rendimento)
    .bind(optional_text(input.modelos_compativeis.as_deref()))
    .bind(optional_text(input.fornecedor_principal.as_deref()))
    .bind(input.prazo_entrega)
    .bind(id)
    .bind(concurrency_token)
    .bind(empresa_id)
    .execute(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao atualizar produto {}: {}", id, e);
        super::operator_errors::erro_sql_para_operador(&e)
    })?
    .rows_affected();

    if updated_rows == 0 {
        return Err(concurrency_conflict_message("o produto"));
    }

    record_security_event(
        "PRODUCT_UPDATED",
        Some(&actor),
        format!("produto_id={}; codigo={}", id, input.codigo.trim()),
        true,
    )
    .await;

    info!("Produto {} atualizado", id);
    buscar_produto(id).await
}

/// Deletar produto por ID (soft delete - marca como inativo).
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn deletar_produto(id: i32) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_DELETE_RECORDS)?;
    debug!("Deletando produto {}", id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;

    // Soft delete: marca como inativo em vez de deletar
    let result = sqlx::query("UPDATE produtos SET ativo = false, atualizado_em = NOW() WHERE id = $1 AND empresa_id = $2")
        .bind(id)
        .bind(empresa_id)
        .execute(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao deletar produto {}: {}", id, e);
            e.to_string()
        })?;

    let deleted = result.rows_affected() > 0;
    record_security_event(
        "PRODUCT_DELETED",
        Some(&actor),
        format!("produto_id={}; deleted={}", id, deleted),
        deleted,
    )
    .await;
    if deleted {
        info!("Produto {} marcado como inativo", id);
    } else {
        error!("Produto {} não encontrado para deleção", id);
    }
    Ok(deleted)
}

/// Registra movimentação de estoque e atualiza saldo do produto de forma atômica.
#[tauri::command]
#[instrument(skip_all, fields(produto_id = input.produto_id, tipo = %input.tipo))]
pub async fn registrar_movimentacao_estoque(input: MovimentacaoEstoqueInput) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_STOCK_CONTROL)?;
    let (movimento, origem, referencia) = validate_movimentacao_input(&input)?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let _saldo_resultante = if movimento == "ENTRADA" {
        sqlx::query_scalar(
            r#"
            UPDATE produtos
            SET quantidade_estoque = COALESCE(quantidade_estoque, 0) + $1, atualizado_em = NOW()
            WHERE id = $2 AND empresa_id = $3 AND ativo = true
            RETURNING quantidade_estoque
            "#,
        )
        .bind(input.quantidade)
        .bind(input.produto_id)
        .bind(empresa_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| {
            error!("Erro ao registrar entrada no produto {}: {}", input.produto_id, e);
            e.to_string()
        })?
        .ok_or_else(|| "Produto não encontrado".to_string())?
    } else {
        match sqlx::query_scalar(
            r#"
            UPDATE produtos
            SET quantidade_estoque = COALESCE(quantidade_estoque, 0) - $1, atualizado_em = NOW()
            WHERE id = $2 AND empresa_id = $3
              AND ativo = true
              AND COALESCE(quantidade_estoque, 0) >= $1
            RETURNING quantidade_estoque
            "#,
        )
        .bind(input.quantidade)
        .bind(input.produto_id)
        .bind(empresa_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| {
            error!("Erro ao registrar saída no produto {}: {}", input.produto_id, e);
            e.to_string()
        })? {
            Some(quantidade) => quantidade,
            None => {
                let saldo_atual = sqlx::query_scalar::<_, i32>(
                    "SELECT COALESCE(quantidade_estoque, 0) FROM produtos WHERE id = $1 AND empresa_id = $2 AND ativo = true",
                )
                .bind(input.produto_id)
                .bind(empresa_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| {
                    error!("Erro ao verificar saldo atual do produto {}: {}", input.produto_id, e);
                    e.to_string()
                })?;

                let quantidade_atual = saldo_atual.ok_or_else(|| "Produto não encontrado".to_string())?;
                calculate_resulting_stock(quantidade_atual, input.quantidade, &movimento)?
            }
        }
    };

    sqlx::query(
        r#"
        INSERT INTO movimentacoes_estoque (
            produto_id, tipo, quantidade, origem, referencia, data_hora, empresa_id
        ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
        "#,
    )
    .bind(input.produto_id)
    .bind(&movimento)
    .bind(input.quantidade)
    .bind(&origem)
    .bind(referencia)
    .bind(empresa_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        error!("Erro ao registrar movimentação de estoque do produto {}: {}", input.produto_id, e);
        e.to_string()
    })?;

    tx.commit().await.map_err(|e| {
        error!("Erro ao confirmar transação de movimentação do produto {}: {}", input.produto_id, e);
        e.to_string()
    })?;

    record_security_event(
        "STOCK_MOVEMENT_RECORDED",
        Some(&actor),
        format!(
            "produto_id={}; tipo={}; quantidade={}; origem={}",
            input.produto_id,
            movimento,
            input.quantidade,
            origem,
        ),
        true,
    )
    .await;

    info!("Movimentação {} registrada para produto {}", movimento, input.produto_id);
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn movement_input(tipo: &str, quantidade: i32, origem: &str) -> MovimentacaoEstoqueInput {
        MovimentacaoEstoqueInput {
            produto_id: 1,
            tipo: tipo.to_string(),
            quantidade,
            origem: origem.to_string(),
            referencia: None,
        }
    }

    #[test]
    fn p1_stock_movement_input_validation_rejects_invalid_payloads() {
        let invalid_qty = movement_input("ENTRADA", 0, "COMPRA");
        assert!(validate_movimentacao_input(&invalid_qty)
            .unwrap_err()
            .contains("maior que zero"));

        let invalid_type = movement_input("TRANSFERENCIA", 2, "COMPRA");
        assert!(validate_movimentacao_input(&invalid_type)
            .unwrap_err()
            .contains("inválido"));

        let invalid_origin = movement_input("SAIDA", 2, "   ");
        assert!(validate_movimentacao_input(&invalid_origin)
            .unwrap_err()
            .contains("Origem"));
    }

    #[test]
    fn p1_stock_movement_calculation_enforces_non_negative_balance() {
        assert_eq!(calculate_resulting_stock(10, 3, "ENTRADA").unwrap(), 13);
        assert_eq!(calculate_resulting_stock(10, 3, "SAIDA").unwrap(), 7);
        assert!(calculate_resulting_stock(2, 3, "SAIDA")
            .unwrap_err()
            .contains("insuficiente"));
    }

    /// Só devolve a URL quando ela foi passada de propósito e aponta para um
    /// banco descartável em localhost. Sem isso o teste não conecta e não
    /// executa DROP SCHEMA.
    fn banco_descartavel_explicito() -> Option<String> {
        let url = std::env::var("AUTOOS_PAGE_TEST_DATABASE_URL").ok()?;
        let parsed = url::Url::parse(&url).ok()?;
        let host = parsed.host_str().unwrap_or("");
        let local = host.is_empty() || host == "localhost" || host == "127.0.0.1" || host == "::1";
        let nome = parsed.path().trim_start_matches('/').to_ascii_lowercase();
        let descartavel = nome.contains("test") || nome.contains("descart");
        if local && descartavel {
            Some(url)
        } else {
            None
        }
    }

    async fn pool_no_schema_de_teste(url: &str) -> PgPool {
        let mut separado = url::Url::parse(url).unwrap();
        separado.query_pairs_mut().clear().append_pair(
            "options",
            "-csearch_path=autoos_insumos_page_test",
        );
        sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .connect(separado.as_str())
            .await
            .unwrap_or_else(|error| panic!("não foi possível abrir o schema de teste: {error}"))
    }

    /// Pagina Insumos pelos dois comandos que compartilham o mesmo SQL.
    /// Antes, um OFFSET int4 e outro int8 faziam o PostgreSQL recusar o bind 3.
    #[tokio::test]
    async fn paginar_insumos_reaproveita_a_consulta_sem_erro() {
        let Some(url) = banco_descartavel_explicito() else {
            eprintln!(
                "paginar_insumos ignorado: defina AUTOOS_PAGE_TEST_DATABASE_URL com um banco descartável em localhost"
            );
            return;
        };
        let admin = sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap_or_else(|error| panic!("Postgres local indisponível para paginar insumos: {error}"));
        sqlx::query("DROP SCHEMA IF EXISTS autoos_insumos_page_test CASCADE")
            .execute(&admin)
            .await
            .unwrap();
        sqlx::query("CREATE SCHEMA autoos_insumos_page_test")
            .execute(&admin)
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE autoos_insumos_page_test.produtos (
                id serial primary key,
                empresa_id integer,
                codigo text,
                nome text,
                descricao text,
                categoria text,
                quantidade_estoque integer,
                quantidade_minima integer,
                quantidade_maxima integer,
                unidade_medida text,
                localizacao text,
                preco_custo numeric,
                preco_venda numeric,
                margem_lucro numeric,
                marca_original text,
                tipo_cartucho text,
                cor text,
                rendimento integer,
                modelos_compativeis text,
                fornecedor_principal text,
                prazo_entrega integer,
                ativo boolean,
                criado_em timestamptz default now(),
                atualizado_em timestamptz default now()
            )",
        )
        .execute(&admin)
        .await
        .unwrap();
        for numero in 1..=12 {
            sqlx::query(
                "INSERT INTO autoos_insumos_page_test.produtos
                    (empresa_id, codigo, nome, categoria, quantidade_estoque, quantidade_minima, quantidade_maxima, preco_custo, preco_venda, ativo)
                 VALUES (7, $1, $2, 'OUTROS', 4, 1, 20, 1, 2, true)",
            )
            .bind(format!("SKU-{numero:02}"))
            .bind(format!("Insumo {numero}"))
            .execute(&admin)
            .await
            .unwrap();
        }

        let pool = pool_no_schema_de_teste(&url).await;
        let lista = query_product_rows(&pool, 7, Some(0), None, None, false)
            .await
            .expect("listar insumos");
        let pagina = query_product_page(&pool, 7, Some(1), None, None, false)
            .await
            .expect("paginar insumos depois da listagem");
        assert_eq!(lista.len(), 12, "a listagem não pode falhar nem cortar a página de 50");
        assert_eq!(pagina.total, 12);
        assert_eq!(pagina.items.len(), 2, "a segunda página de 10 itens fica com o restante");
        assert!(
            pagina.items.iter().all(|item| lista.iter().any(|outro| outro.id == item.id)),
            "a página precisa pertencer à mesma listagem"
        );

        let outro = pool_no_schema_de_teste(&url).await;
        let primeira = query_product_page(&outro, 7, Some(0), None, None, false)
            .await
            .expect("abrir a primeira página");
        let lista_depois = query_product_rows(&outro, 7, Some(0), None, None, false)
            .await
            .expect("listar depois de paginar");
        assert_eq!(primeira.items.len(), 10);
        assert_eq!(lista_depois.len(), 12);

        sqlx::query("DROP SCHEMA IF EXISTS autoos_insumos_page_test CASCADE")
            .execute(&admin)
            .await
            .unwrap();
    }
}
