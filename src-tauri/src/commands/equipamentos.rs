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

use crate::commands::types::{
    normalize_forma_pagamento, AprovarOrcamentoInput, EquipamentoInput, EquipamentoRow,
    EQUIPAMENTO_SELECT,
};
use crate::commands::auth::{
    record_security_event, require_permission, SecurityProfileSummary, PERMISSION_DELETE_RECORDS,
    PERMISSION_FINANCIAL_ACTIONS,
};
use crate::db::get_pool;
use sqlx::{PgPool, Row};
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

fn is_regular_status_transition(from: &str, to: &str) -> bool {
    from == to
        || matches!(
            (from, to),
            ("RECEBIDO", "EM_VERIFICACAO")
                | ("EM_VERIFICACAO", "VERIFICADO")
                | ("VERIFICADO", "AGUARDANDO_APROVACAO")
                | ("AGUARDANDO_APROVACAO", "APROVADO" | "REPROVADO" | "ORCAMENTO_VENCIDO")
                | ("APROVADO", "EM_MANUTENCAO")
                | ("EM_MANUTENCAO", "AGUARDANDO_PECA" | "PRONTO")
                | ("AGUARDANDO_PECA", "EM_MANUTENCAO")
                | ("PRONTO", "ENTREGUE")
                | ("REPROVADO", "ENTREGUE" | "ABANDONADO")
                | ("ORCAMENTO_VENCIDO", "ABANDONADO" | "AGUARDANDO_APROVACAO")
        )
}

fn is_status_correction(from: &str, to: &str) -> bool {
    matches!(
        (from, to),
        ("EM_VERIFICACAO", "RECEBIDO")
            | ("VERIFICADO", "EM_VERIFICACAO")
            | ("AGUARDANDO_APROVACAO", "VERIFICADO")
            | ("APROVADO", "AGUARDANDO_APROVACAO")
            | ("EM_MANUTENCAO", "APROVADO" | "AGUARDANDO_APROVACAO")
            | ("AGUARDANDO_PECA", "EM_MANUTENCAO" | "AGUARDANDO_APROVACAO")
            | ("PRONTO", "EM_MANUTENCAO" | "AGUARDANDO_PECA" | "AGUARDANDO_APROVACAO")
            | ("REPROVADO", "AGUARDANDO_APROVACAO")
            | ("ORCAMENTO_VENCIDO", "AGUARDANDO_APROVACAO")
    )
}

fn required_concurrency_token(token: Option<&str>, entity_label: &str) -> Result<String, String> {
    token
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .ok_or_else(|| format!("Token de concorrência de {} é obrigatório para atualizar o registro.", entity_label))
}

fn concurrency_conflict_message(entity_label: &str) -> String {
    format!(
        "Conflito de concorrência: {} foi alterado por outro técnico. Recarregue os dados antes de tentar novamente.",
        entity_label
    )
}

fn reject_direct_approval(status: &str) -> Result<(), String> {
    if normalize_status_key(status) == "APROVADO" {
        return Err("A aprovação deve usar a operação aprovar_orcamento com pagamento válido.".to_string());
    }
    Ok(())
}

