//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/gastos.rs — CRUD de Gastos (Fixos + Variáveis)     ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  - listar_gastos_fixos: Lista todos os gastos fixos ativos     ║
//! ║  - criar_gasto_fixo: INSERT novo gasto fixo                  ║
//! ║  - atualizar_gasto_fixo: UPDATE por ID                       ║
//! ║  - listar_gastos_variaveis: Lista gastos variáveis do mês    ║
//! ║  - criar_gasto_variavel: INSERT novo gasto variável          ║
//! ║  - resumo_mensal: Resumo agregado fixo + variável + categ.   ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::auth::{record_security_event, require_permission, PERMISSION_VIEW_EXPENSES};
use crate::commands::types::{
    CategoriaValor, GastoFixoInput, GastoFixoRow, GastoResumoMensal, GastoVariavelInput,
    GastoVariavelRow, GASTO_FIXO_SELECT, GASTO_VARIAVEL_SELECT,
};
use crate::db::get_pool;
use sqlx::Row;
use tracing::{debug, error, info, instrument};

/// Categorias seed válidas para gastos (Aluguel, Energia, Internet, Fornecedores, Folha, Outros).
const CATEGORIAS_VALIDAS: &[&str] = &[
    "Aluguel",
    "Energia",
    "Internet",
    "Fornecedores",
    "Folha",
    "Outros",
];

fn required_text(value: &str, field: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{} é obrigatório", field));
    }
    Ok(trimmed.to_string())
}

fn validate_categoria(categoria: &str) -> Result<String, String> {
    let trimmed = categoria.trim();
    if trimmed.is_empty() {
        return Err("Categoria é obrigatória".to_string());
    }
    if !CATEGORIAS_VALIDAS.contains(&trimmed) {
        return Err(format!(
            "Categoria inválida. Válidas: {}",
            CATEGORIAS_VALIDAS.join(", ")
        ));
    }
    Ok(trimmed.to_string())
}

fn validate_valor_positivo(valor: f64) -> Result<(), String> {
    if valor <= 0.0 {
        return Err("Valor deve ser maior que zero".to_string());
    }
    Ok(())
}

/// Listar todos os gastos fixos ordenados por categoria, nome.
#[tauri::command]
#[instrument(skip_all)]
pub async fn listar_gastos_fixos() -> Result<Vec<GastoFixoRow>, String> {
    let _actor = require_permission(PERMISSION_VIEW_EXPENSES)?;
    debug!("Listando gastos fixos");
    let pool = get_pool().await.map_err(|e| {
        error!("Erro ao obter pool: {}", e);
        e.to_string()
    })?;

    let query = format!(
        "{} WHERE ativo = true ORDER BY categoria ASC, nome ASC",
        GASTO_FIXO_SELECT,
    );
    let rows = sqlx::query_as::<_, GastoFixoRow>(&query)
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao listar gastos fixos: {}", e);
            format!("Erro ao listar gastos fixos: {}", e)
        })?;

    info!("Gastos fixos listados: {} itens", rows.len());
    Ok(rows)
}

/// Criar novo gasto fixo.
#[tauri::command]
#[instrument(skip_all, fields(nome = %input.nome))]
pub async fn criar_gasto_fixo(input: GastoFixoInput) -> Result<GastoFixoRow, String> {
    let actor = require_permission(PERMISSION_VIEW_EXPENSES)?;
    debug!("Criando gasto fixo: {}", input.nome);
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let nome = required_text(&input.nome, "Nome")?;
    validate_valor_positivo(input.valor)?;
    let categoria = validate_categoria(&input.categoria)?;

    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM gastos_fixos WHERE nome = $1 AND ativo = true)",
    )
    .bind(&nome)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao verificar unicidade do nome: {}", e);
        e.to_string()
    })?;

    if exists {
        return Err(format!("Já existe um gasto fixo com o nome '{}'", nome));
    }

    let row = sqlx::query(
        r#"
        INSERT INTO gastos_fixos (nome, valor, vencimento_dia, categoria, ativo)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        "#,
    )
    .bind(&nome)
    .bind(input.valor)
    .bind(input.vencimento_dia)
    .bind(&categoria)
    .bind(input.ativo.unwrap_or(true))
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao criar gasto fixo: {}", e);
        e.to_string()
    })?;

    let id: i32 = row.get("id");
    record_security_event(
        "FIXED_EXPENSE_CREATED",
        Some(&actor),
        format!("gasto_fixo_id={}; nome={}", id, nome),
        true,
    )
    .await;
    info!("Gasto fixo criado: id={}", id);
    buscar_gasto_fixo(id).await
}

