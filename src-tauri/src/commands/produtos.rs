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
    record_security_event, require_permission, PERMISSION_DELETE_RECORDS, PERMISSION_STOCK_CONTROL,
};
use crate::commands::types::{MovimentacaoEstoqueInput, ProdutoInput, ProdutoRow, PRODUTO_SELECT};
use crate::db::get_pool;
use sqlx::Row;
use tracing::{debug, error, info, instrument};

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

    let offset = page.unwrap_or(0) * PAGE_SIZE;
    let mut query_builder = sqlx::QueryBuilder::<sqlx::Postgres>::new(format!(
        "{} WHERE ativo = true",
        PRODUTO_SELECT,
    ));

    if let Some(busca) = busca.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
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

    if let Some(categoria) = categoria.as_deref().map(str::trim).filter(|value| !value.is_empty() && *value != "TODOS") {
        query_builder.push(" AND categoria = ");
        query_builder.push_bind(categoria.to_string());
    }

    if apenas_estoque_baixo.unwrap_or(false) {
        query_builder.push(" AND quantidade_estoque < quantidade_minima");
    }

    query_builder.push(format!(" ORDER BY id DESC LIMIT {} OFFSET {}", PAGE_SIZE, offset));

    let rows = query_builder
        .build_query_as::<ProdutoRow>()
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao listar produtos: {}", e);
            e.to_string()
        })?;

    info!("Produtos listados: {} itens (página {})", rows.len(), page.unwrap_or(0));
    Ok(rows)
}

/// Buscar produto por ID.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn buscar_produto(id: i32) -> Result<ProdutoRow, String> {
    debug!("Buscando produto {}", id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let query = format!("{} WHERE id = $1", PRODUTO_SELECT);
    let row = sqlx::query_as::<_, ProdutoRow>(&query)
        .bind(id)
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
    let codigo = required_text(&input.codigo, "Código")?;
    let nome = required_text(&input.nome, "Nome")?;
    let categoria = required_text(&input.categoria, "Categoria")?;
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
            fornecedor_principal, prazo_entrega
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19
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
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao criar produto: {}", e);
        e.to_string()
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
    let codigo = required_text(&input.codigo, "Código")?;
    let nome = required_text(&input.nome, "Nome")?;
    let categoria = required_text(&input.categoria, "Categoria")?;
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

    sqlx::query(
        r#"
        UPDATE produtos SET
            codigo = $1, nome = $2, descricao = $3, categoria = $4,
            quantidade_estoque = $5, quantidade_minima = $6, quantidade_maxima = $7,
            unidade_medida = $8, localizacao = $9, preco_custo = $10,
            preco_venda = $11, margem_lucro = $12, marca_original = $13,
            tipo_cartucho = $14, cor = $15, rendimento = $16, modelos_compativeis = $17,
            fornecedor_principal = $18, prazo_entrega = $19, atualizado_em = NOW()
        WHERE id = $20
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
    .execute(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao atualizar produto {}: {}", id, e);
        e.to_string()
    })?;

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

    // Soft delete: marca como inativo em vez de deletar
    let result = sqlx::query("UPDATE produtos SET ativo = false, atualizado_em = NOW() WHERE id = $1")
        .bind(id)
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

    if input.quantidade <= 0 {
        return Err("Quantidade da movimentação deve ser maior que zero".to_string());
    }

    let movimento = input.tipo.trim().to_uppercase();
    if movimento != "ENTRADA" && movimento != "SAIDA" {
        return Err("Tipo de movimentação inválido".to_string());
    }

    let origem = input.origem.trim();
    if origem.is_empty() {
        return Err("Origem da movimentação é obrigatória".to_string());
    }

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let produto = sqlx::query_as::<_, ProdutoRow>(&format!("{} WHERE id = $1", PRODUTO_SELECT))
        .bind(input.produto_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| {
            error!("Erro ao carregar produto {} para movimentação: {}", input.produto_id, e);
            e.to_string()
        })?
        .ok_or_else(|| "Produto não encontrado".to_string())?;

    let quantidade_atual = produto.quantidade_estoque.unwrap_or(0);
    let quantidade_resultante = if movimento == "ENTRADA" {
        quantidade_atual + input.quantidade
    } else {
        quantidade_atual - input.quantidade
    };

    if quantidade_resultante < 0 {
        return Err("Estoque insuficiente para registrar a saída informada".to_string());
    }

    sqlx::query(
        r#"
        UPDATE produtos
        SET quantidade_estoque = $1, atualizado_em = NOW()
        WHERE id = $2
        "#,
    )
    .bind(quantidade_resultante)
    .bind(input.produto_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        error!("Erro ao atualizar saldo do produto {}: {}", input.produto_id, e);
        e.to_string()
    })?;

    sqlx::query(
        r#"
        INSERT INTO movimentacoes_estoque (
            produto_id, tipo, quantidade, origem, referencia, data_hora
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        "#,
    )
    .bind(input.produto_id)
    .bind(&movimento)
    .bind(input.quantidade)
    .bind(origem)
    .bind(input.referencia.as_deref().map(str::trim).filter(|value| !value.is_empty()))
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