async fn resolve_responsavel_snapshot(
    pool: &PgPool,
    input: &EquipamentoInput,
) -> Result<(Option<i32>, Option<String>, Option<String>, Option<String>), String> {
    let Some(contact_id) = input.responsavel_contato_id else {
        return Ok((
            None,
            optional_text(input.responsavel_nome.as_deref()),
            optional_text(input.responsavel_email.as_deref()),
            optional_text(input.responsavel_telefone.as_deref()),
        ));
    };

    let empresa_id = input
        .empresa_id
        .ok_or_else(|| "empresa_id é obrigatório ao associar um contato responsável.".to_string())?;
    let cliente_id = input
        .cliente_id
        .ok_or_else(|| "cliente_id é obrigatório ao associar um contato responsável.".to_string())?;

    let snapshot: Option<(String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT nome, email, telefone
         FROM cliente_contatos
         WHERE id = $1 AND empresa_id = $2 AND cliente_id = $3 AND ativo = true",
    )
    .bind(contact_id)
    .bind(empresa_id)
    .bind(cliente_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("Erro ao validar contato responsável: {}", error))?;

    let Some((nome, email, telefone)) = snapshot else {
        return Err("Contato responsável não encontrado, inativo ou incompatível com o cliente/empresa.".to_string());
    };

    Ok((Some(contact_id), Some(nome), email, telefone))
}

    fn equipment_has_sensitive_financial_input(input: &EquipamentoInput) -> bool {
        input.preco_compra.is_some()
            || input.preco_venda.is_some()
            || input.valor_orcamento.is_some()
            || optional_text(input.prazo_aprovacao.as_deref()).is_some()
    }

    fn equipment_financial_audit_details(action: &str, equipamento_id: Option<i32>, input: &EquipamentoInput) -> String {
        format!(
            "action={}; equipamento_id={}; preco_compra={}; preco_venda={}; valor_orcamento={}; prazo_aprovacao={}",
            action,
            equipamento_id
                .map(|value| value.to_string())
                .unwrap_or_else(|| "novo".to_string()),
            input.preco_compra.is_some(),
            input.preco_venda.is_some(),
            input.valor_orcamento.is_some(),
            optional_text(input.prazo_aprovacao.as_deref()).is_some(),
        )
    }

    async fn require_financial_actor_for_equipment_write(
        equipment_id: Option<i32>,
        input: &EquipamentoInput,
    ) -> Result<Option<SecurityProfileSummary>, String> {
        let normalized_status = normalize_status_key(&input.status);
        let prazo_aprovacao = optional_text(input.prazo_aprovacao.as_deref());

        let mut needs_financial = equipment_has_sensitive_financial_input(input)
            || status_change_requires_sensitive_access(
                &normalized_status,
                input.valor_orcamento,
                prazo_aprovacao.as_deref(),
                None,
            );

        if !needs_financial {
            if let Some(id) = equipment_id {
                let pool = get_pool().await.map_err(|e| e.to_string())?;
                let current_status: Option<String> = sqlx::query_scalar(
                    "SELECT status FROM equipamentos WHERE id = $1",
                )
                .bind(id)
                .fetch_optional(&pool)
                .await
                .map_err(|e| {
                    error!("Erro ao consultar status atual do equipamento {}: {}", id, e);
                    e.to_string()
                })?;

                if let Some(current_status) = current_status {
                    let current_normalized = normalize_status_key(&current_status);
                    if current_normalized != normalized_status
                        && status_change_requires_sensitive_access(&normalized_status, None, None, None)
                    {
                        needs_financial = true;
                    }
                }
            }
        }

        if needs_financial {
            return Ok(Some(require_permission(PERMISSION_FINANCIAL_ACTIONS)?));
        }

        Ok(None)
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

    query_builder.push(" ORDER BY id DESC LIMIT ");
    query_builder.push_bind(PAGE_SIZE);
    query_builder.push(" OFFSET ");
    query_builder.push_bind(offset);

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
    let row = sqlx::query_as::<_, EquipamentoRow>(sqlx::AssertSqlSafe(&*query))
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

/// Buscar equipamentos por número de série (case-insensitive).
/// Retorna múltiplos registros para o mesmo serial (ciclos de manutenção).
#[tauri::command]
#[instrument(skip_all, fields(serial = %serial))]
pub async fn buscar_equipamentos_por_serial(serial: String) -> Result<Vec<EquipamentoRow>, String> {
    debug!("Buscando equipamentos por serial: {}", serial);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let query = format!("{} WHERE LOWER(serial_number) = LOWER($1) ORDER BY id DESC", EQUIPAMENTO_SELECT);
    let rows = sqlx::query_as::<_, EquipamentoRow>(sqlx::AssertSqlSafe(&*query))
        .bind(serial.trim())
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao buscar equipamentos por serial: {}", e);
            format!("Erro ao buscar equipamentos: {}", e)
        })?;
    info!("Equipamentos encontrados para serial {}: {}", serial, rows.len());
    Ok(rows)
}