/// Atualizar gasto fixo por ID.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn atualizar_gasto_fixo(id: i32, input: GastoFixoInput) -> Result<GastoFixoRow, String> {
    let actor = require_permission(PERMISSION_VIEW_EXPENSES)?;
    debug!("Atualizando gasto fixo {}", id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let nome = required_text(&input.nome, "Nome")?;
    validate_valor_positivo(input.valor)?;
    let categoria = validate_categoria(&input.categoria)?;

    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM gastos_fixos WHERE nome = $1 AND ativo = true AND id != $2)",
    )
    .bind(&nome)
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao verificar unicidade do nome: {}", e);
        e.to_string()
    })?;

    if exists {
        return Err(format!("Já existe um gasto fixo com o nome '{}'", nome));
    }

    let updated_rows = sqlx::query(
        r#"
        UPDATE gastos_fixos SET
            nome = $1, valor = $2, vencimento_dia = $3, categoria = $4, ativo = $5,
            atualizado_em = NOW()
        WHERE id = $6
        "#,
    )
    .bind(&nome)
    .bind(input.valor)
    .bind(input.vencimento_dia)
    .bind(&categoria)
    .bind(input.ativo.unwrap_or(true))
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao atualizar gasto fixo {}: {}", id, e);
        e.to_string()
    })?
    .rows_affected();

    if updated_rows == 0 {
        return Err("Gasto fixo não encontrado".to_string());
    }

    record_security_event(
        "FIXED_EXPENSE_UPDATED",
        Some(&actor),
        format!("gasto_fixo_id={}; nome={}", id, nome),
        true,
    )
    .await;

    info!("Gasto fixo {} atualizado", id);
    buscar_gasto_fixo(id).await
}

/// Buscar gasto fixo por ID (função auxiliar interna).
async fn buscar_gasto_fixo(id: i32) -> Result<GastoFixoRow, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let query = format!("{} WHERE id = $1", GASTO_FIXO_SELECT);
    let row = sqlx::query_as::<_, GastoFixoRow>(&query)
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            error!("Gasto fixo {} não encontrado: {}", id, e);
            e.to_string()
        })?;
    Ok(row)
}

/// Listar gastos variáveis de um mês/ano específico.
#[tauri::command]
#[instrument(skip_all, fields(mes = mes, ano = ano))]
pub async fn listar_gastos_variaveis(mes: i32, ano: i32) -> Result<Vec<GastoVariavelRow>, String> {
    let _actor = require_permission(PERMISSION_VIEW_EXPENSES)?;
    debug!("Listando gastos variáveis para {}/{}", mes, ano);
    let pool = get_pool().await.map_err(|e| {
        error!("Erro ao obter pool: {}", e);
        e.to_string()
    })?;

    let query = format!(
        "{} WHERE DATE_TRUNC('month', data) = DATE_TRUNC('month', make_date($2, $1, 1)) ORDER BY data DESC",
        GASTO_VARIAVEL_SELECT,
    );
    let rows = sqlx::query_as::<_, GastoVariavelRow>(&query)
        .bind(mes)
        .bind(ano)
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao listar gastos variáveis: {}", e);
            format!("Erro ao listar gastos variáveis: {}", e)
        })?;

    info!("Gastos variáveis listados: {} itens para {}/{}", rows.len(), mes, ano);
    Ok(rows)
}

