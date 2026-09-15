//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/verificacoes.rs — Verificações Técnicas            ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  - salvar_verificacao_tecnica: Upsert de verificação         ║
//! ║  - buscar_verificacao_tecnica: Busca por equipamento_id      ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::types::{
    normalize_forma_pagamento, FormaPagamentoCodigo, VerificacaoInput, VerificacaoRow,
    VERIFICACAO_SELECT,
};
use crate::commands::auth::{
    record_security_event, require_permission, SecurityProfileSummary, PERMISSION_FINANCIAL_ACTIONS,
};
use crate::db::get_pool;
use tracing::{debug, error, info, instrument};

fn verification_has_sensitive_financial_input(input: &VerificacaoInput) -> bool {
    input.custo_estimado_mao_obra.is_some()
        || input.custo_estimado_pecas.is_some()
        || input.custo_total.is_some()
        || input.forma_pagamento_codigo.is_some()
        || input.forma_pagamento_detalhe.is_some()
}

fn verification_audit_details(action: &str, input: &VerificacaoInput) -> String {
    format!(
        "action={}; equipamento_id={}; custo_mao_obra={}; custo_pecas={}; custo_total={}; pagamento={}",
        action,
        input.equipamento_id,
        input.custo_estimado_mao_obra.is_some(),
        input.custo_estimado_pecas.is_some(),
        input.custo_total.is_some(),
        input.forma_pagamento_codigo.is_some(),
    )
}

fn require_financial_actor_for_verification_write(
    input: &VerificacaoInput,
) -> Result<Option<SecurityProfileSummary>, String> {
    if verification_has_sensitive_financial_input(input) {
        return Ok(Some(require_permission(PERMISSION_FINANCIAL_ACTIONS)?));
    }

    Ok(None)
}

/// Salvar verificação técnica (upsert: cria ou atualiza).
/// Se já existe verificação para o equipamento, atualiza; senão, cria nova.
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = input.equipamento_id))]
pub async fn salvar_verificacao_tecnica(input: VerificacaoInput) -> Result<VerificacaoRow, String> {
    debug!("Salvando verificação técnica para equipamento {}", input.equipamento_id);
    let (payment_code, payment_detail) = normalize_forma_pagamento(
        input.forma_pagamento_codigo.as_ref(),
        input.forma_pagamento_detalhe.as_deref(),
    )?;
    let financial_actor = require_financial_actor_for_verification_write(&input)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    // Verificar se já existe uma verificação para este equipamento
    let existing: Option<(i32,)> = sqlx::query_as(
        "SELECT id FROM verificacoes
         WHERE equipamento_id = $1 AND ($2::INTEGER IS NULL OR empresa_id = $2)"
    )
    .bind(input.equipamento_id)
    .bind(input.empresa_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao verificar existência de verificação: {}", e);
        e.to_string()
    })?;

    if let Some((id,)) = existing {
        // UPDATE existente
        debug!("Atualizando verificação existente id={}", id);
        sqlx::query(
            r#"
            UPDATE verificacoes SET
                tecnico_nome = $1, problema_relatado = $2, diagnostico = $3,
                itens_verificados = $4, servicos_necessarios = $5, pecas_necessarias = $6,
                custo_estimado_mao_obra = $7, custo_estimado_pecas = $8, custo_total = $9,
                tempo_estimado = $10, concluida = $11, observacoes = $12,
                forma_pagamento_codigo = $13, forma_pagamento_detalhe = $14,
                data_fim = CASE WHEN $11 = true THEN NOW() ELSE data_fim END
            WHERE id = $15 AND ($16::INTEGER IS NULL OR empresa_id = $16)
            "#,
        )
        .bind(&input.tecnico_nome)
        .bind(&input.problema_relatado)
        .bind(&input.diagnostico)
        .bind(&input.itens_verificados)
        .bind(&input.servicos_necessarios)
        .bind(&input.pecas_necessarias)
        .bind(input.custo_estimado_mao_obra)
        .bind(input.custo_estimado_pecas)
        .bind(input.custo_total)
        .bind(input.tempo_estimado)
        .bind(input.concluida.unwrap_or(false))
        .bind(&input.observacoes)
        .bind(payment_code.as_deref())
        .bind(payment_detail.as_deref())
        .bind(id)
        .bind(input.empresa_id)
        .execute(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao atualizar verificação {}: {}", id, e);
            e.to_string()
        })?;

        if let Some(actor) = financial_actor.as_ref() {
            record_security_event(
                "VERIFICATION_FINANCIAL_SAVED",
                Some(actor),
                verification_audit_details("update", &input),
                true,
            )
            .await;
        }

        info!("Verificação {} atualizada", id);
        return buscar_verificacao_tecnica(input.equipamento_id, input.empresa_id).await;
    }

    // INSERT nova verificação
    debug!("Criando nova verificação");
    sqlx::query(
        r#"
        INSERT INTO verificacoes (
            equipamento_id, empresa_id, tecnico_nome, problema_relatado, diagnostico,
            itens_verificados, servicos_necessarios, pecas_necessarias,
            custo_estimado_mao_obra, custo_estimado_pecas, custo_total,
            tempo_estimado, concluida, observacoes,
            forma_pagamento_codigo, forma_pagamento_detalhe
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )
        "#,
    )
    .bind(input.equipamento_id)
    .bind(input.empresa_id)
    .bind(&input.tecnico_nome)
    .bind(&input.problema_relatado)
    .bind(&input.diagnostico)
    .bind(&input.itens_verificados)
    .bind(&input.servicos_necessarios)
    .bind(&input.pecas_necessarias)
    .bind(input.custo_estimado_mao_obra)
    .bind(input.custo_estimado_pecas)
    .bind(input.custo_total)
    .bind(input.tempo_estimado)
    .bind(input.concluida.unwrap_or(false))
    .bind(&input.observacoes)
    .bind(payment_code.as_deref())
    .bind(payment_detail.as_deref())
    .execute(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao criar verificação: {}", e);
        e.to_string()
    })?;

    if let Some(actor) = financial_actor.as_ref() {
        record_security_event(
            "VERIFICATION_FINANCIAL_SAVED",
            Some(actor),
            verification_audit_details("create", &input),
            true,
        )
        .await;
    }

    info!("Verificação criada para equipamento {}", input.equipamento_id);
    buscar_verificacao_tecnica(input.equipamento_id, input.empresa_id).await
}