/// Criar novo equipamento.
#[tauri::command]
#[instrument(skip_all, fields(serial = %input.serial_number))]
pub async fn criar_equipamento(input: EquipamentoInput) -> Result<EquipamentoRow, String> {
    debug!("Criando equipamento: {}", input.serial_number);
    let financial_actor = require_financial_actor_for_equipment_write(None, &input).await?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let serial_number = required_text(&input.serial_number, "Número de série")?;
    let defeito_relatado = required_text(input.defeito_relatado.as_deref().unwrap_or(""), "Defeito")?;
    let marca = required_text(&input.marca, "Marca")?;
    let modelo = required_text(&input.modelo, "Modelo")?;
    let tipo = required_text(&input.tipo, "Tipo")?;
    let status = required_text(&normalize_status_key(&input.status), "Status")?;
    reject_direct_approval(&status)?;
    let data_entrada = required_text(&input.data_entrada, "Data de entrada")?;

    validate_non_negative_i32(input.paginas_impressas, "Páginas impressas")?;
    validate_non_negative_f64(input.preco_compra, "Preço de compra")?;
    validate_non_negative_f64(input.preco_venda, "Preço de venda")?;
    validate_non_negative_f64(input.valor_orcamento, "Valor do orçamento")?;
    let responsavel = resolve_responsavel_snapshot(&pool, &input).await?;

    let row = sqlx::query(
        r#"
        INSERT INTO equipamentos (
            serial_number, patrimonio, marca, modelo, tipo, status,
            defeito_relatado, acessorios, acessorios_outros,
            paginas_impressas, tecnologia, conectividade, data_entrada, proprietario,
            preco_compra, preco_venda, observacoes, cliente_id, cliente_nome,
            cliente_telefone, cliente_email, prazo_aprovacao, valor_orcamento,
            empresa_id, responsavel_contato_id, responsavel_nome, responsavel_email,
            responsavel_telefone
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19,
            $20, $21, $22, $23, $24, $25, $26, $27, $28
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
    .bind(input.empresa_id)
    .bind(responsavel.0)
    .bind(responsavel.1)
    .bind(responsavel.2)
    .bind(responsavel.3)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao criar equipamento: {}", e);
        e.to_string()
    })?;

    let id: i32 = row.get("id");
    if let Some(actor) = financial_actor.as_ref() {
        record_security_event(
            "EQUIPMENT_FINANCIAL_CREATED",
            Some(actor),
            equipment_financial_audit_details("create", Some(id), &input),
            true,
        )
        .await;
    }
    info!("Equipamento criado: id={}", id);
    buscar_equipamento(id).await
}

/// Atualizar equipamento por ID.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn atualizar_equipamento(id: i32, input: EquipamentoInput) -> Result<EquipamentoRow, String> {
    debug!("Atualizando equipamento {}", id);
    let financial_actor = require_financial_actor_for_equipment_write(Some(id), &input).await?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let concurrency_token = required_concurrency_token(input.atualizado_em.as_deref(), "equipamento")?;
    let serial_number = required_text(&input.serial_number, "Número de série")?;
    let defeito_relatado = required_text(input.defeito_relatado.as_deref().unwrap_or(""), "Defeito")?;
    let marca = required_text(&input.marca, "Marca")?;
    let modelo = required_text(&input.modelo, "Modelo")?;
    let tipo = required_text(&input.tipo, "Tipo")?;
    let status = required_text(&normalize_status_key(&input.status), "Status")?;
    reject_direct_approval(&status)?;
    let data_entrada = required_text(&input.data_entrada, "Data de entrada")?;

    validate_non_negative_i32(input.paginas_impressas, "Páginas impressas")?;
    validate_non_negative_f64(input.preco_compra, "Preço de compra")?;
    validate_non_negative_f64(input.preco_venda, "Preço de venda")?;
    validate_non_negative_f64(input.valor_orcamento, "Valor do orçamento")?;
    let responsavel = resolve_responsavel_snapshot(&pool, &input).await?;

    let updated_rows = sqlx::query(
        r#"
        UPDATE equipamentos SET
            serial_number = $1, patrimonio = $2, marca = $3, modelo = $4, tipo = $5, status = $6,
            defeito_relatado = $7, acessorios = $8, acessorios_outros = $9,
            paginas_impressas = $10, tecnologia = $11, conectividade = $12, data_entrada = $13,
            proprietario = $14, preco_compra = $15, preco_venda = $16, observacoes = $17,
            cliente_id = $18, cliente_nome = $19, cliente_telefone = $20, cliente_email = $21,
            prazo_aprovacao = $22, valor_orcamento = $23,
            responsavel_contato_id = $24, responsavel_nome = $25,
            responsavel_email = $26, responsavel_telefone = $27,
            atualizado_em = NOW()
        WHERE id = $28 AND atualizado_em = $29::TIMESTAMPTZ
          AND ($30::INTEGER IS NULL OR empresa_id = $30)
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
    .bind(responsavel.0)
    .bind(responsavel.1)
    .bind(responsavel.2)
    .bind(responsavel.3)
    .bind(id)
    .bind(concurrency_token)
    .bind(input.empresa_id)
    .execute(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao atualizar equipamento {}: {}", id, e);
        e.to_string()
    })?
    .rows_affected();

    if updated_rows == 0 {
        return Err(concurrency_conflict_message("o equipamento"));
    }

    if let Some(actor) = financial_actor.as_ref() {
        record_security_event(
            "EQUIPMENT_FINANCIAL_UPDATED",
            Some(actor),
            equipment_financial_audit_details("update", Some(id), &input),
            true,
        )
        .await;
    }

    info!("Equipamento {} atualizado", id);
    buscar_equipamento(id).await
}

