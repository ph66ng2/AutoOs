//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/comunicacoes.rs — Histórico de Comunicações        ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  - registrar_comunicacao: INSERT nova comunicação            ║
//! ║  - listar_comunicacoes: Lista por equipamento_id             ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::types::{ComunicacaoInput, ComunicacaoRow, COMUNICACAO_SELECT};
use crate::db::get_pool;
use sqlx::Row;
use tracing::{debug, error, info, instrument};

/// Registrar nova comunicação (email ou WhatsApp).
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = input.equipamento_id, tipo = %input.tipo, canal = %input.canal))]
pub async fn registrar_comunicacao(input: ComunicacaoInput) -> Result<ComunicacaoRow, String> {
    debug!("Registrando comunicação {} via {} para equipamento {}", 
           input.tipo, input.canal, input.equipamento_id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let empresa_id: i32 = sqlx::query_scalar(
        "SELECT empresa_id FROM equipamentos WHERE id = $1 AND empresa_id IS NOT NULL",
    )
    .bind(input.equipamento_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "O equipamento precisa estar vinculado à empresa antes de registrar uma comunicação.".to_string())?;

    let row = sqlx::query(
        r#"
        INSERT INTO comunicacoes (
            empresa_id, equipamento_id, tipo, canal, destinatario, contato,
            assunto, mensagem, anexos, enviado, data_envio, erro
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            CASE WHEN $10 = true THEN NOW() ELSE NULL END,
            $11
        ) RETURNING id
        "#,
    )
    .bind(empresa_id)
    .bind(input.equipamento_id)
    .bind(&input.tipo)
    .bind(&input.canal)
    .bind(&input.destinatario)
    .bind(&input.contato)
    .bind(&input.assunto)
    .bind(&input.mensagem)
    .bind(&input.anexos)
    .bind(input.enviado.unwrap_or(false))
    .bind(&input.erro)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao registrar comunicação: {}", e);
        e.to_string()
    })?;

    let id: i32 = row.get("id");
    info!("Comunicação registrada: id={}", id);
    
    // Buscar a comunicação recém criada
    let query = format!("{} WHERE id = $1", COMUNICACAO_SELECT);
    let com = sqlx::query_as::<_, ComunicacaoRow>(sqlx::AssertSqlSafe(&*query))
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(com)
}

/// Listar comunicações de um equipamento (ordenadas por data decrescente).
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn listar_comunicacoes(equipamento_id: i32) -> Result<Vec<ComunicacaoRow>, String> {
    debug!("Listando comunicações do equipamento {}", equipamento_id);
    let pool = get_pool().await.map_err(|e| {
        error!("Erro ao obter pool: {}", e);
        e.to_string()
    })?;

    let query = format!(
        "{} WHERE equipamento_id = $1 ORDER BY criado_em DESC",
        COMUNICACAO_SELECT
    );

    let rows = sqlx::query_as::<_, ComunicacaoRow>(sqlx::AssertSqlSafe(&*query))
        .bind(equipamento_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao listar comunicações: {}", e);
            e.to_string()
        })?;

    info!("Comunicações do equipamento {}: {} itens", equipamento_id, rows.len());
    Ok(rows)
}
