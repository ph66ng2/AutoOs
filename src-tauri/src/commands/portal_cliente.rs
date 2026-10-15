//! Portal das Impressoras do Cliente — lado da equipe.
//!
//! O cliente responde pela Edge Function `portal-cliente` (migration 0034). Aqui ficam os
//! alertas persistentes que a equipe lê, o acesso de cada contato ao portal, a publicação da
//! proposta (versão congelada) e o cartão de contato exibido ao cliente.

use crate::commands::auth::{
    record_security_event, require_active_session_company_id, require_permission,
    require_sensitive_access, PERMISSION_FINANCIAL_ACTIONS, PERMISSION_MANAGE_STATUS_LINKS,
};
use crate::commands::orcamento_decisao::obter_ou_criar_versao;
use crate::commands::types::{ClienteContato, CLIENTE_CONTATO_SELECT};
use crate::db::get_pool;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::instrument;

const TS_FMT: &str = "YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"";
const MAX_ALERTAS: i64 = 200;

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AlertaPortal {
    pub id: i64,
    pub equipamento_id: Option<i32>,
    pub tipo: String,
    pub titulo: String,
    pub detalhe: Option<String>,
    pub criado_em: String,
    pub lido_em: Option<String>,
    pub lido_por: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrcamentoPublicado {
    pub versao_id: i64,
    pub versao: i32,
    /// `false` quando o conteúdo já estava publicado (a mesma versão foi reaproveitada).
    pub nova: bool,
}

#[derive(Debug, Serialize, Deserialize, Default, FromRow)]
#[serde(rename_all = "camelCase", default)]
pub struct ContatoPortalEmpresa {
    pub nome_exibicao: String,
    pub whatsapp: Option<String>,
    pub email: Option<String>,
    pub telefone: Option<String>,
    pub horario: Option<String>,
}

fn acesso_valido(acesso: &str) -> bool {
    matches!(acesso, "NENHUM" | "ACOMPANHAR" | "DECIDIR")
}

fn texto(value: Option<&str>, max: usize) -> Option<String> {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.chars().take(max).collect())
}

/// Alertas do portal da empresa ativa, do mais recente ao mais antigo.
#[tauri::command]
#[instrument(skip_all)]
pub async fn listar_alertas_portal(
    apenas_nao_lidos: bool,
    limite: Option<i64>,
) -> Result<Vec<AlertaPortal>, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let limite = limite.unwrap_or(50).clamp(1, MAX_ALERTAS);
    sqlx::query_as::<_, AlertaPortal>(sqlx::AssertSqlSafe(format!(
        "SELECT a.id, a.equipamento_id, a.tipo, a.titulo, a.detalhe,
                to_char(a.criado_em AT TIME ZONE 'UTC', '{TS_FMT}') AS criado_em,
                to_char(a.lido_em AT TIME ZONE 'UTC', '{TS_FMT}') AS lido_em,
                p.nome AS lido_por
         FROM portal_alertas a
         LEFT JOIN security_profiles p ON p.id = a.lido_por_profile_id
         WHERE a.empresa_id = $1 AND ($2 = FALSE OR a.lido_em IS NULL)
         ORDER BY a.id DESC
         LIMIT $3"
    )))
    .bind(empresa_id)
    .bind(apenas_nao_lidos)
    .bind(limite)
    .fetch_all(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)
}

#[tauri::command]
pub async fn contar_alertas_portal_nao_lidos() -> Result<i64, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    sqlx::query_scalar("SELECT COUNT(*) FROM portal_alertas WHERE empresa_id = $1 AND lido_em IS NULL")
        .bind(empresa_id)
        .fetch_one(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)
}