/// Deletar equipamento por ID.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn deletar_equipamento(id: i32) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_DELETE_RECORDS)?;
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
    record_security_event(
        "EQUIPMENT_DELETED",
        Some(&actor),
        format!("equipamento_id={}; deleted={}", id, deleted),
        deleted,
    )
    .await;
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
    expected_updated_em: Option<String>,
    motivo_correcao: Option<String>,
) -> Result<EquipamentoRow, String> {
    validate_non_negative_f64(valor_orcamento, "Valor do orçamento")?;
    validate_non_negative_f64(valor_final, "Valor final")?;
    let concurrency_token = required_concurrency_token(expected_updated_em.as_deref(), "equipamento")?;
    let normalized_status = normalize_status_key(&novo_status);
    reject_direct_approval(&normalized_status)?;
    let prazo_aprovacao_value = prazo_aprovacao
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());
    let motivo_correcao_value = optional_text(motivo_correcao.as_deref());
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let current_status: Option<String> = sqlx::query_scalar("SELECT status FROM equipamentos WHERE id = $1")
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let current_status = current_status.ok_or_else(|| "Equipamento não encontrado.".to_string())?;
    let normalized_current_status = normalize_status_key(&current_status);
    let is_correction = is_status_correction(&normalized_current_status, &normalized_status);
    if !is_regular_status_transition(&normalized_current_status, &normalized_status) && !is_correction {
        return Err("Transição de status inválida para este equipamento.".to_string());
    }
    if is_correction && motivo_correcao_value.is_none() {
        return Err("Informe o motivo da correção de status.".to_string());
    }
    let financial_actor = if is_correction || status_change_requires_sensitive_access(
        &normalized_status,
        valor_orcamento,
        prazo_aprovacao_value.as_deref(),
        valor_final,
    ) {
        Some(require_permission(PERMISSION_FINANCIAL_ACTIONS)?)
    } else {
        None
    };

    debug!("Atualizando status do equipamento {} para {}", id, normalized_status);
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
            "UPDATE equipamentos SET status = $1, {} = NOW(), valor_orcamento = COALESCE($2, valor_orcamento), prazo_aprovacao = COALESCE($3, prazo_aprovacao), valor_final = COALESCE($4, valor_final), atualizado_em = NOW() WHERE id = $5 AND atualizado_em = $6::TIMESTAMPTZ",
            date_field
        )
    } else {
        "UPDATE equipamentos SET status = $1, valor_orcamento = COALESCE($2, valor_orcamento), prazo_aprovacao = COALESCE($3, prazo_aprovacao), valor_final = COALESCE($4, valor_final), atualizado_em = NOW() WHERE id = $5 AND atualizado_em = $6::TIMESTAMPTZ".to_string()
    };

    let updated_rows = sqlx::query(sqlx::AssertSqlSafe(&*query))
        .bind(&normalized_status)
        .bind(valor_orcamento)
        .bind(prazo_aprovacao_value.clone())
        .bind(valor_final)
        .bind(id)
        .bind(concurrency_token)
        .execute(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao atualizar status do equipamento {}: {}", id, e);
            e.to_string()
        })?
        .rows_affected();

    if updated_rows == 0 {
        return Err(concurrency_conflict_message("o equipamento"));
    }

    if let Some(actor) = financial_actor.as_ref() {
        record_security_event(
            if is_correction { "EQUIPMENT_STATUS_CORRECTED" } else { "EQUIPMENT_STATUS_UPDATED" },
            Some(actor),
            format!(
                "equipamento_id={}; status_anterior={}; status={}; correcao={}; motivo={}; valor_orcamento={}; prazo_aprovacao={}; valor_final={}",
                id,
                normalized_current_status,
                normalized_status,
                is_correction,
                motivo_correcao_value.as_deref().unwrap_or(""),
                valor_orcamento.is_some(),
                prazo_aprovacao_value.is_some(),
                valor_final.is_some(),
            ),
            true,
        )
        .await;
    }

    info!("Status do equipamento {} atualizado para {}", id, normalized_status);
    buscar_equipamento(id).await
}

