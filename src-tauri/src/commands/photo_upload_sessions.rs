//! Sessões temporárias e isoladas para upload de fotos pelo celular.
//!
//! O upload em si será implementado por uma Edge Function em ticket posterior.
//! Este módulo só cria o contrato seguro: token aleatório, hash persistido,
//! expiração curta e escopo estrito de empresa/perfil.

use chrono::{Duration, Utc};
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use sqlx::Row;
use tracing::{error, instrument};
use url::Url;

use crate::commands::auth::{
    record_security_event, require_permission, SecurityProfileSummary, PERMISSION_STOCK_CONTROL,
};
use crate::commands::types::{
    PhotoUploadSessionCreated, PhotoUploadSessionInput, PhotoUploadSessionStatus,
};
use crate::db::get_pool;

const SESSION_TTL_MINUTES: i64 = 10;
const MOBILE_UPLOADER_URL_ENV: &str = "AUTOOS_MOBILE_PHOTO_UPLOADER_URL";

fn normalize_category(category: Option<&str>) -> Result<String, String> {
    match category.unwrap_or("ENTRADA").trim() {
        "ENTRADA" => Ok("ENTRADA".to_string()),
        "SAIDA" => Ok("SAIDA".to_string()),
        "VERIFICACAO" => Ok("VERIFICACAO".to_string()),
        _ => Err("Categoria de foto inválida".to_string()),
    }
}

fn generate_token() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn mobile_uploader_base_url() -> Result<Option<Url>, String> {
    let value = match std::env::var(MOBILE_UPLOADER_URL_ENV) {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return Ok(None),
    };

    validate_mobile_uploader_base_url(value.trim()).map(Some)
}

fn validate_mobile_uploader_base_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value.trim())
        .map_err(|_| format!("{} deve ser uma URL HTTPS válida", MOBILE_UPLOADER_URL_ENV))?;

    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(format!(
            "{} deve usar HTTPS, sem credenciais, query string ou fragmento",
            MOBILE_UPLOADER_URL_ENV
        ));
    }

    Ok(url)
}

fn build_mobile_upload_url(base_url: Option<Url>, session_id: &str, token: &str) -> Option<String> {
    let mut url = base_url?;
    url.query_pairs_mut()
        .append_pair("session", session_id)
        .append_pair("token", token);
    Some(url.into())
}

async fn session_scope(actor: &SecurityProfileSummary) -> Result<i32, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let row =
        sqlx::query("SELECT empresa_id FROM security_profiles WHERE id = $1 AND ativo = true")
            .bind(actor.id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| {
                error!("Erro ao obter empresa do perfil {}: {}", actor.id, e);
                e.to_string()
            })?
            .ok_or_else(|| "Perfil de segurança ativo não foi encontrado".to_string())?;

    row.try_get::<Option<i32>, _>("empresa_id")
        .map_err(|e| e.to_string())?
        .ok_or_else(|| {
            "O perfil ativo não está vinculado a uma empresa. Configure o tenant antes de usar fotos pelo celular."
                .to_string()
        })
}

async fn ensure_equipment_in_scope(equipamento_id: i32, empresa_id: i32) -> Result<(), String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let found = sqlx::query("SELECT id FROM equipamentos WHERE id = $1 AND empresa_id = $2")
        .bind(equipamento_id)
        .bind(empresa_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            error!(
                "Erro ao validar equipamento {} para upload: {}",
                equipamento_id, e
            );
            e.to_string()
        })?;

    if found.is_none() {
        return Err("Equipamento não encontrado no tenant ativo".to_string());
    }

    Ok(())
}