/// Buscar verificação técnica por equipamento_id.
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn buscar_verificacao_tecnica(
    equipamento_id: i32,
    empresa_id: Option<i32>,
) -> Result<VerificacaoRow, String> {
    debug!("Buscando verificação do equipamento {}", equipamento_id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let query = format!(
        "{} WHERE equipamento_id = $1 AND ($2::INTEGER IS NULL OR empresa_id = $2)",
        VERIFICACAO_SELECT
    );
    let row = sqlx::query_as::<_, VerificacaoRow>(sqlx::AssertSqlSafe(&*query))
        .bind(equipamento_id)
        .bind(empresa_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            error!("Verificação do equipamento {} não encontrada: {}", equipamento_id, e);
            e.to_string()
        })?;

    info!("Verificação do equipamento {} encontrada", equipamento_id);
    Ok(row)
}

fn count_json_array_items(json: &Option<String>) -> usize {
    match json {
        Some(text) if !text.trim().is_empty() => {
            serde_json::from_str::<Vec<serde_json::Value>>(text)
                .map(|arr| arr.len())
                .unwrap_or(0)
        }
        _ => 0,
    }
}

#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn atualizar_servicos_verificacao(
    equipamento_id: i32,
    servicos_json: Option<String>,
    pecas_json: Option<String>,
    custo_total: Option<f64>,
    profile_id: i32,
    divergence: bool,
    observacoes: Option<String>,
    forma_pagamento_codigo: Option<FormaPagamentoCodigo>,
    forma_pagamento_detalhe: Option<String>,
    empresa_id: Option<i32>,
) -> Result<VerificacaoRow, String> {
    let actor = require_permission(PERMISSION_FINANCIAL_ACTIONS)?;
    let (payment_code, payment_detail) = normalize_forma_pagamento(
        forma_pagamento_codigo.as_ref(),
        forma_pagamento_detalhe.as_deref(),
    )?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let mut tx = pool.begin().await.map_err(|error| {
        error!("Erro ao iniciar ajuste da verificação: {}", error);
        error.to_string()
    })?;

    let existing: Option<(i32, Option<String>, Option<String>, Option<f64>)> = sqlx::query_as(
        "SELECT id, servicos_necessarios, pecas_necessarias, custo_total
         FROM verificacoes
         WHERE equipamento_id = $1 AND ($2::INTEGER IS NULL OR empresa_id = $2)
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE"
    )
    .bind(equipamento_id)
    .bind(empresa_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| {
        error!("Erro ao buscar verificação existente: {}", e);
        e.to_string()
    })?;

    let (verificacao_id, old_servicos, _old_pecas, old_total) = match existing {
        Some(row) => row,
        None => return Err("Nenhuma verificação encontrada para este equipamento.".to_string()),
    };

    sqlx::query(
        r#"
        UPDATE verificacoes SET
            servicos_necessarios = $1,
            pecas_necessarias = $2,
            custo_total = $3,
            observacoes = COALESCE($4, observacoes),
            forma_pagamento_codigo = CASE
                WHEN $5::TEXT IS NOT NULL THEN $5
                ELSE forma_pagamento_codigo
            END,
            forma_pagamento_detalhe = CASE
                WHEN $5::TEXT IS NOT NULL THEN $6
                ELSE forma_pagamento_detalhe
            END,
            adjusted_at = NOW(),
            adjusted_by_profile_id = $7
        WHERE id = $8 AND ($9::INTEGER IS NULL OR empresa_id = $9)
        "#,
    )
    .bind(&servicos_json)
    .bind(&pecas_json)
    .bind(custo_total)
    .bind(observacoes.as_deref().map(str::trim).filter(|value| !value.is_empty()))
    .bind(payment_code.as_deref())
    .bind(payment_detail.as_deref())
    .bind(profile_id)
    .bind(verificacao_id)
    .bind(empresa_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        error!("Erro ao atualizar serviços da verificação {}: {}", verificacao_id, e);
        e.to_string()
    })?;

    let equipment_updated = sqlx::query(
        "UPDATE equipamentos
         SET valor_orcamento = $1, atualizado_em = NOW()
         WHERE id = $2 AND ($3::INTEGER IS NULL OR empresa_id = $3)",
    )
        .bind(custo_total)
        .bind(equipamento_id)
        .bind(empresa_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            error!("Erro ao sincronizar valor_orcamento do equipamento {}: {}", equipamento_id, e);
            e.to_string()
        })?
        .rows_affected();

    if equipment_updated == 0 {
        return Err("Equipamento não encontrado na empresa informada.".to_string());
    }

    tx.commit().await.map_err(|error| {
        error!("Erro ao confirmar ajuste da verificação {}: {}", verificacao_id, error);
        error.to_string()
    })?;

    let old_service_count = count_json_array_items(&old_servicos);
    let new_service_count = count_json_array_items(&servicos_json);
    let services_added = if new_service_count > old_service_count {
        new_service_count - old_service_count
    } else {
        0
    };
    let services_removed = if old_service_count > new_service_count {
        old_service_count - new_service_count
    } else {
        0
    };

    record_security_event(
        "BUDGET_ADJUSTED",
        Some(&actor),
        format!(
            "equipamento_id={}; old_total={}; new_total={}; services_added={}; services_removed={}; divergence={}; observacoes_updated={}; pagamento_updated={}",
            equipamento_id,
            old_total.unwrap_or(0.0),
            custo_total.unwrap_or(0.0),
            services_added,
            services_removed,
            divergence,
            observacoes.is_some(),
            payment_code.is_some(),
        ),
        true,
    )
    .await;

    info!("Serviços e orçamento atualizados para equipamento {}", equipamento_id);
    buscar_verificacao_tecnica(equipamento_id, empresa_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn p0_sensitive_verification_write_detects_financial_payload() {
        let mut input = VerificacaoInput::default();
        assert!(!verification_has_sensitive_financial_input(&input));

        input.custo_total = Some(150.0);
        assert!(verification_has_sensitive_financial_input(&input));
    }
}
