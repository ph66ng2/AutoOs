//! Aceite de orçamento pelo cliente (fase 1: banco e desktop).
//!
//! A resposta do cliente é só um registro. Status, pagamento e estoque continuam
//! sendo alterados por `aprovar_orcamento`, depois da conferência da equipe.

use crate::commands::auth::{
    record_security_event, require_active_session_company_id, require_permission,
    PERMISSION_FINANCIAL_ACTIONS, PERMISSION_MANAGE_STATUS_LINKS,
};
use crate::commands::orcamento_estoque::normalizar_servicos;
use crate::db::get_pool;
use chrono::{DateTime, Duration, Utc};
use rand::{rngs::OsRng, RngCore};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction};
use tracing::instrument;

const DECISION_BASE_URL: &str = "https://status.bmitag.com.br";
const LINK_MAX_AGE_DAYS: i64 = 30;
const MIN_CORRECTION_WINDOW_MINUTES: i32 = 15;
const TS_FMT: &str = "YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RespostaOrcamentoInfo {
    pub id: i64,
    pub origem: String,
    pub decisao: String,
    pub registrada_em: String,
    pub registrada_por: Option<String>,
    pub motivo: Option<String>,
    pub aplicada_em: Option<String>,
    /// Contato autorizado que respondeu pelo Portal do Cliente (origem `PORTAL_CLIENTE`).
    pub contato: Option<String>,
    /// Efetivada pelo servidor depois do prazo de correção, sem operador.
    pub aplicada_pelo_sistema: bool,
    /// Motivo de a efetivação automática ter parado; a resposta segue pendente para a equipe.
    pub efetivacao_erro: Option<String>,
    pub efetivacao_falhou_em: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolicitacaoOrcamentoInfo {
    pub id: i64,
    /// `DUVIDA` (link aberto) ou `MUDANCA` (decisão já aplicada).
    pub tipo: String,
    pub mensagem: String,
    pub criada_em: String,
    pub tratada_em: Option<String>,
    /// Contato do portal que enviou (vazio para o link de decisão).
    pub contato: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisaoOrcamentoInfo {
    pub versao_id: i64,
    pub versao: i32,
    pub valor_total: f64,
    pub valido_ate: Option<String>,
    pub criada_em: String,
    /// `None` quando a versão foi encerrada; o motivo explica por quê.
    pub encerrada_motivo: Option<String>,
    pub aceite_online_ativo: bool,
    /// `ativo`, `expirado`, `revogado` ou `None` quando nunca houve link.
    pub link_status: Option<String>,
    pub link_expira_em: Option<String>,
    /// Resposta vigente (a de maior id). `DESFEITA` significa que o cliente retirou a resposta.
    pub resposta: Option<RespostaOrcamentoInfo>,
    pub historico: Vec<RespostaOrcamentoInfo>,
    /// Dúvidas e pedidos de mudança enviados pelo cliente, do mais recente ao mais antigo.
    pub solicitacoes: Vec<SolicitacaoOrcamentoInfo>,
    /// Fim da janela mínima de correção da resposta vigente do portal.
    pub aplicavel_a_partir_de: Option<String>,
    pub pode_aplicar: bool,
    /// Resposta do Portal do Cliente: o servidor efetiva sozinho ao fim do prazo.
    pub efetivacao_automatica: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkDecisaoOrcamentoCriado {
    pub url: String,
    pub expires_at: String,
    pub versao: i32,
}

fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn decision_url(token: &str) -> String {
    format!("{}/#/o/{}", DECISION_BASE_URL, token)
}

/// Respostas dadas pelo próprio cliente (link de decisão ou Portal do Cliente) têm prazo de correção.
fn is_portal_origin(origem: &str) -> bool {
    matches!(origem, "PORTAL" | "PORTAL_CLIENTE")
}

fn is_final_decision(decisao: &str) -> bool {
    matches!(decisao, "APROVAR" | "RECUSAR")
}

fn decision_matches(decisao: &str, aprovado: bool) -> bool {
    (decisao == "APROVAR") == aprovado
}

fn decision_label(decisao: &str) -> &'static str {
    match decisao {
        "APROVAR" => "aprovou",
        "RECUSAR" => "recusou",
        _ => "retirou a resposta",
    }
}

/// Um item da janela mínima: o operador só aplica uma resposta do portal depois dela.
fn correction_window_end(
    registered_at: DateTime<Utc>,
    window_minutes: i32,
) -> DateTime<Utc> {
    registered_at + Duration::minutes(i64::from(window_minutes.max(MIN_CORRECTION_WINDOW_MINUTES)))
}

async fn correction_window_minutes(
    tx: &mut Transaction<'_, Postgres>,
) -> Result<i32, String> {
    let minutes: Option<i32> = sqlx::query_scalar(
        "SELECT janela_correcao_minutos FROM public.orcamento_aceite_config WHERE singleton = TRUE",
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    Ok(minutes.unwrap_or(MIN_CORRECTION_WINDOW_MINUTES).max(MIN_CORRECTION_WINDOW_MINUTES))
}

pub(crate) struct VersaoCongelada {
    pub id: i64,
    pub numero: i32,
    pub valido_ate: Option<DateTime<Utc>>,
}

/// Congela o orçamento atual. Se a versão aberta já tem exatamente este conteúdo (reenvio),
/// ela é reaproveitada e os links e envios existentes continuam valendo; se o orçamento mudou,
/// as versões abertas anteriores são encerradas (revogando seus links) e uma nova é criada.
/// Deve rodar com o equipamento bloqueado (`FOR UPDATE`) na transação.
pub(crate) async fn obter_ou_criar_versao(
    tx: &mut Transaction<'_, Postgres>,
    empresa_id: i32,
    equipamento_id: i32,
    profile_id: i32,
) -> Result<VersaoCongelada, String> {
    let equipamento = sqlx::query(
        "SELECT COALESCE(status, '') AS status, tipo, marca, modelo,
                valor_orcamento::FLOAT8 AS valor_orcamento, prazo_aprovacao
         FROM equipamentos
         WHERE id = $1 AND empresa_id = $2
         FOR UPDATE",
    )
    .bind(equipamento_id)
    .bind(empresa_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?
    .ok_or_else(|| "Equipamento não encontrado na empresa do perfil ativo.".to_string())?;

    let status: String = equipamento.try_get("status").map_err(super::operator_errors::mapear_erro_sql)?;
    if status != "AGUARDANDO_APROVACAO" {
        return Err("Somente orçamentos aguardando aprovação podem receber uma resposta do cliente.".to_string());
    }
    let tipo: Option<String> = equipamento.try_get("tipo").map_err(super::operator_errors::mapear_erro_sql)?;
    let marca: Option<String> = equipamento.try_get("marca").map_err(super::operator_errors::mapear_erro_sql)?;
    let modelo: Option<String> = equipamento.try_get("modelo").map_err(super::operator_errors::mapear_erro_sql)?;
    let valor_equipamento: Option<f64> = equipamento
        .try_get("valor_orcamento")
        .map_err(super::operator_errors::mapear_erro_sql)?;
    let prazo: Option<String> = equipamento
        .try_get("prazo_aprovacao")
        .map_err(super::operator_errors::mapear_erro_sql)?;

    let verificacao = sqlx::query(
        "SELECT id, servicos_necessarios, pecas_necessarias, custo_total::FLOAT8 AS custo_total
         FROM verificacoes
         WHERE equipamento_id = $1 AND (empresa_id = $2 OR empresa_id IS NULL)
         ORDER BY (empresa_id = $2) DESC, id DESC
         LIMIT 1
         FOR UPDATE",
    )
    .bind(equipamento_id)
    .bind(empresa_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?
    .ok_or_else(|| "Não há verificação técnica para montar o orçamento.".to_string())?;

    let verificacao_id: i32 = verificacao.try_get("id").map_err(super::operator_errors::mapear_erro_sql)?;
    let servicos_json: Option<String> = verificacao
        .try_get("servicos_necessarios")
        .map_err(super::operator_errors::mapear_erro_sql)?;
    let pecas_json: Option<String> = verificacao
        .try_get("pecas_necessarias")
        .map_err(super::operator_errors::mapear_erro_sql)?;
    let custo_total: Option<f64> = verificacao
        .try_get("custo_total")
        .map_err(super::operator_errors::mapear_erro_sql)?;

    let servicos = normalizar_servicos(servicos_json.as_deref().unwrap_or("[]"))?;
    let pecas: serde_json::Value =
        serde_json::from_str(pecas_json.as_deref().unwrap_or("[]"))
            .map_err(|_| "Peças do orçamento inválidas.".to_string())?;

    let total = valor_equipamento
        .filter(|value| *value > 0.0)
        .or(custo_total.filter(|value| *value > 0.0))
        .ok_or_else(|| "O orçamento precisa ter um valor maior que zero para ser enviado.".to_string())?;
    if !total.is_finite() {
        return Err("Valor do orçamento inválido.".to_string());
    }

    let snapshot = serde_json::json!({
        "equipamento": { "tipo": tipo, "marca": marca, "modelo": modelo },
        "servicos": servicos,
        "pecas": pecas,
        "valorTotal": total,
        "prazoAprovacao": prazo,
    });

    // Fim do dia do prazo informado, quando ele está em formato de data.
    let valido_ate: Option<DateTime<Utc>> = sqlx::query_scalar(
        "SELECT CASE WHEN $1::TEXT ~ '^\\d{4}-\\d{2}-\\d{2}'
                     THEN ((left($1::TEXT, 10))::DATE + 1)::TIMESTAMPTZ
                END",
    )
    .bind(prazo.as_deref())
    .fetch_one(&mut **tx)
    .await
    .map_err(|_| "Prazo de aprovação inválido.".to_string())?;
    if valido_ate.is_some_and(|limit| limit <= Utc::now()) {
        return Err("O prazo de aprovação do orçamento já terminou. Atualize o prazo antes de enviar.".to_string());
    }

    let snapshot_texto = snapshot.to_string();
    let existente: Option<(i64, i32, Option<DateTime<Utc>>)> = sqlx::query_as(
        "SELECT id, versao, valido_ate
         FROM orcamento_versoes
         WHERE equipamento_id = $1 AND empresa_id = $2 AND encerrada_em IS NULL
           AND verificacao_id IS NOT DISTINCT FROM $3
           AND snapshot = $4::TEXT::JSONB
           AND valor_total = ROUND($5::FLOAT8::NUMERIC, 2)
           AND valido_ate IS NOT DISTINCT FROM $6
         ORDER BY versao DESC
         LIMIT 1",
    )
    .bind(equipamento_id)
    .bind(empresa_id)
    .bind(verificacao_id)
    .bind(&snapshot_texto)
    .bind(total)
    .bind(valido_ate)
    .fetch_optional(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    if let Some((id, numero, valido_ate)) = existente {
        return Ok(VersaoCongelada { id, numero, valido_ate });
    }

    sqlx::query("SELECT public.autoos_encerrar_orcamento_versoes($1, 'NOVA_VERSAO')")
        .bind(equipamento_id)
        .execute(&mut **tx)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;

    let numero: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(versao), 0) + 1 FROM orcamento_versoes WHERE equipamento_id = $1",
    )
    .bind(equipamento_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    let id: i64 = sqlx::query_scalar(
        "INSERT INTO orcamento_versoes
            (empresa_id, equipamento_id, verificacao_id, versao, snapshot,
             valor_total, valido_ate, criado_por_profile_id)
         VALUES ($1, $2, $3, $4, $5::TEXT::JSONB, ROUND($6::FLOAT8::NUMERIC, 2), $7, $8)
         RETURNING id",
    )
    .bind(empresa_id)
    .bind(equipamento_id)
    .bind(verificacao_id)
    .bind(numero)
    .bind(&snapshot_texto)
    .bind(total)
    .bind(valido_ate)
    .bind(profile_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    Ok(VersaoCongelada { id, numero, valido_ate })
}

async fn aceite_online_ativo(pool: &PgPool) -> Result<bool, String> {
    let enabled: Option<bool> = sqlx::query_scalar(
        "SELECT online_enabled FROM public.orcamento_aceite_config WHERE singleton = TRUE",
    )
    .fetch_optional(pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    Ok(enabled.unwrap_or(false))
}

fn resposta_from_row(row: &sqlx::postgres::PgRow) -> Result<RespostaOrcamentoInfo, String> {
    let map = super::operator_errors::mapear_erro_sql;
    Ok(RespostaOrcamentoInfo {
        id: row.try_get("id").map_err(map)?,
        origem: row.try_get("origem").map_err(map)?,
        decisao: row.try_get("decisao").map_err(map)?,
        registrada_em: row.try_get("registrada_em").map_err(map)?,
        registrada_por: row.try_get("registrada_por").map_err(map)?,
        motivo: row.try_get("motivo").map_err(map)?,
        aplicada_em: row.try_get("aplicada_em").map_err(map)?,
        contato: row.try_get("contato").map_err(map)?,
        aplicada_pelo_sistema: row.try_get("aplicada_pelo_sistema").map_err(map)?,
        efetivacao_erro: row.try_get("efetivacao_erro").map_err(map)?,
        efetivacao_falhou_em: row.try_get("efetivacao_falhou_em").map_err(map)?,
    })
}

/// Estado do aceite do orçamento: versão mais recente, link, resposta vigente e histórico.
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn obter_decisao_orcamento(
    equipamento_id: i32,
) -> Result<Option<DecisaoOrcamentoInfo>, String> {
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let map = super::operator_errors::mapear_erro_sql;
    let ativo = aceite_online_ativo(&pool).await?;

    let versao = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT v.id, v.versao, v.valor_total::FLOAT8 AS valor_total,
                to_char(v.valido_ate AT TIME ZONE 'UTC', '{TS_FMT}') AS valido_ate,
                to_char(v.criado_em AT TIME ZONE 'UTC', '{TS_FMT}') AS criado_em,
                v.encerrada_motivo,
                (v.encerrada_em IS NULL) AS aberta,
                l.revogado_em IS NOT NULL AS link_revogado,
                (l.expira_em <= NOW()) AS link_expirado,
                to_char(l.expira_em AT TIME ZONE 'UTC', '{TS_FMT}') AS link_expira_em,
                (l.id IS NOT NULL) AS tem_link
         FROM orcamento_versoes v
         LEFT JOIN LATERAL (
             SELECT * FROM orcamento_links_decisao
             WHERE versao_id = v.id ORDER BY id DESC LIMIT 1
         ) l ON TRUE
         WHERE v.equipamento_id = $1 AND v.empresa_id = $2
         ORDER BY v.versao DESC
         LIMIT 1"
    )))
    .bind(equipamento_id)
    .bind(empresa_id)
    .fetch_optional(&pool)
    .await
    .map_err(map)?;
    let Some(versao) = versao else { return Ok(None) };

    let versao_id: i64 = versao.try_get("id").map_err(map)?;
    let aberta: bool = versao.try_get("aberta").map_err(map)?;
    let tem_link: bool = versao.try_get("tem_link").map_err(map)?;
    let link_status = if !tem_link {
        None
    } else if versao.try_get::<bool, _>("link_revogado").map_err(map)? {
        Some("revogado".to_string())
    } else if versao.try_get::<bool, _>("link_expirado").map_err(map)? {
        Some("expirado".to_string())
    } else {
        Some("ativo".to_string())
    };

    let rows = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT r.id, r.origem, r.decisao,
                to_char(r.registrada_em AT TIME ZONE 'UTC', '{TS_FMT}') AS registrada_em,
                p.nome AS registrada_por, r.motivo,
                to_char(r.aplicada_em AT TIME ZONE 'UTC', '{TS_FMT}') AS aplicada_em,
                r.contato_nome AS contato, r.aplicada_pelo_sistema, r.efetivacao_erro,
                to_char(r.efetivacao_falhou_em AT TIME ZONE 'UTC', '{TS_FMT}') AS efetivacao_falhou_em
         FROM orcamento_respostas r
         LEFT JOIN security_profiles p ON p.id = r.registrada_por_profile_id
         WHERE r.versao_id = $1 AND r.empresa_id = $2
         ORDER BY r.id DESC"
    )))
    .bind(versao_id)
    .bind(empresa_id)
    .fetch_all(&pool)
    .await
    .map_err(map)?;
    let mut historico = Vec::with_capacity(rows.len());
    for row in &rows {
        historico.push(resposta_from_row(row)?);
    }

    let solicitacao_rows = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT id, tipo, mensagem,
                to_char(criado_em AT TIME ZONE 'UTC', '{TS_FMT}') AS criada_em,
                to_char(tratado_em AT TIME ZONE 'UTC', '{TS_FMT}') AS tratada_em,
                contato_nome AS contato
         FROM orcamento_solicitacoes
         WHERE versao_id = $1 AND empresa_id = $2
         ORDER BY id DESC
         LIMIT 20"
    )))
    .bind(versao_id)
    .bind(empresa_id)
    .fetch_all(&pool)
    .await
    .map_err(map)?;
    let mut solicitacoes = Vec::with_capacity(solicitacao_rows.len());
    for row in &solicitacao_rows {
        solicitacoes.push(SolicitacaoOrcamentoInfo {
            id: row.try_get("id").map_err(map)?,
            tipo: row.try_get("tipo").map_err(map)?,
            mensagem: row.try_get("mensagem").map_err(map)?,
            criada_em: row.try_get("criada_em").map_err(map)?,
            tratada_em: row.try_get("tratada_em").map_err(map)?,
            contato: row.try_get("contato").map_err(map)?,
        });
    }

    let janela: i32 = sqlx::query_scalar(
        "SELECT janela_correcao_minutos FROM public.orcamento_aceite_config WHERE singleton = TRUE",
    )
    .fetch_optional(&pool)
    .await
    .map_err(map)?
    .unwrap_or(MIN_CORRECTION_WINDOW_MINUTES);

    let atual = historico.first();
    let aplicavel_a_partir_de = atual
        .filter(|resposta| is_portal_origin(&resposta.origem) && is_final_decision(&resposta.decisao))
        .and_then(|resposta| DateTime::parse_from_rfc3339(&resposta.registrada_em).ok())
        .map(|registered| correction_window_end(registered.with_timezone(&Utc), janela));
    let pode_aplicar = aberta
        && atual.is_some_and(|resposta| {
            is_final_decision(&resposta.decisao) && resposta.aplicada_em.is_none()
        })
        && aplicavel_a_partir_de.is_none_or(|limit| limit <= Utc::now());

    Ok(Some(DecisaoOrcamentoInfo {
        versao_id,
        versao: versao.try_get("versao").map_err(map)?,
        valor_total: versao.try_get("valor_total").map_err(map)?,
        valido_ate: versao.try_get("valido_ate").map_err(map)?,
        criada_em: versao.try_get("criado_em").map_err(map)?,
        encerrada_motivo: versao.try_get("encerrada_motivo").map_err(map)?,
        aceite_online_ativo: ativo,
        link_status,
        link_expira_em: versao.try_get("link_expira_em").map_err(map)?,
        efetivacao_automatica: atual.is_some_and(|resposta| {
            resposta.origem == "PORTAL_CLIENTE"
                && is_final_decision(&resposta.decisao)
                && resposta.aplicada_em.is_none()
                && resposta.efetivacao_falhou_em.is_none()
        }),
        resposta: historico.first().map(|r| RespostaOrcamentoInfo {
            id: r.id,
            origem: r.origem.clone(),
            decisao: r.decisao.clone(),
            registrada_em: r.registrada_em.clone(),
            registrada_por: r.registrada_por.clone(),
            motivo: r.motivo.clone(),
            aplicada_em: r.aplicada_em.clone(),
            contato: r.contato.clone(),
            aplicada_pelo_sistema: r.aplicada_pelo_sistema,
            efetivacao_erro: r.efetivacao_erro.clone(),
            efetivacao_falhou_em: r.efetivacao_falhou_em.clone(),
        }),
        historico,
        solicitacoes,
        aplicavel_a_partir_de: aplicavel_a_partir_de.map(|limit| limit.to_rfc3339()),
        pode_aplicar,
    }))
}

