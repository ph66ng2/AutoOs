//! Avisos internos do sino (Bloco 3B). A regra mora na função SQL `avisos_internos` (0053);
//! aqui só se resolve a empresa, o perfil da sessão e as permissões que decidem quem recebe o quê.

use crate::commands::auth::{
    current_session_profile, profile_has_permission, require_active_session_company_id_without_touch,
    require_sensitive_access, PERMISSION_FINANCIAL_ACTIONS, PERMISSION_PREPARE_QUOTES, PERMISSION_STOCK_CONTROL,
};
use crate::db::get_pool;
use serde::Serialize;
use sqlx::FromRow;
use tracing::instrument;

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AvisoInterno {
    pub chave: String,
    pub tipo: String,
    pub titulo: String,
    pub detalhe: Option<String>,
    pub equipamento_id: Option<i32>,
    pub venda_id: Option<i32>,
    pub quando: Option<String>,
    pub lido: bool,
}

const TIPOS_AVISO: &[&str] = &["os-nova", "vence-amanha", "pronto-parado", "peca-chegou", "estoque-baixo", "venda-aprovada"];

/// Tipos que a pessoa pode desligar em Perfil › Notificações: os avisos internos e os do portal.
pub(crate) fn tipos_desligaveis_validos(tipos: &[String]) -> Result<Vec<String>, String> {
    let mut validos: Vec<String> = Vec::new();
    for tipo in tipos.iter().map(|t| t.trim()) {
        if tipo != "portal" && !TIPOS_AVISO.contains(&tipo) {
            return Err(format!("Tipo de aviso desconhecido: {tipo}"));
        }
        if !validos.iter().any(|v| v == tipo) {
            validos.push(tipo.to_string());
        }
    }
    Ok(validos)
}

/// Chave de aviso aceita para marcar como lido: um dos tipos conhecidos, sem espaços, até 120 caracteres.
pub(crate) fn chave_valida(chave: &str) -> bool {
    let chave = chave.trim();
    chave.len() <= 120
        && !chave.contains(char::is_whitespace)
        && TIPOS_AVISO.iter().any(|tipo| chave.strip_prefix(tipo).is_some_and(|resto| resto.starts_with(':') && resto.len() > 1))
}

/// Avisos internos do perfil da sessão. Sem sessão (antes do PIN), nenhum.
#[tauri::command]
#[instrument(skip_all)]
pub async fn listar_avisos_internos() -> Result<Vec<AvisoInterno>, String> {
    let Some((_, perfil)) = current_session_profile()? else {
        return Ok(Vec::new());
    };
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    // Consulta de segundo plano (sino a cada 30 s): não renova a sessão sensível.
    let empresa_id = require_active_session_company_id_without_touch(&pool).await?;
    let orcamento = profile_has_permission(&perfil, PERMISSION_PREPARE_QUOTES) || profile_has_permission(&perfil, PERMISSION_FINANCIAL_ACTIONS);
    sqlx::query_as::<_, AvisoInterno>(
        "SELECT chave, tipo, titulo, detalhe, equipamento_id, venda_id,
                to_char(quando AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS quando, lido
         FROM avisos_internos($1, $2, $3, $4, $5, $6) a
         WHERE NOT EXISTS (SELECT 1 FROM security_profiles p
                           WHERE p.id = $2 AND a.tipo = ANY(p.avisos_desligados))",
    )
    .bind(empresa_id)
    .bind(perfil.id)
    .bind(&perfil.nome)
    .bind(orcamento)
    .bind(profile_has_permission(&perfil, PERMISSION_STOCK_CONTROL))
    .bind(profile_has_permission(&perfil, PERMISSION_FINANCIAL_ACTIONS))
    .fetch_all(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)
}

/// Marca avisos internos como lidos para o perfil da sessão.
#[tauri::command]
#[instrument(skip_all)]
pub async fn marcar_avisos_lidos(chaves: Vec<String>) -> Result<u64, String> {
    let perfil = require_sensitive_access()?;
    let chaves: Vec<String> = chaves.into_iter().map(|c| c.trim().to_string()).filter(|c| chave_valida(c)).collect();
    if chaves.is_empty() {
        return Ok(0);
    }
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = super::auth::require_active_session_company_id(&pool).await?;
    let result = sqlx::query(
        "INSERT INTO notificacao_leituras (empresa_id, profile_id, chave)
         SELECT $1, $2, unnest($3::TEXT[])
         ON CONFLICT (empresa_id, profile_id, chave) DO NOTHING",
    )
    .bind(empresa_id)
    .bind(perfil.id)
    .bind(&chaves)
    .execute(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    Ok(result.rows_affected())
}

/// Salva os tipos de aviso que o perfil da sessão não quer receber. Devolve a lista gravada.
#[tauri::command]
#[instrument(skip_all)]
pub async fn salvar_avisos_desligados(tipos: Vec<String>) -> Result<Vec<String>, String> {
    let perfil = require_sensitive_access()?;
    let tipos = tipos_desligaveis_validos(&tipos)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE security_profiles SET avisos_desligados = $1, atualizado_em = NOW() WHERE id = $2 AND ativo = true")
        .bind(&tipos)
        .bind(perfil.id)
        .execute(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
    Ok(tipos)
}

#[cfg(test)]
mod tests {
    use super::{chave_valida, tipos_desligaveis_validos};

    #[test]
    fn so_desliga_tipos_conhecidos_sem_repetir() {
        let ok = tipos_desligaveis_validos(&["portal".into(), " estoque-baixo ".into(), "portal".into()]).unwrap();
        assert_eq!(ok, vec!["portal".to_string(), "estoque-baixo".to_string()]);
        assert!(tipos_desligaveis_validos(&["qualquer".into()]).is_err());
        assert!(tipos_desligaveis_validos(&[]).unwrap().is_empty());
    }

    #[test]
    fn so_aceita_chaves_de_avisos_conhecidos() {
        assert!(chave_valida("os-nova:12"));
        assert!(chave_valida("vence-amanha:3:2026-11-20"));
        assert!(chave_valida("estoque-baixo:9f86d081884c7d659a2feaa0c55ad015"));
        assert!(!chave_valida("portal:3"));
        assert!(!chave_valida("os-nova:"));
        assert!(!chave_valida("os-nova"));
        assert!(!chave_valida("os-nova:1 2"));
        assert!(!chave_valida(&format!("os-nova:{}", "9".repeat(130))));
    }
}
