//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/equipamentos.rs — CRUD de Equipamentos             ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  - listar_equipamentos: Lista com paginação                  ║
//! ║  - buscar_equipamento: Busca por ID                          ║
//! ║  - criar_equipamento: INSERT novo equipamento                ║
//! ║  - atualizar_equipamento: UPDATE por ID                      ║
//! ║  - deletar_equipamento: DELETE por ID                        ║
//! ║  - atualizar_status_equipamento: Atualiza status + datas     ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::types::{EquipamentoInput, EquipamentoRow, EQUIPAMENTO_SELECT};
use crate::commands::auth::{
    require_permission, PERMISSION_DELETE_RECORDS, PERMISSION_FINANCIAL_ACTIONS,
};
use crate::db::get_pool;
use sqlx::Row;
use tracing::{debug, error, info, instrument};

/// Limite padrão de itens por página.
pub const PAGE_SIZE: i32 = 50;

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

fn validate_non_negative_i32(value: Option<i32>, field: &str) -> Result<(), String> {
    if let Some(value) = value {
        if value < 0 {
            return Err(format!("{} não pode ser negativo", field));
        }
    }

    Ok(())
}

fn validate_non_negative_f64(value: Option<f64>, field: &str) -> Result<(), String> {
    if let Some(value) = value {
        if value < 0.0 {
            return Err(format!("{} não pode ser negativo", field));
        }
    }

    Ok(())
}

fn normalize_status_key(status: &str) -> String {
    match status.trim() {
        "Recebido" | "RECEBIDO" => "RECEBIDO",
        "Em Verificação" | "EM_VERIFICACAO" => "EM_VERIFICACAO",
        "Verificado" | "VERIFICADO" => "VERIFICADO",
        "Aguardando Aprovação" | "AGUARDANDO_APROVACAO" => "AGUARDANDO_APROVACAO",
        "Aprovado" | "APROVADO" => "APROVADO",
        "Reprovado" | "REPROVADO" => "REPROVADO",
        "Em Manutenção" | "EM_MANUTENCAO" => "EM_MANUTENCAO",
        "Aguardando Peça" | "AGUARDANDO_PECA" => "AGUARDANDO_PECA",
        "Pronto" | "PRONTO" => "PRONTO",
        "Entregue" | "ENTREGUE" => "ENTREGUE",
        "Orçamento Vencido" | "ORCAMENTO_VENCIDO" => "ORCAMENTO_VENCIDO",
        "Abandonado" | "ABANDONADO" => "ABANDONADO",
        other => other,
    }
    .to_string()
}

fn status_change_requires_sensitive_access(
    normalized_status: &str,
    valor_orcamento: Option<f64>,
    prazo_aprovacao: Option<&str>,
    valor_final: Option<f64>,
) -> bool {
    valor_orcamento.is_some()
        || prazo_aprovacao.is_some()
        || valor_final.is_some()
        || matches!(
            normalized_status,
            "AGUARDANDO_APROVACAO" | "APROVADO" | "REPROVADO" | "ORCAMENTO_VENCIDO" | "ENTREGUE" | "ABANDONADO"
        )
}

/// Listar equipamentos com paginação.
/// - `page`: Página atual (começa em 0)
/// - Retorna até PAGE_SIZE itens por página
#[tauri::command]
#[instrument(skip_all, fields(page = page))]
pub async fn listar_equipamentos(
    page: Option<i32>,
    busca: Option<String>,
    status: Option<String>,
) -> Result<Vec<EquipamentoRow>, String> {
    debug!("Listando equipamentos");
    let pool = get_pool().await.map_err(|e| {
        error!("Erro ao obter pool: {}", e);
        e.to_string()
    })?;

    let offset = page.unwrap_or(0) * PAGE_SIZE;
    let mut query_builder = sqlx::QueryBuilder::<sqlx::Postgres>::new(EQUIPAMENTO_SELECT);
    query_builder.push(" WHERE 1=1");

    if let Some(busca) = busca.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        let pattern = format!("%{}%", busca);
        query_builder.push(" AND (");
        query_builder.push("serial_number ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR COALESCE(patrimonio, '') ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR marca ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR modelo ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR COALESCE(defeito_relatado, '') ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR COALESCE(cliente_nome, '') ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR COALESCE(cliente_email, '') ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR COALESCE(cliente_telefone, '') ILIKE ");
        query_builder.push_bind(pattern);
        query_builder.push(")");
    }

    if let Some(status) = status.as_deref().map(str::trim).filter(|value| !value.is_empty() && *value != "TODOS") {
        query_builder.push(" AND status = ");
        query_builder.push_bind(normalize_status_key(status));
    }

    query_builder.push(format!(" ORDER BY id DESC LIMIT {} OFFSET {}", PAGE_SIZE, offset));

    let rows = query_builder
        .build_query_as::<EquipamentoRow>()
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao listar equipamentos: {}", e);
            e.to_string()
        })?;

    info!("Equipamentos listados: {} itens (página {})", rows.len(), page.unwrap_or(0));
    Ok(rows)
}