/// Aprova um orçamento atualizando pagamento, status e data de aprovação na
/// mesma transação. A verificação e o equipamento são sempre conferidos no
/// mesmo tenant; falhas de concorrência deixam ambos inalterados.
#[tauri::command]
#[instrument(skip_all, fields(empresa_id = input.empresa_id, equipamento_id = input.equipamento_id))]
pub async fn aprovar_orcamento(input: AprovarOrcamentoInput) -> Result<EquipamentoRow, String> {
    if input.empresa_id <= 0 {
        return Err("Empresa inválida".to_string());
    }
    if input.equipamento_id <= 0 {
        return Err("Equipamento inválido".to_string());
    }
    let concurrency_token = required_concurrency_token(
        Some(input.expected_updated_em.as_str()),
        "equipamento",
    )?;
    let (payment_code, payment_detail) = normalize_forma_pagamento(
        Some(&input.pagamento.codigo),
        input.pagamento.detalhe.as_deref(),
    )?;
    let actor = require_permission(PERMISSION_FINANCIAL_ACTIONS)?;
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    let mut tx = pool.begin().await.map_err(|error| {
        error!("Erro ao iniciar transação de aprovação do equipamento {}: {}", input.equipamento_id, error);
        error.to_string()
    })?;

    let equipment: Option<(String, String)> = sqlx::query_as(
        "SELECT COALESCE(status, ''), atualizado_em::TEXT
         FROM equipamentos
         WHERE id = $1 AND empresa_id = $2
         FOR UPDATE",
    )
    .bind(input.equipamento_id)
    .bind(input.empresa_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| format!("Erro ao validar equipamento para aprovação: {}", error))?;

    let Some((current_status, _current_updated_em)) = equipment else {
        return Err("Equipamento não encontrado na empresa informada.".to_string());
    };
    if normalize_status_key(&current_status) != "AGUARDANDO_APROVACAO" {
        return Err("Somente orçamentos aguardando aprovação podem ser aprovados.".to_string());
    }

    let verification_id: Option<i32> = sqlx::query_scalar(
        "SELECT id
         FROM verificacoes
         WHERE equipamento_id = $1 AND empresa_id = $2
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE",
    )
    .bind(input.equipamento_id)
    .bind(input.empresa_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| format!("Erro ao validar verificação para aprovação: {}", error))?;

    let Some(verification_id) = verification_id else {
        return Err("Não é possível aprovar sem uma verificação técnica.".to_string());
    };

    sqlx::query(
        "UPDATE verificacoes
         SET forma_pagamento_codigo = $1, forma_pagamento_detalhe = $2
         WHERE id = $3 AND equipamento_id = $4 AND empresa_id = $5",
    )
    .bind(payment_code.as_deref())
    .bind(payment_detail.as_deref())
    .bind(verification_id)
    .bind(input.equipamento_id)
    .bind(input.empresa_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| format!("Erro ao salvar pagamento do orçamento: {}", error))?;

    let updated_rows = sqlx::query(
        "UPDATE equipamentos
         SET status = 'APROVADO', data_aprovacao = NOW(), atualizado_em = NOW()
         WHERE id = $1 AND empresa_id = $2 AND atualizado_em = $3::TIMESTAMPTZ",
    )
    .bind(input.equipamento_id)
    .bind(input.empresa_id)
    .bind(&concurrency_token)
    .execute(&mut *tx)
    .await
    .map_err(|error| format!("Erro ao aprovar orçamento: {}", error))?
    .rows_affected();

    if updated_rows == 0 {
        return Err(concurrency_conflict_message("o orçamento"));
    }

    tx.commit().await.map_err(|error| {
        error!("Erro ao confirmar aprovação do equipamento {}: {}", input.equipamento_id, error);
        error.to_string()
    })?;

    record_security_event(
        "BUDGET_APPROVED",
        Some(&actor),
        format!(
            "empresa_id={}; equipamento_id={}; verificacao_id={}; pagamento_codigo={}",
            input.empresa_id,
            input.equipamento_id,
            verification_id,
            payment_code.as_deref().unwrap_or(""),
        ),
        true,
    )
    .await;

    let query = format!("{} WHERE id = $1 AND empresa_id = $2", EQUIPAMENTO_SELECT);
    sqlx::query_as::<_, EquipamentoRow>(sqlx::AssertSqlSafe(query))
        .bind(input.equipamento_id)
        .bind(input.empresa_id)
        .fetch_one(&pool)
        .await
        .map_err(|error| format!("Erro ao carregar equipamento aprovado: {}", error))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn p0_sensitive_status_gate_flags_status_only_changes_on_update() {
        assert!(status_change_requires_sensitive_access("ENTREGUE", None, None, None));
        assert!(!status_change_requires_sensitive_access("EM_VERIFICACAO", None, None, None));
    }

    #[test]
    fn status_correction_is_limited_to_the_rework_paths() {
        assert!(is_status_correction("PRONTO", "AGUARDANDO_APROVACAO"));
        assert!(is_regular_status_transition("PRONTO", "ENTREGUE"));
        assert!(!is_status_correction("ENTREGUE", "PRONTO"));
    }

    #[test]
    fn p0_sensitive_equipment_write_detects_financial_payload() {
        let mut input = EquipamentoInput::default();
        assert!(!equipment_has_sensitive_financial_input(&input));

        input.preco_compra = Some(10.0);
        assert!(equipment_has_sensitive_financial_input(&input));

        input.preco_compra = None;
        input.prazo_aprovacao = Some("2026-04-16".to_string());
        assert!(equipment_has_sensitive_financial_input(&input));
    }

    #[test]
    fn p0_sensitive_status_gate_flags_financial_status_or_values() {
        assert!(status_change_requires_sensitive_access("APROVADO", None, None, None));
        assert!(status_change_requires_sensitive_access(
            "RECEBIDO",
            Some(99.0),
            None,
            None,
        ));
        assert!(!status_change_requires_sensitive_access("RECEBIDO", None, None, None));
    }

    #[test]
    fn p1_equipment_status_normalization_supports_legacy_labels() {
        assert_eq!(normalize_status_key("Recebido"), "RECEBIDO");
        assert_eq!(normalize_status_key("Em Verificação"), "EM_VERIFICACAO");
        assert_eq!(normalize_status_key("Orçamento Vencido"), "ORCAMENTO_VENCIDO");
    }

    #[test]
    fn p1_equipment_financial_validation_rejects_negative_values() {
        assert!(validate_non_negative_f64(Some(-1.0), "Valor do orçamento")
            .unwrap_err()
            .contains("negativo"));
        assert!(validate_non_negative_i32(Some(-1), "Páginas impressas")
            .unwrap_err()
            .contains("negativo"));
        assert!(validate_non_negative_f64(Some(0.0), "Valor do orçamento").is_ok());
    }

    #[test]
    fn direct_approval_is_rejected_without_payment_transaction() {
        assert!(reject_direct_approval("APROVADO").is_err());
        assert!(reject_direct_approval("AGUARDANDO_APROVACAO").is_ok());
    }
}