pub(crate) struct LinkEmitido {
    pub link_id: i64,
    pub token: String,
    pub expires_at: DateTime<Utc>,
    pub versao: VersaoCongelada,
}

/// Chave de ativação do aceite online (`FOR SHARE` para não mudar durante a emissão).
pub(crate) async fn exigir_aceite_online(tx: &mut Transaction<'_, Postgres>) -> Result<(), String> {
    let enabled: bool = sqlx::query_scalar(
        "SELECT online_enabled FROM public.orcamento_aceite_config WHERE singleton = TRUE FOR SHARE",
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?
    .unwrap_or(false);
    if enabled {
        Ok(())
    } else {
        Err("O aceite online de orçamento ainda não foi ativado.".to_string())
    }
}

/// Emite um token novo para a versão congelada atual. `revogar_anteriores` encerra os outros links
/// da mesma versão (gesto explícito do operador); o envio automático nunca revoga, porque o link
/// de uma tentativa de resultado incerto pode já estar com o cliente.
pub(crate) async fn emitir_link_decisao(
    tx: &mut Transaction<'_, Postgres>,
    empresa_id: i32,
    equipamento_id: i32,
    profile_id: i32,
    revogar_anteriores: bool,
) -> Result<LinkEmitido, String> {
    let versao = obter_ou_criar_versao(tx, empresa_id, equipamento_id, profile_id).await?;

    if revogar_anteriores {
        sqlx::query(
            "UPDATE orcamento_links_decisao
             SET revogado_em = NOW(), revogado_motivo = 'SUBSTITUIDO_PELA_EQUIPE', revogado_por_profile_id = $2
             WHERE versao_id = $1 AND revogado_em IS NULL",
        )
        .bind(versao.id)
        .bind(profile_id)
        .execute(&mut **tx)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
    }

    let mut token_bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut token_bytes);
    let token = hex::encode(token_bytes);
    let max_expiry = Utc::now() + Duration::days(LINK_MAX_AGE_DAYS);
    let expires_at = versao.valido_ate.map_or(max_expiry, |limit| limit.min(max_expiry));

    let link_id: i64 = sqlx::query_scalar(
        "INSERT INTO orcamento_links_decisao
            (empresa_id, equipamento_id, versao_id, token_hash, expira_em, criado_por_profile_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id",
    )
    .bind(empresa_id)
    .bind(equipamento_id)
    .bind(versao.id)
    .bind(hash_token(&token))
    .bind(expires_at)
    .bind(profile_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    Ok(LinkEmitido { link_id, token, expires_at, versao })
}

pub(crate) fn url_decisao(token: &str) -> String {
    decision_url(token)
}

/// Congela o orçamento e emite o link próprio da decisão (o link anterior da mesma versão é encerrado).
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn criar_link_decisao_orcamento(
    equipamento_id: i32,
) -> Result<LinkDecisaoOrcamentoCriado, String> {
    let actor = require_permission(PERMISSION_MANAGE_STATUS_LINKS)?;
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = pool.begin().await.map_err(super::operator_errors::mapear_erro_sql)?;

    exigir_aceite_online(&mut tx).await?;
    let emitido = emitir_link_decisao(&mut tx, empresa_id, equipamento_id, actor.id, true).await?;
    let versao = emitido.versao;
    let token = emitido.token;
    let expires_at = emitido.expires_at;

    tx.commit().await.map_err(super::operator_errors::mapear_erro_sql)?;

    record_security_event(
        "BUDGET_DECISION_LINK_CREATED",
        Some(&actor),
        format!("equipamento_id={}; versao={}", equipamento_id, versao.numero),
        true,
    )
    .await;

    Ok(LinkDecisaoOrcamentoCriado {
        url: decision_url(&token),
        expires_at: expires_at.to_rfc3339(),
        versao: versao.numero,
    })
}

/// Encerra o link de decisão sem apagar a versão nem o histórico.
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn revogar_link_decisao_orcamento(equipamento_id: i32) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_MANAGE_STATUS_LINKS)?;
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = pool.begin().await.map_err(super::operator_errors::mapear_erro_sql)?;

    sqlx::query("SELECT id FROM equipamentos WHERE id = $1 AND empresa_id = $2 FOR UPDATE")
        .bind(equipamento_id)
        .bind(empresa_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?
        .ok_or_else(|| "Equipamento não encontrado na empresa do perfil ativo.".to_string())?;

    let revoked = sqlx::query(
        "UPDATE orcamento_links_decisao
         SET revogado_em = NOW(), revogado_motivo = 'REVOGADO_PELA_EQUIPE', revogado_por_profile_id = $3
         WHERE empresa_id = $1 AND equipamento_id = $2 AND revogado_em IS NULL",
    )
    .bind(empresa_id)
    .bind(equipamento_id)
    .bind(actor.id)
    .execute(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?
    .rows_affected();
    tx.commit().await.map_err(super::operator_errors::mapear_erro_sql)?;

    if revoked > 0 {
        record_security_event(
            "BUDGET_DECISION_LINK_REVOKED",
            Some(&actor),
            format!("equipamento_id={}; links_revogados={}", equipamento_id, revoked),
            true,
        )
        .await;
    }
    Ok(revoked > 0)
}

/// Marca uma dúvida ou pedido de mudança do cliente como tratado pela equipe.
#[tauri::command]
#[instrument(skip_all, fields(solicitacao_id = solicitacao_id))]
pub async fn marcar_solicitacao_orcamento_tratada(solicitacao_id: i64) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_MANAGE_STATUS_LINKS)?;
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let updated = sqlx::query(
        "UPDATE orcamento_solicitacoes
         SET tratado_em = NOW(), tratado_por_profile_id = $3
         WHERE id = $1 AND empresa_id = $2 AND tratado_em IS NULL",
    )
    .bind(solicitacao_id)
    .bind(empresa_id)
    .bind(actor.id)
    .execute(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?
    .rows_affected();
    Ok(updated > 0)
}

/// Conferência feita dentro da transação de `aprovar_orcamento`.
///
/// Sem resposta registrada, a aprovação segue como hoje. Havendo resposta pendente, ela só
/// pode ser aplicada após a janela de correção e se a tela do operador estiver atualizada;
/// uma decisão diferente da do cliente exige motivo explícito. Marca a resposta como aplicada.
pub(crate) async fn conferir_e_aplicar_resposta(
    tx: &mut Transaction<'_, Postgres>,
    empresa_id: i32,
    equipamento_id: i32,
    aprovado: bool,
    resposta_esperada_id: Option<i64>,
    motivo_divergencia: Option<&str>,
    profile_id: i32,
) -> Result<(), String> {
    let map = super::operator_errors::mapear_erro_sql;
    // Trava a versão: serializa com `registrar_resposta_orcamento`, que usa o mesmo bloqueio.
    let versao: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM orcamento_versoes
         WHERE equipamento_id = $1 AND empresa_id = $2 AND encerrada_em IS NULL
         ORDER BY versao DESC LIMIT 1
         FOR UPDATE",
    )
    .bind(equipamento_id)
    .bind(empresa_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map)?;
    let atual_id_esperado = resposta_esperada_id.unwrap_or(0);

    let Some(versao_id) = versao else {
        if atual_id_esperado != 0 {
            return Err("O orçamento foi alterado depois que esta tela foi aberta. Recarregue e confira a resposta do cliente.".to_string());
        }
        return Ok(());
    };

    let atual = sqlx::query(
        "SELECT id, origem, decisao, registrada_em
         FROM orcamento_respostas
         WHERE versao_id = $1
         ORDER BY id DESC LIMIT 1",
    )
    .bind(versao_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map)?;
    let atual_id: i64 = atual.as_ref().map(|row| row.try_get("id")).transpose().map_err(map)?.unwrap_or(0);
    if atual_id != atual_id_esperado {
        return Err("O cliente alterou a resposta depois que esta tela foi aberta. Recarregue e confira antes de aplicar.".to_string());
    }
    let Some(atual) = atual else { return Ok(()) };
    let decisao: String = atual.try_get("decisao").map_err(map)?;
    if !is_final_decision(&decisao) {
        return Ok(());
    }
    let origem: String = atual.try_get("origem").map_err(map)?;
    let registrada_em: DateTime<Utc> = atual.try_get("registrada_em").map_err(map)?;

    if is_portal_origin(&origem) {
        let janela = correction_window_minutes(tx).await?;
        let limite = correction_window_end(registrada_em, janela);
        if limite > Utc::now() {
            return Err(format!(
                "O cliente respondeu há pouco e ainda pode corrigir a resposta. Aguarde até {} (UTC) para aplicar.",
                limite.format("%H:%M")
            ));
        }
    }
    if !decision_matches(&decisao, aprovado) {
        let has_reason = motivo_divergencia.is_some_and(|text| text.trim().len() >= 5);
        if !has_reason {
            return Err(format!(
                "O cliente {} este orçamento. Para aplicar outra decisão, informe o motivo da correção.",
                decision_label(&decisao)
            ));
        }
    }

    sqlx::query(
        "UPDATE orcamento_respostas SET aplicada_em = NOW(), aplicada_por_profile_id = $2 WHERE id = $1",
    )
    .bind(atual_id)
    .bind(profile_id)
    .execute(&mut **tx)
    .await
    .map_err(map)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn correction_window_never_drops_below_fifteen_minutes() {
        let now = Utc::now();
        assert_eq!(correction_window_end(now, 1), now + Duration::minutes(15));
        assert_eq!(correction_window_end(now, 30), now + Duration::minutes(30));
    }

    #[test]
    fn portal_client_answers_have_the_correction_window() {
        assert!(is_portal_origin("PORTAL"));
        assert!(is_portal_origin("PORTAL_CLIENTE"));
        assert!(!is_portal_origin("EQUIPE"));
    }

    #[test]
    fn only_approve_and_refuse_can_be_applied() {
        assert!(is_final_decision("APROVAR"));
        assert!(is_final_decision("RECUSAR"));
        assert!(!is_final_decision("DESFEITA"));
    }

    #[test]
    fn decision_must_match_operator_action() {
        assert!(decision_matches("APROVAR", true));
        assert!(decision_matches("RECUSAR", false));
        assert!(!decision_matches("APROVAR", false));
        assert!(!decision_matches("RECUSAR", true));
    }

    #[test]
    fn decision_link_uses_its_own_route_and_hashes_the_token() {
        let token = "a".repeat(64);
        assert_eq!(decision_url(&token), format!("https://status.bmitag.com.br/#/o/{token}"));
        assert_eq!(hash_token(&token).len(), 64);
        assert_ne!(hash_token(&token), token);
    }
}