/// Marca como lido um alerta (`alerta_id`) ou todos os não lidos (`None`). A leitura fica no histórico.
#[tauri::command]
#[instrument(skip_all)]
pub async fn marcar_alertas_portal_lidos(alerta_id: Option<i64>) -> Result<u64, String> {
    let profile = require_sensitive_access()?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let result = sqlx::query(
        "UPDATE portal_alertas SET lido_em = NOW(), lido_por_profile_id = $3
         WHERE empresa_id = $1 AND lido_em IS NULL AND ($2::BIGINT IS NULL OR id = $2)",
    )
    .bind(empresa_id)
    .bind(alerta_id)
    .bind(profile.id)
    .execute(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    Ok(result.rows_affected())
}

/// Define o acesso do contato ao portal. `DECIDIR` autoriza responder a orçamentos e exige
/// a permissão financeira; trocar telefone ou email depois retira o acesso (trigger da 0034).
#[tauri::command]
#[instrument(skip_all, fields(contato_id = contato_id))]
pub async fn definir_acesso_portal_contato(contato_id: i32, acesso: String) -> Result<ClienteContato, String> {
    let acesso = acesso.trim().to_uppercase();
    if !acesso_valido(&acesso) {
        return Err("Acesso ao portal inválido.".to_string());
    }
    let actor = if acesso == "DECIDIR" {
        require_permission(PERMISSION_FINANCIAL_ACTIONS)?
    } else {
        require_permission(PERMISSION_MANAGE_STATUS_LINKS)?
    };
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;

    let contato: Option<(Option<String>, Option<String>, String)> = sqlx::query_as(
        "SELECT telefone, email, portal_acesso FROM cliente_contatos
         WHERE id = $1 AND empresa_id = $2 AND ativo = true",
    )
    .bind(contato_id)
    .bind(empresa_id)
    .fetch_optional(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    let Some((telefone, email, anterior)) = contato else {
        return Err("Contato não encontrado na empresa ativa.".to_string());
    };
    let tem_canal = telefone.as_deref().is_some_and(|t| t.chars().filter(char::is_ascii_digit).count() >= 10)
        || email.as_deref().is_some_and(|e| e.contains('@'));
    if acesso != "NENHUM" && !tem_canal {
        return Err("Cadastre o WhatsApp ou o email do contato antes de liberar o portal: o código de acesso vai para ele.".to_string());
    }

    sqlx::query(
        "UPDATE cliente_contatos SET portal_acesso = $3, atualizado_em = NOW()
         WHERE id = $1 AND empresa_id = $2",
    )
    .bind(contato_id)
    .bind(empresa_id)
    .bind(&acesso)
    .execute(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    record_security_event(
        "PORTAL_CONTACT_ACCESS_CHANGED",
        Some(&actor),
        format!("empresa_id={empresa_id}; contato_id={contato_id}; anterior={anterior}; acesso={acesso}"),
        true,
    )
    .await;

    let query = format!("{} WHERE id = $1 AND empresa_id = $2", CLIENTE_CONTATO_SELECT);
    sqlx::query_as::<_, ClienteContato>(sqlx::AssertSqlSafe(query))
        .bind(contato_id)
        .bind(empresa_id)
        .fetch_one(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)
}

/// Publica o orçamento atual no portal como versão congelada. Republicar o mesmo conteúdo
/// reaproveita a versão; um orçamento alterado vira nova versão e a anterior deixa de aceitar respostas.
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn publicar_orcamento_portal(equipamento_id: i32) -> Result<OrcamentoPublicado, String> {
    let actor = require_permission(PERMISSION_MANAGE_STATUS_LINKS)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = pool.begin().await.map_err(super::operator_errors::mapear_erro_sql)?;

    let antes: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(id) FROM orcamento_versoes WHERE equipamento_id = $1 AND empresa_id = $2",
    )
    .bind(equipamento_id)
    .bind(empresa_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    let versao = obter_ou_criar_versao(&mut tx, empresa_id, equipamento_id, actor.id).await?;
    tx.commit().await.map_err(super::operator_errors::mapear_erro_sql)?;

    let nova = antes.is_none_or(|id| versao.id > id);
    record_security_event(
        "BUDGET_PUBLISHED_TO_PORTAL",
        Some(&actor),
        format!("empresa_id={empresa_id}; equipamento_id={equipamento_id}; versao={}; nova={nova}", versao.numero),
        true,
    )
    .await;
    Ok(OrcamentoPublicado { versao_id: versao.id, versao: versao.numero, nova })
}

#[tauri::command]
pub async fn obter_contato_portal_empresa() -> Result<Option<ContatoPortalEmpresa>, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    sqlx::query_as::<_, ContatoPortalEmpresa>(
        "SELECT nome_exibicao, whatsapp, email, telefone, horario
         FROM portal_contato_empresa WHERE empresa_id = $1",
    )
    .bind(empresa_id)
    .fetch_optional(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)
}

/// Cartão "Fale com a equipe" do portal. Sem segredos: só canais públicos da empresa.
#[tauri::command]
#[instrument(skip_all)]
pub async fn salvar_contato_portal_empresa(input: ContatoPortalEmpresa) -> Result<ContatoPortalEmpresa, String> {
    let actor = require_permission(PERMISSION_MANAGE_STATUS_LINKS)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let nome = texto(Some(&input.nome_exibicao), 80).unwrap_or_else(|| "BMI TAG".to_string());
    let whatsapp = texto(input.whatsapp.as_deref(), 40).map(|v| v.chars().filter(char::is_ascii_digit).collect::<String>());
    if whatsapp.as_deref().is_some_and(|v| !(10..=15).contains(&v.len())) {
        return Err("Informe o WhatsApp com DDD (10 a 15 dígitos).".to_string());
    }
    let email = texto(input.email.as_deref(), 120);
    if email.as_deref().is_some_and(|v| !v.contains('@')) {
        return Err("Email de contato inválido.".to_string());
    }

    sqlx::query(
        "INSERT INTO portal_contato_empresa (empresa_id, nome_exibicao, whatsapp, email, telefone, horario, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (empresa_id) DO UPDATE
         SET nome_exibicao = EXCLUDED.nome_exibicao, whatsapp = EXCLUDED.whatsapp, email = EXCLUDED.email,
             telefone = EXCLUDED.telefone, horario = EXCLUDED.horario, atualizado_em = NOW()",
    )
    .bind(empresa_id)
    .bind(&nome)
    .bind(whatsapp.filter(|v| !v.is_empty()))
    .bind(email)
    .bind(texto(input.telefone.as_deref(), 40))
    .bind(texto(input.horario.as_deref(), 120))
    .execute(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    record_security_event("PORTAL_CONTACT_CARD_UPDATED", Some(&actor), format!("empresa_id={empresa_id}"), true).await;
    obter_contato_portal_empresa().await?.ok_or_else(|| "Contato não encontrado após salvar.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portal_access_is_whitelisted() {
        assert!(acesso_valido("DECIDIR"));
        assert!(acesso_valido("ACOMPANHAR"));
        assert!(acesso_valido("NENHUM"));
        assert!(!acesso_valido("ADMIN"));
    }

    #[test]
    fn contact_text_is_trimmed_and_bounded() {
        assert_eq!(texto(Some("  "), 10), None);
        assert_eq!(texto(Some(" abcdef "), 3).as_deref(), Some("abc"));
    }
}
