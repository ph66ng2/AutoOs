//! Orçamento respondido pelo cliente no Portal do Cliente: versões congeladas, consulta da
//! resposta para o desktop e conferência dentro de `aprovar_orcamento`.
//!
//! O antigo link de decisão individual (`#/o/<token>`) foi removido: o cliente responde pelo
//! portal com login (CPF/CNPJ + senha ou código).

use crate::commands::auth::{
    require_active_session_company_id, require_permission, PERMISSION_MANAGE_STATUS_LINKS,
};
use crate::commands::orcamento_estoque::normalizar_servicos;
use crate::db::get_pool;
use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use sqlx::{PgPool, Postgres, Row, Transaction};
use tracing::instrument;

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
    /// Respostas pelo portal ligadas para a empresa (`portal_config_empresa`).
    pub aceite_online_ativo: bool,
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

/// Respostas dadas pelo próprio cliente têm prazo de correção. `PORTAL` é a origem do antigo
/// link de decisão, mantida para o histórico.
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

/// Respostas pelo portal ligadas para a empresa (exige também o portal ligado).
async fn aceite_online_ativo(pool: &PgPool, empresa_id: i32) -> Result<bool, String> {
    let enabled: Option<bool> = sqlx::query_scalar("SELECT public.autoos_portal_respostas_ligadas($1)")
    .bind(empresa_id)
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
    let ativo = aceite_online_ativo(&pool, empresa_id).await?;

    let versao = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT v.id, v.versao, v.valor_total::FLOAT8 AS valor_total,
                to_char(v.valido_ate AT TIME ZONE 'UTC', '{TS_FMT}') AS valido_ate,
                to_char(v.criado_em AT TIME ZONE 'UTC', '{TS_FMT}') AS criado_em,
                v.encerrada_motivo,
                (v.encerrada_em IS NULL) AS aberta
         FROM orcamento_versoes v
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
    // Trava a versão: serializa com `portal_registrar_resposta`, que usa o mesmo bloqueio.
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
                "O cliente respondeu há pouco e ainda pode corrigir a resposta. Aguarde até {} para aplicar.",
                horario_brasilia(limite)
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

/// Horário de Brasília (UTC−3, sem horário de verão desde 2019), como nos alertas do portal.
fn horario_brasilia(instante: DateTime<Utc>) -> String {
    let brasilia = chrono::FixedOffset::west_opt(3 * 3600).expect("offset fixo válido");
    instante.with_timezone(&brasilia).format("%H:%M").to_string()
}

#[cfg(test)]
mod tests {
    #[test]
    fn prazo_de_correcao_aparece_no_horario_de_brasilia() {
        let instante = DateTime::parse_from_rfc3339("2026-10-16T17:15:00Z").unwrap().with_timezone(&Utc);
        assert_eq!(horario_brasilia(instante), "14:15");
    }

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
}