async fn expire_session_if_needed(
    session_id: &str,
    empresa_id: i32,
    profile_id: i32,
) -> Result<(), String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    sqlx::query(
        "UPDATE photo_upload_sessions
         SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
         WHERE id::text = $1 AND empresa_id = $2 AND profile_id = $3
           AND status = 'PENDING' AND expires_at <= CURRENT_TIMESTAMP",
    )
    .bind(session_id)
    .bind(empresa_id)
    .bind(profile_id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn read_session_status(
    session_id: &str,
    empresa_id: i32,
    profile_id: i32,
) -> Result<PhotoUploadSessionStatus, String> {
    expire_session_if_needed(session_id, empresa_id, profile_id).await?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let row = sqlx::query(
        "SELECT id::text AS session_id, equipamento_id, categoria, status,
                expires_at::text AS expires_at, cancelled_at::text AS cancelled_at,
                consumed_at::text AS consumed_at
         FROM photo_upload_sessions
         WHERE id::text = $1 AND empresa_id = $2 AND profile_id = $3",
    )
    .bind(session_id)
    .bind(empresa_id)
    .bind(profile_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Sessão de envio de fotos não encontrada".to_string())?;

    Ok(PhotoUploadSessionStatus {
        session_id: row.try_get("session_id").map_err(|e| e.to_string())?,
        equipamento_id: row.try_get("equipamento_id").map_err(|e| e.to_string())?,
        categoria: row.try_get("categoria").map_err(|e| e.to_string())?,
        status: row.try_get("status").map_err(|e| e.to_string())?,
        expires_at: row.try_get("expires_at").map_err(|e| e.to_string())?,
        cancelled_at: row.try_get("cancelled_at").map_err(|e| e.to_string())?,
        consumed_at: row.try_get("consumed_at").map_err(|e| e.to_string())?,
    })
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn criar_sessao_upload_fotos(
    input: PhotoUploadSessionInput,
) -> Result<PhotoUploadSessionCreated, String> {
    let actor = require_permission(PERMISSION_STOCK_CONTROL)?;
    let categoria = normalize_category(input.categoria.as_deref())?;
    let uploader_base_url = mobile_uploader_base_url()?;
    let empresa_id = session_scope(&actor).await?;

    if let Some(equipamento_id) = input.equipamento_id {
        ensure_equipment_in_scope(equipamento_id, empresa_id).await?;
    }

    let token = generate_token();
    let token_hash = hash_token(&token);
    let expires_at = Utc::now() + Duration::minutes(SESSION_TTL_MINUTES);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let row = sqlx::query(
        "INSERT INTO photo_upload_sessions
         (empresa_id, profile_id, equipamento_id, categoria, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id::text AS session_id, expires_at::text AS expires_at",
    )
    .bind(empresa_id)
    .bind(actor.id)
    .bind(input.equipamento_id)
    .bind(&categoria)
    .bind(token_hash)
    .bind(expires_at)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao criar sessão de upload de fotos: {}", e);
        e.to_string()
    })?;

    let session_id: String = row.try_get("session_id").map_err(|e| e.to_string())?;
    let expires_at: String = row.try_get("expires_at").map_err(|e| e.to_string())?;
    let mobile_upload_url = build_mobile_upload_url(uploader_base_url, &session_id, &token);

    record_security_event(
        "PHOTO_UPLOAD_SESSION_CREATED",
        Some(&actor),
        format!(
            "session_id={}; empresa_id={}; equipamento_id={}; categoria={}; expires_at={}",
            session_id,
            empresa_id,
            input
                .equipamento_id
                .map(|id| id.to_string())
                .unwrap_or_else(|| "DRAFT".to_string()),
            categoria,
            expires_at,
        ),
        true,
    )
    .await;

    Ok(PhotoUploadSessionCreated {
        session_id,
        expires_at,
        mobile_upload_url,
    })
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn consultar_sessao_upload_fotos(
    session_id: String,
) -> Result<PhotoUploadSessionStatus, String> {
    let actor = require_permission(PERMISSION_STOCK_CONTROL)?;
    let empresa_id = session_scope(&actor).await?;
    read_session_status(session_id.trim(), empresa_id, actor.id).await
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn cancelar_sessao_upload_fotos(
    session_id: String,
) -> Result<PhotoUploadSessionStatus, String> {
    let actor = require_permission(PERMISSION_STOCK_CONTROL)?;
    let empresa_id = session_scope(&actor).await?;
    let session_id = session_id.trim();

    expire_session_if_needed(session_id, empresa_id, actor.id).await?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    sqlx::query(
        "UPDATE photo_upload_sessions
         SET status = 'CANCELLED', cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id::text = $1 AND empresa_id = $2 AND profile_id = $3 AND status = 'PENDING'",
    )
    .bind(session_id)
    .bind(empresa_id)
    .bind(actor.id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let status = read_session_status(session_id, empresa_id, actor.id).await?;
    record_security_event(
        "PHOTO_UPLOAD_SESSION_CANCELLED",
        Some(&actor),
        format!(
            "session_id={}; empresa_id={}; status={}",
            session_id, empresa_id, status.status
        ),
        true,
    )
    .await;
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_hash_is_hex_and_does_not_equal_the_token() {
        let token = generate_token();
        let hash = hash_token(&token);
        assert_eq!(token.len(), 64);
        assert_eq!(hash.len(), 64);
        assert_ne!(hash, token);
        assert!(hash.chars().all(|character| character.is_ascii_hexdigit()));
    }

    #[test]
    fn mobile_uploader_requires_safe_https_base_url() {
        assert!(validate_mobile_uploader_base_url("https://photos.example.com/upload").is_ok());
        assert!(validate_mobile_uploader_base_url("http://photos.example.com/upload").is_err());
        assert!(
            validate_mobile_uploader_base_url("https://user:pass@photos.example.com/upload")
                .is_err()
        );
        assert!(
            validate_mobile_uploader_base_url("https://photos.example.com/upload?x=1").is_err()
        );
    }

    #[test]
    fn mobile_url_keeps_token_out_of_separate_response_fields() {
        let token = "a".repeat(64);
        let url = build_mobile_upload_url(
            Some(Url::parse("https://photos.example.com/upload").unwrap()),
            "42",
            &token,
        )
        .unwrap();
        assert!(url.contains("session=42"));
        assert!(url.contains(&token));
    }
}