/// Buscar equipamento por ID.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn buscar_equipamento(id: i32) -> Result<EquipamentoRow, String> {
    debug!("Buscando equipamento {}", id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let query = format!("{} WHERE id = $1", EQUIPAMENTO_SELECT);
    let row = sqlx::query_as::<_, EquipamentoRow>(&query)
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            error!("Equipamento {} não encontrado: {}", id, e);
            e.to_string()
        })?;

    info!("Equipamento {} encontrado", id);
    Ok(row)
}

/// Criar novo equipamento.
#[tauri::command]
#[instrument(skip_all, fields(serial = %input.serial_number))]
pub async fn criar_equipamento(input: EquipamentoInput) -> Result<EquipamentoRow, String> {
    debug!("Criando equipamento: {}", input.serial_number);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let serial_number = required_text(&input.serial_number, "Número de série")?;
    let defeito_relatado = required_text(input.defeito_relatado.as_deref().unwrap_or(""), "Defeito")?;
    let marca = required_text(&input.marca, "Marca")?;
    let modelo = required_text(&input.modelo, "Modelo")?;
    let tipo = required_text(&input.tipo, "Tipo")?;
    let status = required_text(&normalize_status_key(&input.status), "Status")?;
    let data_entrada = required_text(&input.data_entrada, "Data de entrada")?;

    validate_non_negative_i32(input.paginas_impressas, "Páginas impressas")?;
    validate_non_negative_f64(input.preco_compra, "Preço de compra")?;
    validate_non_negative_f64(input.preco_venda, "Preço de venda")?;
    validate_non_negative_f64(input.valor_orcamento, "Valor do orçamento")?;

    let row = sqlx::query(
        r#"
        INSERT INTO equipamentos (
            serial_number, patrimonio, marca, modelo, tipo, status,
            defeito_relatado, acessorios, acessorios_outros,
            paginas_impressas, tecnologia, conectividade, data_entrada, proprietario,
            preco_compra, preco_venda, observacoes, cliente_id, cliente_nome,
            cliente_telefone, cliente_email, prazo_aprovacao, valor_orcamento
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19,
            $20, $21, $22, $23
        ) RETURNING id
        "#,
    )
    .bind(serial_number)
    .bind(optional_text(input.patrimonio.as_deref()))
    .bind(marca)
    .bind(modelo)
    .bind(tipo)
    .bind(status)
    .bind(defeito_relatado)
    .bind(optional_text(input.acessorios.as_deref()))
    .bind(optional_text(input.acessorios_outros.as_deref()))
    .bind(input.paginas_impressas)
    .bind(optional_text(input.tecnologia.as_deref()))
    .bind(optional_text(input.conectividade.as_deref()))
    .bind(data_entrada)
    .bind(optional_text(input.proprietario.as_deref()))
    .bind(input.preco_compra)
    .bind(input.preco_venda)
    .bind(optional_text(input.observacoes.as_deref()))
    .bind(input.cliente_id)
    .bind(optional_text(input.cliente_nome.as_deref()))
    .bind(optional_text(input.cliente_telefone.as_deref()))
    .bind(optional_text(input.cliente_email.as_deref()))
    .bind(optional_text(input.prazo_aprovacao.as_deref()))
    .bind(input.valor_orcamento)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao criar equipamento: {}", e);
        e.to_string()
    })?;

    let id: i32 = row.get("id");
    info!("Equipamento criado: id={}", id);
    buscar_equipamento(id).await
}

