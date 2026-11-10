//! Publica os bytes oficiais, sem regenerar o PDF e sem expor a chave do Storage ao portal.
use super::auth::{
    record_security_event, require_active_session_company_id, require_any_permission,
    require_sensitive_access, PERMISSION_FINANCIAL_ACTIONS, PERMISSION_MANAGE_STATUS_LINKS,
    PERMISSION_PREPARE_QUOTES,
};
use super::equipamento_imagens::{load_storage_config, SupabaseStorageConfig};
use crate::db::get_pool;
use sha2::{Digest, Sha256};
use std::time::Duration;

#[tauri::command]
#[tracing::instrument(skip_all, err)]
pub async fn publicar_documento_portal(
    equipamento_id: i32,
    tipo: String,
    versao_id: Option<i64>,
    atualizado_em: String,
    bytes: Vec<u8>,
) -> Result<Vec<u8>, String> {
    let actor = if tipo == "ORDEM_SERVICO" {
        require_sensitive_access()?
    } else {
        require_any_permission(&[
            PERMISSION_FINANCIAL_ACTIONS,
            PERMISSION_MANAGE_STATUS_LINKS,
            PERMISSION_PREPARE_QUOTES,
        ])?
    };
    if !matches!(
        tipo.as_str(),
        "ORDEM_SERVICO" | "ORCAMENTO" | "ORCAMENTO_AJUSTADO"
    ) || (tipo == "ORDEM_SERVICO") != versao_id.is_none()
        || bytes.len() > 15 * 1024 * 1024
        || !bytes.starts_with(b"%PDF-")
    {
        return Err("Documento oficial inválido.".into());
    }
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let valido: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM equipamentos WHERE id=$1 AND empresa_id=$2 AND atualizado_em=$3::TEXT::TIMESTAMPTZ)")
        .bind(equipamento_id).bind(empresa_id).bind(&atualizado_em).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    if !valido {
        return Err("Documento desatualizado ou de outra empresa.".into());
    }
    let config =
        load_storage_config()?.ok_or("Configure o Storage para publicar documentos no portal.")?;
    let hash = hex::encode(Sha256::digest(&bytes));
    let caminho = format!(
        "{empresa_id}/{equipamento_id}/{tipo}/{}/{hash}.pdf",
        versao_id.unwrap_or(0)
    );
    let tamanho = bytes.len() as i32;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| "Não foi possível iniciar o upload.".to_string())?;
    let existente: Option<String> = sqlx::query_scalar(
        "SELECT caminho FROM portal_documentos_oficiais
         WHERE empresa_id=$1 AND equipamento_id=$2 AND tipo=$3 AND versao_chave=COALESCE($4,0)
           AND (tipo <> 'ORCAMENTO_AJUSTADO' OR revisao_em >= $5::TEXT::TIMESTAMPTZ)",
    )
    .bind(empresa_id)
    .bind(equipamento_id)
    .bind(&tipo)
    .bind(versao_id)
    .bind(&atualizado_em)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;
    if let Some(canonico) = existente {
        return baixar_canonico(&client, &config, &canonico).await;
    }
    let response = client
        .post(format!(
            "{}/storage/v1/object/portal-documentos/{caminho}",
            config.supabase_url.trim_end_matches('/')
        ))
        .header("apikey", &config.supabase_service_key)
        .bearer_auth(&config.supabase_service_key)
        .header("Content-Type", "application/pdf")
        .header("x-upsert", "true")
        .body(bytes.clone())
        .send()
        .await
        .map_err(|_| {
            tracing::warn!(
                equipamento_id,
                "PORTAL_PDF_UPLOAD_FAILED; tentar na próxima emissão"
            );
            "Upload do documento indisponível.".to_string()
        })?;
    if !response.status().is_success() {
        tracing::warn!(equipamento_id, status = %response.status(), "PORTAL_PDF_UPLOAD_FAILED");
        return Err("Storage recusou o documento oficial.".into());
    }
    let canonico: String = sqlx::query_scalar("SELECT public.autoos_registrar_documento_oficial($1,$2,$3,$4,$5::TEXT::TIMESTAMPTZ,$6,$7,$8)")
        .bind(empresa_id).bind(equipamento_id).bind(&tipo).bind(versao_id).bind(atualizado_em)
        .bind(&caminho).bind(hash).bind(tamanho).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    record_security_event("PORTAL_OFFICIAL_PDF_PUBLISHED", Some(&actor),
        format!("empresa_id={empresa_id}; equipamento_id={equipamento_id}; tipo={tipo}; versao_id={versao_id:?}"), true).await;
    if canonico == caminho {
        return Ok(bytes);
    }
    // Uma emissão concorrente pode ter publicado antes. O arquivo local/e-mail usa o canônico.
    baixar_canonico(&client, &config, &canonico).await
}

async fn baixar_canonico(
    client: &reqwest::Client,
    config: &SupabaseStorageConfig,
    caminho: &str,
) -> Result<Vec<u8>, String> {
    let response = client
        .get(format!(
            "{}/storage/v1/object/authenticated/portal-documentos/{caminho}",
            config.supabase_url.trim_end_matches('/')
        ))
        .header("apikey", &config.supabase_service_key)
        .bearer_auth(&config.supabase_service_key)
        .send()
        .await
        .map_err(|_| "Documento canônico indisponível.".to_string())?;
    if !response.status().is_success() {
        return Err("Documento canônico indisponível.".into());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "Documento canônico indisponível.".to_string())?;
    let hash = hex::encode(Sha256::digest(&bytes));
    if bytes.len() > 15 * 1024 * 1024
        || !bytes.starts_with(b"%PDF-")
        || !caminho.ends_with(&format!("/{hash}.pdf"))
    {
        return Err("Integridade do documento canônico inválida.".into());
    }
    Ok(bytes.to_vec())
}