/// Criar novo gasto variável.
#[tauri::command]
#[instrument(skip_all, fields(descricao = %input.descricao))]
pub async fn criar_gasto_variavel(input: GastoVariavelInput) -> Result<GastoVariavelRow, String> {
    let actor = require_permission(PERMISSION_VIEW_EXPENSES)?;
    debug!("Criando gasto variável: {}", input.descricao);
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let descricao = required_text(&input.descricao, "Descrição")?;
    validate_valor_positivo(input.valor)?;
    let categoria = validate_categoria(&input.categoria)?;
    let data = required_text(&input.data, "Data")?;

    let row = sqlx::query(
        r#"
        INSERT INTO gastos_variaveis (descricao, valor, data, categoria, nota, referencia_id)
        VALUES ($1, $2, $3::DATE, $4, $5, $6)
        RETURNING id
        "#,
    )
    .bind(&descricao)
    .bind(input.valor)
    .bind(&data)
    .bind(&categoria)
    .bind(input.nota.as_deref().map(str::trim).filter(|v| !v.is_empty()))
    .bind(input.referencia_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao criar gasto variável: {}", e);
        e.to_string()
    })?;

    let id: i32 = row.get("id");
    record_security_event(
        "VARIABLE_EXPENSE_CREATED",
        Some(&actor),
        format!("gasto_variavel_id={}; descricao={}", id, descricao),
        true,
    )
    .await;
    info!("Gasto variável criado: id={}", id);
    buscar_gasto_variavel(id).await
}

/// Buscar gasto variável por ID (função auxiliar interna).
async fn buscar_gasto_variavel(id: i32) -> Result<GastoVariavelRow, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let query = format!("{} WHERE id = $1", GASTO_VARIAVEL_SELECT);
    let row = sqlx::query_as::<_, GastoVariavelRow>(&query)
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            error!("Gasto variável {} não encontrado: {}", id, e);
            e.to_string()
        })?;
    Ok(row)
}

/// Resumo mensal de gastos (fixos + variáveis + por categoria).
#[tauri::command]
#[instrument(skip_all, fields(mes = mes, ano = ano))]
pub async fn resumo_mensal(mes: i32, ano: i32) -> Result<GastoResumoMensal, String> {
    let _actor = require_permission(PERMISSION_VIEW_EXPENSES)?;
    debug!("Calculando resumo mensal para {}/{}", mes, ano);
    let pool = get_pool().await.map_err(|e| {
        error!("Erro ao obter pool: {}", e);
        e.to_string()
    })?;

    let total_fixo: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(valor), 0.0)::FLOAT8 FROM gastos_fixos WHERE ativo = true",
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao calcular total fixo: {}", e);
        format!("Erro ao calcular total fixo: {}", e)
    })?;

    let total_variavel: f64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(valor), 0.0)::FLOAT8
        FROM gastos_variaveis
        WHERE DATE_TRUNC('month', data) = DATE_TRUNC('month', make_date($2, $1, 1))
        "#,
    )
    .bind(mes)
    .bind(ano)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao calcular total variável: {}", e);
        format!("Erro ao calcular total variável: {}", e)
    })?;

    let por_categoria: Vec<CategoriaValor> = sqlx::query_as::<_, CategoriaValor>(
        r#"
        SELECT categoria, SUM(valor)::FLOAT8 as valor
        FROM (
            SELECT categoria, valor FROM gastos_fixos WHERE ativo = true
            UNION ALL
            SELECT categoria, valor FROM gastos_variaveis
            WHERE DATE_TRUNC('month', data) = DATE_TRUNC('month', make_date($2, $1, 1))
        ) combined
        GROUP BY categoria
        ORDER BY categoria ASC
        "#,
    )
    .bind(mes)
    .bind(ano)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao calcular por categoria: {}", e);
        format!("Erro ao calcular por categoria: {}", e)
    })?;

    let total_geral = total_fixo + total_variavel;

    info!(
        "Resumo mensal {}/{}: fixo={:.2}, variavel={:.2}, geral={:.2}, categorias={}",
        mes,
        ano,
        total_fixo,
        total_variavel,
        total_geral,
        por_categoria.len()
    );

    Ok(GastoResumoMensal {
        total_fixo,
        total_variavel,
        total_geral,
        por_categoria,
    })
}
