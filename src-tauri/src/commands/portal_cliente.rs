//! Portal das Impressoras do Cliente — lado da equipe.
//!
//! O cliente responde pela Edge Function `portal-cliente` (migration 0035). Aqui ficam os
//! alertas persistentes que a equipe lê, o acesso de cada contato ao portal, a publicação da
//! proposta (versão congelada) e o cartão de contato exibido ao cliente.

use crate::commands::auth::{
    record_security_event, require_active_session_company_id, require_active_session_company_id_without_touch,
    require_any_permission, require_permission,
    require_sensitive_access, PERMISSION_FINANCIAL_ACTIONS, PERMISSION_MANAGE_STATUS_LINKS,
    PERMISSION_PREPARE_QUOTES,
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
    /// Decisão da resposta ligada ao alerta (`APROVAR`, `RECUSAR`, `DESFEITA`), para cor e ícone.
    pub decisao: Option<String>,
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
    /// Endereço de retirada mostrado no portal quando o equipamento está pronto (até 300).
    pub endereco: Option<String>,
    /// Link https do mapa (até 500). Opcional.
    pub maps_url: Option<String>,
}

/// Mesmas regras dos CHECK da migration 0039 (`chk_portal_contato_endereco`/`chk_portal_contato_maps_url`),
/// com mensagem clara em vez de truncar em silêncio.
fn validar_endereco_mapa(endereco: Option<&str>, maps_url: Option<&str>) -> Result<(Option<String>, Option<String>), String> {
    let endereco = endereco.map(str::trim).filter(|v| !v.is_empty()).map(str::to_string);
    if endereco.as_deref().is_some_and(|v| v.chars().count() > 300) {
        return Err("O endereço para retirada deve ter no máximo 300 caracteres.".to_string());
    }
    let maps_url = maps_url.map(str::trim).filter(|v| !v.is_empty()).map(str::to_string);
    if let Some(url) = maps_url.as_deref() {
        let esquema_https = url.get(..8).is_some_and(|inicio| inicio.eq_ignore_ascii_case("https://"));
        if !esquema_https || url.len() <= 8 || url.chars().any(char::is_whitespace) {
            return Err("O link do mapa deve começar com https:// e não pode ter espaços.".to_string());
        }
        if url.chars().count() > 500 {
            return Err("O link do mapa deve ter no máximo 500 caracteres.".to_string());
        }
    }
    Ok((endereco, maps_url))
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
    // Consulta de segundo plano (sino a cada 30 s): não renova a sessão sensível.
    let empresa_id = require_active_session_company_id_without_touch(&pool).await?;
    let limite = limite.unwrap_or(50).clamp(1, MAX_ALERTAS);
    sqlx::query_as::<_, AlertaPortal>(sqlx::AssertSqlSafe(format!(
        "SELECT a.id, a.equipamento_id, a.tipo, a.titulo, a.detalhe,
                to_char(a.criado_em AT TIME ZONE 'UTC', '{TS_FMT}') AS criado_em,
                to_char(a.lido_em AT TIME ZONE 'UTC', '{TS_FMT}') AS lido_em,
                p.nome AS lido_por, r.decisao
         FROM portal_alertas a
         LEFT JOIN security_profiles p ON p.id = a.lido_por_profile_id
         LEFT JOIN orcamento_respostas r ON r.id = a.resposta_id AND r.empresa_id = a.empresa_id
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
    // Consulta de segundo plano (sino a cada 30 s): não renova a sessão sensível.
    let empresa_id = require_active_session_company_id_without_touch(&pool).await?;
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
/// a permissão financeira; inativar o contato ou mudá-lo de cliente retira o acesso (trigger, 0038).
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

    let contato: Option<(String,)> = sqlx::query_as(
        "SELECT portal_acesso FROM cliente_contatos
         WHERE id = $1 AND empresa_id = $2 AND ativo = true",
    )
    .bind(contato_id)
    .bind(empresa_id)
    .fetch_optional(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    let Some((anterior,)) = contato else {
        return Err("Contato não encontrado na empresa ativa.".to_string());
    };

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

/// Senha do portal criada pelo operador para um contato (`None` remove). O cliente entra com
/// CPF/CNPJ + esta senha; ela identifica o contato. Só o hash bcrypt fica no banco (0036).
#[tauri::command]
#[instrument(skip_all, fields(contato_id = contato_id))]
pub async fn definir_senha_portal_contato(contato_id: i32, senha: Option<String>) -> Result<ClienteContato, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let acesso: Option<String> = sqlx::query_scalar("SELECT portal_acesso FROM cliente_contatos WHERE id = $1")
        .bind(contato_id)
        .fetch_optional(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
    // Quem pode decidir orçamento só recebe senha de quem tem a permissão financeira.
    let actor = if acesso.as_deref() == Some("DECIDIR") {
        require_permission(PERMISSION_FINANCIAL_ACTIONS)?
    } else {
        require_permission(PERMISSION_MANAGE_STATUS_LINKS)?
    };
    let empresa_id = require_active_session_company_id(&pool).await?;
    if let Some(valor) = senha.as_deref() {
        if !senha_aceitavel(valor) {
            return Err("A senha precisa ter de 8 a 72 caracteres, com letras e números.".to_string());
        }
    }

    sqlx::query("SELECT public.portal_definir_senha_contato($1, $2, $3, $4)")
        .bind(empresa_id)
        .bind(contato_id)
        .bind(senha.as_deref())
        .bind(actor.id)
        .execute(&pool)
        .await
        .map_err(|error| match error.as_database_error().map(|db| db.message().to_string()).as_deref() {
            Some("CONTATO_INDISPONIVEL") => "Contato não encontrado na empresa ativa.".to_string(),
            Some("CONTATO_SEM_ACESSO") => "Libere o acesso do contato ao portal antes de criar a senha.".to_string(),
            Some("SENHA_FRACA") => "A senha precisa ter de 8 a 72 caracteres, com letras e números.".to_string(),
            Some("SENHA_REPETIDA") => "Outro contato deste CPF/CNPJ já usa essa senha. Escolha outra: é a senha que identifica quem entrou.".to_string(),
            _ => super::operator_errors::mapear_erro_sql(error),
        })?;

    record_security_event(
        if senha.is_some() { "PORTAL_PASSWORD_SET" } else { "PORTAL_PASSWORD_REMOVED" },
        Some(&actor),
        format!("empresa_id={empresa_id}; contato_id={contato_id}"),
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

/// Mesma regra de `autoos_portal_senha_valida` (0036), conferida antes de ir ao banco.
fn senha_aceitavel(senha: &str) -> bool {
    senha.chars().count() >= 8
        && senha.len() <= 72
        && senha.chars().any(char::is_alphabetic)
        && senha.chars().any(|c| c.is_ascii_digit())
        && !senha.chars().any(char::is_control)
}

/// Publica o orçamento atual no portal como versão congelada. Republicar o mesmo conteúdo
/// reaproveita a versão; um orçamento alterado vira nova versão e a anterior deixa de aceitar respostas.
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn publicar_orcamento_portal(equipamento_id: i32) -> Result<OrcamentoPublicado, String> {
    let actor = require_any_permission(&[PERMISSION_MANAGE_STATUS_LINKS, PERMISSION_PREPARE_QUOTES])?;
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
        "SELECT nome_exibicao, whatsapp, email, telefone, horario, endereco, maps_url
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
    let (endereco, maps_url) = validar_endereco_mapa(input.endereco.as_deref(), input.maps_url.as_deref())?;

    sqlx::query(
        "INSERT INTO portal_contato_empresa (empresa_id, nome_exibicao, whatsapp, email, telefone, horario, endereco, maps_url, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (empresa_id) DO UPDATE
         SET nome_exibicao = EXCLUDED.nome_exibicao, whatsapp = EXCLUDED.whatsapp, email = EXCLUDED.email,
             telefone = EXCLUDED.telefone, horario = EXCLUDED.horario,
             endereco = EXCLUDED.endereco, maps_url = EXCLUDED.maps_url, atualizado_em = NOW()",
    )
    .bind(empresa_id)
    .bind(&nome)
    .bind(whatsapp.filter(|v| !v.is_empty()))
    .bind(email)
    .bind(texto(input.telefone.as_deref(), 40))
    .bind(texto(input.horario.as_deref(), 120))
    .bind(endereco)
    .bind(maps_url)
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
    fn operator_password_rule_matches_the_database() {
        assert!(senha_aceitavel("Ana-Senha-2026"));
        assert!(!senha_aceitavel("curta1"));
        assert!(!senha_aceitavel("somenteletras"));
        assert!(!senha_aceitavel("12345678"));
        assert!(!senha_aceitavel(&format!("a1{}", "x".repeat(71))));
    }

    #[test]
    fn contact_text_is_trimmed_and_bounded() {
        assert_eq!(texto(Some("  "), 10), None);
        assert_eq!(texto(Some(" abcdef "), 3).as_deref(), Some("abc"));
    }

    #[test]
    fn address_and_map_follow_the_database_check() {
        assert_eq!(validar_endereco_mapa(None, None).unwrap(), (None, None));
        assert_eq!(validar_endereco_mapa(Some("  "), Some(" ")).unwrap(), (None, None));
        let (e, m) = validar_endereco_mapa(Some(" Rua A, 10 "), Some(" HTTPS://maps.app.goo.gl/x ")).unwrap();
        assert_eq!(e.as_deref(), Some("Rua A, 10"));
        assert_eq!(m.as_deref(), Some("HTTPS://maps.app.goo.gl/x"));
        assert!(validar_endereco_mapa(Some(&"a".repeat(300)), None).is_ok());
        assert!(validar_endereco_mapa(Some(&"a".repeat(301)), None).is_err());
        assert!(validar_endereco_mapa(None, Some("http://maps.google.com/x")).is_err());
        assert!(validar_endereco_mapa(None, Some("javascript:alert(1)")).is_err());
        assert!(validar_endereco_mapa(None, Some("https://")).is_err());
        assert!(validar_endereco_mapa(None, Some("https://maps.google.com/a b")).is_err());
        assert!(validar_endereco_mapa(None, Some(&format!("https://x.com/{}", "a".repeat(486)))).is_ok());
        assert!(validar_endereco_mapa(None, Some(&format!("https://x.com/{}", "a".repeat(487)))).is_err());
    }
}

/// Liga/desliga do portal e situação da efetivação automática, para Configurações.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstadoPortal {
    /// `portal_config_empresa.portal_enabled`: login e consulta dos atendimentos desta empresa.
    pub portal_ativo: bool,
    /// `portal_config_empresa.respostas_enabled`: aceitar, recusar e negociar pelo portal.
    pub respostas_ativas: bool,
    /// Respostas desta empresa que passaram do prazo de correção (+5 min) sem serem aplicadas nem
    /// falharem: sinal de que o agendamento da efetivação no Supabase não está rodando.
    pub respostas_atrasadas: i64,
}

#[tauri::command]
pub async fn obter_estado_portal() -> Result<EstadoPortal, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let (portal_ativo, respostas_ativas, respostas_atrasadas): (bool, bool, i64) = sqlx::query_as(
        "SELECT
            COALESCE((SELECT portal_enabled FROM portal_config_empresa WHERE empresa_id = $1), FALSE),
            COALESCE((SELECT respostas_enabled FROM portal_config_empresa WHERE empresa_id = $1), FALSE),
            (SELECT COUNT(*) FROM orcamento_respostas r
             JOIN orcamento_versoes v ON v.id = r.versao_id AND v.empresa_id = r.empresa_id
             WHERE r.empresa_id = $1 AND r.origem = 'PORTAL_CLIENTE' AND r.decisao IN ('APROVAR', 'RECUSAR')
               AND r.aplicada_em IS NULL AND r.efetivacao_falhou_em IS NULL AND v.encerrada_em IS NULL
               AND NOT EXISTS (SELECT 1 FROM orcamento_respostas n WHERE n.versao_id = r.versao_id AND n.id > r.id)
               AND r.registrada_em < NOW() - make_interval(mins => GREATEST(
                   COALESCE((SELECT janela_correcao_minutos FROM orcamento_aceite_config WHERE singleton), 15), 15) + 5))",
    )
    .bind(empresa_id)
    .fetch_one(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    Ok(EstadoPortal { portal_ativo, respostas_ativas, respostas_atrasadas })
}

/// Liga/desliga o portal (gestão de links) e as respostas pelo portal (permissão financeira) da
/// empresa do perfil ativo. Desligar não apaga nada: o login cai na hora e as sessões voltam a
/// valer ao religar.
#[tauri::command]
#[instrument(skip_all, fields(portal_ativo = portal_ativo, respostas_ativas = respostas_ativas))]
pub async fn definir_estado_portal(portal_ativo: bool, respostas_ativas: bool) -> Result<EstadoPortal, String> {
    let actor = require_permission(PERMISSION_MANAGE_STATUS_LINKS)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let map = super::operator_errors::mapear_erro_sql;
    let mut tx = pool.begin().await.map_err(map)?;
    sqlx::query("INSERT INTO portal_config_empresa (empresa_id) VALUES ($1) ON CONFLICT (empresa_id) DO NOTHING")
        .bind(empresa_id)
        .execute(&mut *tx)
        .await
        .map_err(map)?;
    let respostas_antes: bool = sqlx::query_scalar(
        "SELECT respostas_enabled FROM portal_config_empresa WHERE empresa_id = $1 FOR UPDATE",
    )
    .bind(empresa_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map)?;
    if respostas_antes != respostas_ativas {
        // Clientes aprovando orçamentos mexem em status, pagamento e estoque.
        require_permission(PERMISSION_FINANCIAL_ACTIONS)?;
    }
    sqlx::query(
        "UPDATE portal_config_empresa
         SET portal_enabled = $2, respostas_enabled = $3, atualizado_em = NOW(), atualizado_por_profile_id = $4
         WHERE empresa_id = $1",
    )
    .bind(empresa_id)
    .bind(portal_ativo)
    .bind(respostas_ativas)
    .bind(actor.id)
    .execute(&mut *tx)
    .await
    .map_err(map)?;
    tx.commit().await.map_err(map)?;
    record_security_event(
        "PORTAL_CONFIG_CHANGED",
        Some(&actor),
        format!("empresa_id={empresa_id}; portal_enabled={portal_ativo}; respostas_enabled={respostas_ativas}"),
        true,
    )
    .await;
    obter_estado_portal().await
}
