//! Mensagens prontas de WhatsApp (0058). Só guardam o texto de cada empresa; o app abre o
//! WhatsApp com o texto preenchido e a pessoa decide enviar. Nada é enviado daqui.

use crate::commands::auth::{
    record_security_event, require_active_session_company_id, require_permission, PERMISSION_COMMUNICATION_SETTINGS,
};
use crate::db::get_pool;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::instrument;

#[derive(Debug, Serialize, FromRow)]
pub struct ModeloMensagem {
    pub id: i32,
    pub titulo: String,
    pub texto: String,
    pub ordem: i32,
    /// Token de concorrência: a edição só grava se ninguém mudou a mensagem depois de aberta.
    pub atualizado_em: String,
}

#[derive(Debug, Deserialize)]
pub struct ModeloMensagemInput {
    pub id: Option<i32>,
    pub titulo: String,
    pub texto: String,
    pub ordem: Option<i32>,
    /// Obrigatório ao alterar (`id` presente): o `atualizado_em` de quando a edição abriu.
    pub atualizado_em: Option<String>,
}

fn validar(input: &ModeloMensagemInput) -> Result<(String, String), String> {
    let titulo = input.titulo.trim();
    let texto = input.texto.trim();
    if titulo.is_empty() || titulo.chars().count() > 60 {
        return Err("Dê um nome de até 60 caracteres à mensagem.".to_string());
    }
    if texto.is_empty() || texto.chars().count() > 1000 {
        return Err("A mensagem precisa ter entre 1 e 1000 caracteres.".to_string());
    }
    Ok((titulo.to_string(), texto.to_string()))
}

/// Mensagens da empresa da sessão, na ordem em que aparecem no menu do WhatsApp.
#[tauri::command]
#[instrument(skip_all)]
pub async fn listar_modelos_mensagem() -> Result<Vec<ModeloMensagem>, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    sqlx::query_as::<_, ModeloMensagem>("SELECT id, titulo, texto, ordem, atualizado_em::TEXT AS atualizado_em FROM modelos_mensagem WHERE empresa_id = $1 ORDER BY ordem, id")
        .bind(empresa_id)
        .fetch_all(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)
}

/// Cria (sem `id`) ou altera uma mensagem. Só quem configura a comunicação.
#[tauri::command]
#[instrument(skip_all)]
pub async fn salvar_modelo_mensagem(input: ModeloMensagemInput) -> Result<ModeloMensagem, String> {
    let actor = require_permission(PERMISSION_COMMUNICATION_SETTINGS)?;
    let (titulo, texto) = validar(&input)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let salvo = match input.id {
        Some(id) => {
            let token = input
                .atualizado_em
                .as_deref()
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .ok_or_else(|| "Token de concorrência da mensagem é obrigatório para alterá-la.".to_string())?;
            sqlx::query_as::<_, ModeloMensagem>(
                "UPDATE modelos_mensagem SET titulo = $1, texto = $2, ordem = COALESCE($3, ordem), atualizado_em = NOW()
                 WHERE id = $4 AND empresa_id = $5 AND atualizado_em = $6::TIMESTAMPTZ
                 RETURNING id, titulo, texto, ordem, atualizado_em::TEXT AS atualizado_em",
            )
            .bind(&titulo)
            .bind(&texto)
            .bind(input.ordem)
            .bind(id)
            .bind(empresa_id)
            .bind(token)
            .fetch_optional(&pool)
            .await
            .map_err(super::operator_errors::mapear_erro_sql)?
            .ok_or_else(|| {
                "Conflito de concorrência: esta mensagem foi alterada ou excluída em outro computador. Recarregue a lista antes de salvar novamente.".to_string()
            })?
        }
        None => sqlx::query_as::<_, ModeloMensagem>(
            "INSERT INTO modelos_mensagem (empresa_id, titulo, texto, ordem)
             VALUES ($1, $2, $3, COALESCE($4, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM modelos_mensagem WHERE empresa_id = $1)))
             RETURNING id, titulo, texto, ordem, atualizado_em::TEXT AS atualizado_em",
        )
        .bind(empresa_id)
        .bind(&titulo)
        .bind(&texto)
        .bind(input.ordem)
        .fetch_one(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?,
    };
    record_security_event("MODELO_MENSAGEM_SALVO", Some(&actor), format!("modelo_id={} titulo={}", salvo.id, salvo.titulo), true).await;
    Ok(salvo)
}

#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn excluir_modelo_mensagem(id: i32) -> Result<(), String> {
    let actor = require_permission(PERMISSION_COMMUNICATION_SETTINGS)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let removidos = sqlx::query("DELETE FROM modelos_mensagem WHERE id = $1 AND empresa_id = $2")
        .bind(id)
        .bind(empresa_id)
        .execute(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?
        .rows_affected();
    record_security_event("MODELO_MENSAGEM_EXCLUIDO", Some(&actor), format!("modelo_id={id}"), removidos > 0).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{validar, ModeloMensagemInput};

    fn entrada(titulo: &str, texto: &str) -> ModeloMensagemInput {
        ModeloMensagemInput { id: None, titulo: titulo.to_string(), texto: texto.to_string(), ordem: None, atualizado_em: None }
    }

    #[test]
    fn valida_nome_e_texto() {
        assert_eq!(validar(&entrada("  Pronto ", " Olá {contato} ")).unwrap(), ("Pronto".to_string(), "Olá {contato}".to_string()));
        assert!(validar(&entrada("", "x")).is_err());
        assert!(validar(&entrada("x", "   ")).is_err());
        assert!(validar(&entrada(&"a".repeat(61), "x")).is_err());
        assert!(validar(&entrada("x", &"a".repeat(1001))).is_err());
    }
}
