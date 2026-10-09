use crate::commands::auth::{
    record_security_event, require_active_session_company_id, require_permission,
    SecurityProfileSummary, PERMISSION_MANAGE_STATUS_LINKS,
};
use crate::commands::qr_code::render_qr_svg;
use crate::db::get_pool;
use chrono::{DateTime, Duration, Utc};
use rand::{rngs::OsRng, RngCore};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::Row;
use tracing::instrument;

const PUBLIC_STATUS_BASE_URL: &str = "https://status.bmitag.com.br";
const LINK_MAX_AGE_DAYS: i64 = 180;
const LINK_AFTER_DELIVERY_DAYS: i64 = 30;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicStatusLinkInfo {
    pub status: String,
    pub created_at: Option<String>,
    pub expires_at: Option<String>,
    pub last_access_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicStatusLinkCreated {
    pub url: String,
    pub expires_at: String,
}

fn format_timestamp(value: DateTime<Utc>) -> String {
    value.to_rfc3339()
}

fn status_url(token: &str) -> String {
    format!("{}/#/c/{}", PUBLIC_STATUS_BASE_URL, token)
}

#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn obter_link_status_publico(
    equipamento_id: i32,
) -> Result<Option<PublicStatusLinkInfo>, String> {
    require_permission(PERMISSION_MANAGE_STATUS_LINKS)?;
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;

    let row = sqlx::query(
        "SELECT
            CASE
                WHEN l.revogado_em IS NOT NULL THEN 'revogado'
                WHEN e.status = 'ENTREGUE' AND e.status_alterado_em IS NULL THEN 'expirado'
                WHEN LEAST(
                    l.expira_em,
                    CASE WHEN e.status = 'ENTREGUE'
                         THEN COALESCE(e.status_alterado_em, l.criado_em) + make_interval(days => $3)
                         ELSE l.expira_em
                    END
                ) <= NOW() THEN 'expirado'
                ELSE 'ativo'
            END AS status,
            to_char(l.criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS criado_em,
            to_char(
                LEAST(
                    l.expira_em,
                    CASE WHEN e.status = 'ENTREGUE'
                         THEN COALESCE(e.status_alterado_em, l.criado_em) + make_interval(days => $3)
                         ELSE l.expira_em
                    END
                ) AT TIME ZONE 'UTC',
                'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'
            ) AS expira_em,
            to_char(l.ultimo_acesso_em AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS ultimo_acesso_em
         FROM links_status_publico l
         JOIN equipamentos e ON e.id = l.equipamento_id AND e.empresa_id = l.empresa_id
         WHERE l.equipamento_id = $1 AND l.empresa_id = $2
         ORDER BY l.criado_em DESC, l.id DESC
         LIMIT 1",
    )
    .bind(equipamento_id)
    .bind(empresa_id)
    .bind(LINK_AFTER_DELIVERY_DAYS as i32)
    .fetch_optional(&pool)
    .await
    .map_err(|error| format!("Erro ao consultar o link público: {}", error))?;

    let Some(row) = row else {
        return Ok(None);
    };

    let status: String = row.try_get("status").map_err(|error| error.to_string())?;
    let created_at: Option<String> = row
        .try_get("criado_em")
        .map_err(|error| error.to_string())?;
    let expires_at: Option<String> = row
        .try_get("expira_em")
        .map_err(|error| error.to_string())?;
    let last_access_at: Option<String> = row
        .try_get("ultimo_acesso_em")
        .map_err(|error| error.to_string())?;

    Ok(Some(PublicStatusLinkInfo {
        status,
        created_at,
        expires_at,
        last_access_at,
    }))
}

#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn criar_link_status_publico(
    equipamento_id: i32,
) -> Result<PublicStatusLinkCreated, String> {
    let actor = require_permission(PERMISSION_MANAGE_STATUS_LINKS)?;
    create_link(equipamento_id, actor).await
}

async fn create_link(
    equipamento_id: i32,
    actor: SecurityProfileSummary,
) -> Result<PublicStatusLinkCreated, String> {
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = pool.begin().await.map_err(|error| error.to_string())?;

    let portal_enabled: bool = sqlx::query_scalar(
        "SELECT public_enabled FROM public.status_portal_config WHERE singleton = TRUE FOR SHARE",
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| error.to_string())?
    .unwrap_or(false);
    if !portal_enabled {
        return Err("A emissão de links públicos está pausada.".to_string());
    }

    let equipment = sqlx::query(
        "SELECT status, status_alterado_em
         FROM equipamentos
         WHERE id = $1 AND empresa_id = $2
         FOR UPDATE",
    )
    .bind(equipamento_id)
    .bind(empresa_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "Equipamento não encontrado na empresa do perfil ativo.".to_string())?;

    let status: String = equipment
        .try_get("status")
        .map_err(|error| error.to_string())?;
    let status_changed_at: Option<DateTime<Utc>> = equipment
        .try_get("status_alterado_em")
        .map_err(|error| error.to_string())?;
    if status == "ENTREGUE" && status_changed_at.is_none() {
        return Err(
            "Não é possível emitir um link para este atendimento entregue porque não há uma data confiável de entrega.".to_string(),
        );
    }
    if status == "ENTREGUE"
        && status_changed_at.is_some_and(|changed_at| {
            Utc::now() >= changed_at + Duration::days(LINK_AFTER_DELIVERY_DAYS)
        })
    {
        return Err("O prazo de acompanhamento terminou 30 dias após a entrega.".to_string());
    }

    let revoked_previous = sqlx::query(
        "UPDATE links_status_publico
         SET revogado_em = NOW(), revogado_por_profile_id = $1
         WHERE empresa_id = $2 AND equipamento_id = $3 AND revogado_em IS NULL",
    )
    .bind(actor.id)
    .bind(empresa_id)
    .bind(equipamento_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| error.to_string())?
    .rows_affected();

    let mut token_bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut token_bytes);
    let token = hex::encode(token_bytes);
    let token_hash = hex::encode(Sha256::digest(token.as_bytes()));
    let expires_at = Utc::now() + Duration::days(LINK_MAX_AGE_DAYS);

    sqlx::query(
        "INSERT INTO links_status_publico
            (empresa_id, equipamento_id, token_hash, expira_em, criado_por_profile_id)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(empresa_id)
    .bind(equipamento_id)
    .bind(token_hash)
    .bind(expires_at)
    .bind(actor.id)
    .execute(&mut *tx)
    .await
    .map_err(|error| format!("Erro ao gerar o link de acompanhamento: {}", error))?;

    tx.commit().await.map_err(|error| error.to_string())?;

    record_security_event(
        "PUBLIC_STATUS_LINK_CREATED",
        Some(&actor),
        format!(
            "equipamento_id={}; links_anteriores_revogados={}; validade_maxima_dias={}",
            equipamento_id, revoked_previous, LINK_MAX_AGE_DAYS
        ),
        true,
    )
    .await;

    Ok(PublicStatusLinkCreated {
        url: status_url(&token),
        expires_at: format_timestamp(expires_at),
    })
}

#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn revogar_link_status_publico(equipamento_id: i32) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_MANAGE_STATUS_LINKS)?;
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = pool.begin().await.map_err(|error| error.to_string())?;

    sqlx::query("SELECT id FROM equipamentos WHERE id = $1 AND empresa_id = $2 FOR UPDATE")
        .bind(equipamento_id)
        .bind(empresa_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Equipamento não encontrado na empresa do perfil ativo.".to_string())?;

    let revoked = sqlx::query(
        "UPDATE links_status_publico
         SET revogado_em = NOW(), revogado_por_profile_id = $1
         WHERE empresa_id = $2 AND equipamento_id = $3 AND revogado_em IS NULL",
    )
    .bind(actor.id)
    .bind(empresa_id)
    .bind(equipamento_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| error.to_string())?
    .rows_affected();

    tx.commit().await.map_err(|error| error.to_string())?;

    if revoked > 0 {
        record_security_event(
            "PUBLIC_STATUS_LINK_REVOKED",
            Some(&actor),
            format!(
                "equipamento_id={}; links_revogados={}",
                equipamento_id, revoked
            ),
            true,
        )
        .await;
    }

    Ok(revoked > 0)
}

#[tauri::command]
pub fn gerar_qr_link_status_publico(url: String) -> Result<String, String> {
    let prefix = format!("{}/#/c/", PUBLIC_STATUS_BASE_URL);
    let token = url
        .strip_prefix(&prefix)
        .ok_or_else(|| "URL de acompanhamento inválida.".to_string())?;
    if token.len() != 64 || !token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("URL de acompanhamento inválida.".to_string());
    }
    render_qr_svg(&url)
}