/// Atualizar equipamento por ID.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn atualizar_equipamento(id: i32, input: EquipamentoInput) -> Result<EquipamentoRow, String> {
    debug!("Atualizando equipamento {}", id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let serial_number = required_text(&input.serial_number, "Número de série")?;
    let defeito_relatado = required_text(input.defeito_relatado.as_deref().unwrap_or(""), "Defeito")?;
    let marca = required_text(&input.marca, "Marca")?;
    let modelo = required_text(&input.modelo, "Modelo")?;
    let tipo = required_text(&input.tipo, "Tipo")?;
    let status = required_text(&normalize_status_key(&input.status), "Status")?;
    let data_entrada = required_text(&input.data_entrada, "Data de entrada")?;

    validate_non_negative_i32(input.paginas_impressas, "Páginas impressas")?;
    validate_non_negative_f64(input.preco_compra, "Preço de compra")?;
    validate_non_negative_f64(input.preco_venda, "Preço de venda")?;
    validate_non_negative_f64(input.valor_orcamento, "Valor do orçamento")?;

    sqlx::query(
        r#"
        UPDATE equipamentos SET
            serial_number = $1, patrimonio = $2, marca = $3, modelo = $4, tipo = $5, status = $6,
            defeito_relatado = $7, acessorios = $8, acessorios_outros = $9,
            paginas_impressas = $10, tecnologia = $11, conectividade = $12, data_entrada = $13,
            proprietario = $14, preco_compra = $15, preco_venda = $16, observacoes = $17,
            cliente_id = $18, cliente_nome = $19, cliente_telefone = $20, cliente_email = $21,
            prazo_aprovacao = $22, valor_orcamento = $23, atualizado_em = NOW()
        WHERE id = $24
        "#,
    )
    .bind(serial_number)
    .bind(optional_text(input.patrimonio.as_deref()))
    .bind(marca)
    .bind(modelo)
    .bind(tipo)
    .bind(status)
    .bind(defeito_relatado)
    .bind(optional_text(input.acessorios.as_deref()))
    .bind(optional_text(input.acessorios_outros.as_deref()))
    .bind(input.paginas_impressas)
    .bind(optional_text(input.tecnologia.as_deref()))
    .bind(optional_text(input.conectividade.as_deref()))
    .bind(data_entrada)
    .bind(optional_text(input.proprietario.as_deref()))
    .bind(input.preco_compra)
    .bind(input.preco_venda)
    .bind(optional_text(input.observacoes.as_deref()))
    .bind(input.cliente_id)
    .bind(optional_text(input.cliente_nome.as_deref()))
    .bind(optional_text(input.cliente_telefone.as_deref()))
    .bind(optional_text(input.cliente_email.as_deref()))
    .bind(optional_text(input.prazo_aprovacao.as_deref()))
    .bind(input.valor_orcamento)
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao atualizar equipamento {}: {}", id, e);
        e.to_string()
    })?;

    info!("Equipamento {} atualizado", id);
    buscar_equipamento(id).await
}

/// Deletar equipamento por ID.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn deletar_equipamento(id: i32) -> Result<bool, String> {
    require_permission(PERMISSION_DELETE_RECORDS)?;
    debug!("Deletando equipamento {}", id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let result = sqlx::query("DELETE FROM equipamentos WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao deletar equipamento {}: {}", id, e);
            e.to_string()
        })?;

    let deleted = result.rows_affected() > 0;
    if deleted {
        info!("Equipamento {} deletado", id);
    } else {
        error!("Equipamento {} não encontrado para deleção", id);
    }
    Ok(deleted)
}

/// Atualizar status de equipamento (com atualização automática de datas).
/// Cada transição de status atualiza a data correspondente.
#[tauri::command]
#[instrument(skip_all, fields(id = id, status = %novo_status))]
pub async fn atualizar_status_equipamento(
    id: i32,
    novo_status: String,
    valor_orcamento: Option<f64>,
    prazo_aprovacao: Option<String>,
    valor_final: Option<f64>,
) -> Result<EquipamentoRow, String> {
    let normalized_status = normalize_status_key(&novo_status);
    if status_change_requires_sensitive_access(
        &normalized_status,
        valor_orcamento,
        prazo_aprovacao.as_deref().filter(|value| !value.trim().is_empty()),
        valor_final,
    ) {
        require_permission(PERMISSION_FINANCIAL_ACTIONS)?;
    }

    debug!("Atualizando status do equipamento {} para {}", id, normalized_status);
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    // Determinar qual campo de data atualizar baseado no novo status
    let date_field = match normalized_status.as_str() {
        "APROVADO" => "data_aprovacao",
        "REPROVADO" => "data_reprovacao",
        "EM_VERIFICACAO" | "EM_MANUTENCAO" => "data_verificacao",
        "PRONTO" => "data_pronto",
        "ENTREGUE" => "data_saida",
        _ => "",
    };

    let query = if !date_field.is_empty() {
        format!(
            "UPDATE equipamentos SET status = $1, {} = NOW(), valor_orcamento = COALESCE($2, valor_orcamento), prazo_aprovacao = COALESCE($3, prazo_aprovacao), valor_final = COALESCE($4, valor_final), atualizado_em = NOW() WHERE id = $5",
            date_field
        )
    } else {
        "UPDATE equipamentos SET status = $1, valor_orcamento = COALESCE($2, valor_orcamento), prazo_aprovacao = COALESCE($3, prazo_aprovacao), valor_final = COALESCE($4, valor_final), atualizado_em = NOW() WHERE id = $5".to_string()
    };

    sqlx::query(&query)
        .bind(&normalized_status)
        .bind(valor_orcamento)
        .bind(prazo_aprovacao.and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        }))
        .bind(valor_final)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao atualizar status do equipamento {}: {}", id, e);
            e.to_string()
        })?;

    info!("Status do equipamento {} atualizado para {}", id, normalized_status);
    buscar_equipamento(id).await
}
