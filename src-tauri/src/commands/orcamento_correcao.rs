//! Correção guiada da decisão de um orçamento já aplicado.
//!
//! "Mudar Status" só troca o rótulo da etapa. Uma aprovação também grava pagamento, reescreve
//! serviços e pode baixar peças; por isso a correção confere o que aconteceu e desfaz tudo
//! junto, ou recusa quando o atendimento já passou da decisão.
//!
//! Há dois modos. "Restaurar" devolve a versão enviada ao cliente. "Manter" desfaz só a decisão
//! e conserva serviços, peças e valor atuais; serve para orçamento ajustado depois da aprovação,
//! cujo ajuste se perderia com a restauração.

use crate::commands::auth::{
    record_security_event, require_active_session_company_id, require_permission,
    SecurityProfileSummary, PERMISSION_FINANCIAL_ACTIONS,
};
use crate::commands::types::EquipamentoRow;
use crate::db::get_pool;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Postgres, Row, Transaction};
use tracing::instrument;

const MIN_REASON_CHARS: usize = 5;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PecaBaixadaInfo {
    pub produto_id: i32,
    pub nome: String,
    pub quantidade: i32,
}

/// O que fazer com serviços, peças e valor ao reabrir o orçamento.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ModoCorrecao {
    /// Volta à versão enviada ao cliente (perde ajustes feitos depois da decisão).
    #[default]
    RestaurarOriginal,
    /// Desfaz só a decisão e mantém serviços, peças e valor atuais.
    ManterAtual,
}

impl ModoCorrecao {
    fn rotulo(self) -> &'static str {
        match self {
            Self::RestaurarOriginal => "restaurou o orçamento enviado ao cliente",
            Self::ManterAtual => "manteve o orçamento atual",
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnaliseCorrecaoDecisao {
    pub status: String,
    pub pode_corrigir: bool,
    /// Motivos que impedem a correção; vazio quando a decisão pode ser corrigida.
    pub bloqueios: Vec<String>,
    /// O orçamento foi alterado depois da aprovação ou recusa (ajuste anterior à decisão não conta).
    pub ajustado_apos_decisao: bool,
    pub permite_restaurar: bool,
    pub permite_manter: bool,
    pub pagamento_codigo: Option<String>,
    pub pagamento_detalhe: Option<String>,
    pub valor_atual: Option<f64>,
    pub valor_original: Option<f64>,
    pub pecas_baixadas: Vec<PecaBaixadaInfo>,
    pub total_baixado: i32,
    /// Quando há peças baixadas, o operador precisa decidir de forma explícita sobre o estoque.
    pub exige_decisao_estoque: bool,
}

#[derive(Debug, Deserialize)]
pub struct CorrigirDecisaoInput {
    pub equipamento_id: i32,
    pub expected_updated_em: String,
    pub motivo: String,
    /// Confirma que as peças baixadas voltam fisicamente ao estoque (gera entrada de estoque).
    #[serde(default)]
    pub devolver_estoque: bool,
    #[serde(default)]
    pub modo: ModoCorrecao,
}

/// Data de decisão gravada como texto (`NOW()::TEXT`, mas também formatos legados).
const DATA_TEXTO_LEGIVEL: &str =
    r"^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}(:?\d{2})?|Z)?)?$";

struct Contexto {
    status: String,
    verificacao_id: i32,
    pagamento_codigo: Option<String>,
    pagamento_detalhe: Option<String>,
    valor_atual: Option<f64>,
    valor_original: Option<f64>,
    tem_original: bool,
    ajustada_depois: bool,
}

/// Só o ajuste posterior à decisão conta. Sem data de decisão legível, na dúvida conta como
/// ajustado, para oferecer a opção que não perde o orçamento atual.
fn ajustado_apos_decisao(ajuste: Option<DateTime<Utc>>, decisao: Option<DateTime<Utc>>) -> bool {
    match (ajuste, decisao) {
        (None, _) => false,
        (Some(_), None) => true,
        (Some(ajuste), Some(decisao)) => ajuste > decisao,
    }
}

/// Bloqueios independentes do modo e do estoque. Lista vazia = a decisão pode ser corrigida.
fn bloqueios_de(contexto: &Contexto) -> Vec<String> {
    match contexto.status.as_str() {
        "APROVADO" | "REPROVADO" => Vec::new(),
        "AGUARDANDO_APROVACAO" => vec![
            "O orçamento já está aguardando aprovação, então não há decisão para corrigir.".to_string(),
        ],
        outra => vec![format!(
            "O atendimento já passou da decisão (etapa atual: {outra}). Só dá para corrigir enquanto o orçamento está Aprovado ou Reprovado, porque depois o serviço pode ter começado e as peças podem ter sido usadas. Se for preciso voltar, use Mudar Status e confira o estoque das peças."
        )],
    }
}

/// A restauração precisa da versão enviada ao cliente.
fn permite_restaurar(contexto: &Contexto) -> bool {
    contexto.tem_original
}

/// Manter o orçamento atual só faz sentido se há ajuste a preservar (ou nada a restaurar).
fn permite_manter(contexto: &Contexto) -> bool {
    contexto.ajustada_depois || !contexto.tem_original
}

fn modo_permitido(contexto: &Contexto, modo: ModoCorrecao) -> Result<(), String> {
    match modo {
        ModoCorrecao::RestaurarOriginal if !permite_restaurar(contexto) => Err(
            "Este orçamento não guardou a versão enviada ao cliente, então não dá para restaurá-la. Escolha voltar para aguardando aprovação mantendo o orçamento atual.".to_string(),
        ),
        ModoCorrecao::ManterAtual if !permite_manter(contexto) => Err(
            "O orçamento não foi alterado depois da decisão. Use a opção de restaurar o orçamento enviado ao cliente.".to_string(),
        ),
        _ => Ok(()),
    }
}

fn motivo_valido(motivo: &str) -> bool {
    motivo.trim().chars().count() >= MIN_REASON_CHARS
}

async fn carregar_contexto(
    tx: &mut Transaction<'_, Postgres>,
    empresa_id: i32,
    equipamento_id: i32,
    lock: bool,
) -> Result<Contexto, String> {
    let map = super::operator_errors::mapear_erro_sql;
    let sufixo = if lock { " FOR UPDATE" } else { "" };
    let status: String = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT COALESCE(status, '') FROM equipamentos WHERE id = $1 AND empresa_id = $2{sufixo}"
    )))
    .bind(equipamento_id)
    .bind(empresa_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map)?
    .ok_or_else(|| "Equipamento não encontrado na empresa do perfil ativo.".to_string())?;

    // `adjusted_at` é regravado a cada ajuste de serviços (inclusive antes da decisão) e nunca
    // limpo; só vale comparado à data da decisão, que fica em texto e pode ser legada.
    let coluna_decisao = if status == "REPROVADO" { "data_reprovacao" } else { "data_aprovacao" };
    let verificacao = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT v.id, v.forma_pagamento_codigo, v.forma_pagamento_detalhe,
                v.custo_total::FLOAT8 AS custo_total,
                v.valor_orcamento_original::FLOAT8 AS valor_original,
                (v.servicos_orcamento_original IS NOT NULL AND v.valor_orcamento_original IS NOT NULL) AS tem_original,
                v.adjusted_at::TIMESTAMPTZ AS ajustada_em,
                (SELECT CASE WHEN e.{coluna_decisao} ~ $3 THEN e.{coluna_decisao}::TIMESTAMPTZ END
                   FROM equipamentos e WHERE e.id = v.equipamento_id) AS decidida_em
         FROM verificacoes v
         WHERE v.equipamento_id = $1 AND v.empresa_id = $2
         ORDER BY v.id DESC LIMIT 1{sufixo}"
    )))
    .bind(equipamento_id)
    .bind(empresa_id)
    .bind(DATA_TEXTO_LEGIVEL)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map)?
    .ok_or_else(|| "Não há verificação técnica vinculada a este orçamento.".to_string())?;

    Ok(Contexto {
        status,
        verificacao_id: verificacao.try_get("id").map_err(map)?,
        pagamento_codigo: verificacao.try_get("forma_pagamento_codigo").map_err(map)?,
        pagamento_detalhe: verificacao.try_get("forma_pagamento_detalhe").map_err(map)?,
        valor_atual: verificacao.try_get("custo_total").map_err(map)?,
        valor_original: verificacao.try_get("valor_original").map_err(map)?,
        tem_original: verificacao.try_get("tem_original").map_err(map)?,
        ajustada_depois: ajustado_apos_decisao(
            verificacao.try_get("ajustada_em").map_err(map)?,
            verificacao.try_get("decidida_em").map_err(map)?,
        ),
    })
}

pub(crate) async fn pecas_baixadas(
    tx: &mut Transaction<'_, Postgres>,
    empresa_id: i32,
    verificacao_id: i32,
) -> Result<Vec<PecaBaixadaInfo>, String> {
    sqlx::query_as::<_, PecaBaixadaInfo>(
        "SELECT c.produto_id, p.nome, SUM(c.quantidade_baixada)::INTEGER AS quantidade
         FROM orcamento_consumos c
         JOIN produtos p ON p.id = c.produto_id AND p.empresa_id = c.empresa_id
         WHERE c.verificacao_id = $1 AND c.empresa_id = $2 AND c.quantidade_baixada > 0
         GROUP BY c.produto_id, p.nome
         ORDER BY p.nome",
    )
    .bind(verificacao_id)
    .bind(empresa_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)
}

/// Mostra o que a aprovação fez (pagamento, valores e peças baixadas) e se dá para corrigir.
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn analisar_correcao_decisao(equipamento_id: i32) -> Result<AnaliseCorrecaoDecisao, String> {
    require_permission(PERMISSION_FINANCIAL_ACTIONS)?;
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = pool.begin().await.map_err(super::operator_errors::mapear_erro_sql)?;
    let contexto = carregar_contexto(&mut tx, empresa_id, equipamento_id, false).await?;
    let pecas = pecas_baixadas(&mut tx, empresa_id, contexto.verificacao_id).await?;
    let bloqueios = bloqueios_de(&contexto);
    let total_baixado = pecas.iter().map(|peca| peca.quantidade).sum();
    let (restaurar, manter) = (permite_restaurar(&contexto), permite_manter(&contexto));
    Ok(AnaliseCorrecaoDecisao {
        status: contexto.status,
        pode_corrigir: bloqueios.is_empty(),
        ajustado_apos_decisao: contexto.ajustada_depois,
        permite_restaurar: restaurar,
        permite_manter: manter,
        bloqueios,
        pagamento_codigo: contexto.pagamento_codigo,
        pagamento_detalhe: contexto.pagamento_detalhe,
        valor_atual: contexto.valor_atual,
        valor_original: contexto.valor_original,
        exige_decisao_estoque: total_baixado > 0,
        total_baixado,
        pecas_baixadas: pecas,
    })
}

/// Reabre o orçamento: limpa pagamento e decisões por serviço, restaura a versão enviada (ou
/// mantém a atual, conforme o modo) e, só com confirmação explícita, devolve ao estoque as peças baixadas.
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = input.equipamento_id))]
pub async fn corrigir_decisao_orcamento(input: CorrigirDecisaoInput) -> Result<ResultadoCorrecaoDecisao, String> {
    let map = super::operator_errors::mapear_erro_sql;
    if !motivo_valido(&input.motivo) {
        return Err("Informe o motivo da correção (mínimo de 5 caracteres).".to_string());
    }
    if input.expected_updated_em.trim().is_empty() {
        return Err("A versão atual do equipamento não está disponível. Recarregue e tente novamente.".to_string());
    }
    let actor = require_permission(PERMISSION_FINANCIAL_ACTIONS)?;
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = pool.begin().await.map_err(map)?;

    let aplicada = corrigir_na_transacao(&mut tx, &actor, empresa_id, &input).await?;
    let ja_publicado = super::orcamento_decisao::situacao_portal(&mut tx, empresa_id, input.equipamento_id, false)
        .await?
        .ja_publicado;
    tx.commit().await.map_err(map)?;
    registrar_auditoria_correcao(&actor, &input, &aplicada).await;

    // Se o cliente já viu este orçamento no portal, a nova versão vai junto: sem isso o portal
    // ficaria sem proposta aberta. Falha de publicação vira aviso e não desfaz a correção.
    let portal = if ja_publicado {
        super::verificacoes::publicar_apos_ajuste(&pool, &actor, empresa_id, input.equipamento_id, true).await
    } else {
        super::verificacoes::PortalAjusteInfo::nenhuma()
    };
    let equipamento = super::equipamentos::buscar_equipamento(input.equipamento_id).await?;
    Ok(ResultadoCorrecaoDecisao { equipamento, portal })
}

/// Equipamento reaberto (campos na raiz do JSON, como antes) mais o que aconteceu no portal.
#[derive(Debug, Serialize)]
pub struct ResultadoCorrecaoDecisao {
    #[serde(flatten)]
    pub equipamento: EquipamentoRow,
    pub portal: super::verificacoes::PortalAjusteInfo,
}

impl std::ops::Deref for ResultadoCorrecaoDecisao {
    type Target = EquipamentoRow;
    fn deref(&self) -> &EquipamentoRow {
        &self.equipamento
    }
}

/// O que a correção fez, para a auditoria feita depois do commit.
pub(crate) struct CorrecaoAplicada {
    pub status_anterior: String,
    pub total_baixado: i32,
}

/// Corpo da correção, sem abrir nem fechar a transação: o ajuste de orçamento aprovado
/// ("pedir nova aprovação") usa a mesma regra de estoque e de resposta desfeita na sua transação.
pub(crate) async fn corrigir_na_transacao(
    tx: &mut Transaction<'_, Postgres>,
    actor: &SecurityProfileSummary,
    empresa_id: i32,
    input: &CorrigirDecisaoInput,
) -> Result<CorrecaoAplicada, String> {
    let map = super::operator_errors::mapear_erro_sql;
    let contexto = carregar_contexto(tx, empresa_id, input.equipamento_id, true).await?;
    let bloqueios = bloqueios_de(&contexto);
    if let Some(primeiro) = bloqueios.first() {
        return Err(primeiro.clone());
    }
    modo_permitido(&contexto, input.modo)?;
    let valor_reaberto = match input.modo {
        ModoCorrecao::RestaurarOriginal => contexto
            .valor_original
            .ok_or_else(|| "Valor original do orçamento indisponível.".to_string())?,
        ModoCorrecao::ManterAtual => contexto
            .valor_atual
            .ok_or_else(|| "O orçamento atual não tem valor registrado. Restaure o orçamento enviado ao cliente.".to_string())?,
    };

    let pecas = pecas_baixadas(tx, empresa_id, contexto.verificacao_id).await?;
    let total_baixado: i32 = pecas.iter().map(|peca| peca.quantidade).sum();
    if total_baixado > 0 && !input.devolver_estoque {
        return Err(format!(
            "{total_baixado} peça(s) já foram baixadas do estoque. Confirme a devolução ao estoque, o que só vale se as peças estiverem intactas."
        ));
    }

    if total_baixado > 0 {
        let mut produtos: Vec<i32> = pecas.iter().map(|peca| peca.produto_id).collect();
        produtos.sort_unstable();
        sqlx::query("SELECT id FROM produtos WHERE id = ANY($1) AND empresa_id = $2 ORDER BY id FOR UPDATE")
            .bind(&produtos)
            .bind(empresa_id)
            .fetch_all(&mut **tx)
            .await
            .map_err(map)?;
        let linhas: Vec<(String, i32, i32)> = sqlx::query_as(
            "SELECT servico_id, produto_id, quantidade_baixada
             FROM orcamento_consumos
             WHERE verificacao_id = $1 AND empresa_id = $2 AND quantidade_baixada > 0
             ORDER BY produto_id, servico_id FOR UPDATE",
        )
        .bind(contexto.verificacao_id)
        .bind(empresa_id)
        .fetch_all(&mut **tx)
        .await
        .map_err(map)?;
        for (servico_id, produto_id, quantidade) in linhas {
            sqlx::query(
                "UPDATE produtos SET quantidade_estoque = COALESCE(quantidade_estoque, 0) + $1, atualizado_em = NOW()
                 WHERE id = $2 AND empresa_id = $3",
            )
            .bind(quantidade)
            .bind(produto_id)
            .bind(empresa_id)
            .execute(&mut **tx)
            .await
            .map_err(map)?;
            sqlx::query(
                "INSERT INTO movimentacoes_estoque
                 (produto_id, tipo, quantidade, origem, referencia, usuario, data_hora, empresa_id)
                 VALUES ($1, 'ENTRADA', $2, 'CORRECAO_ORCAMENTO', $3, 'AutoOS', NOW(), $4)",
            )
            .bind(produto_id)
            .bind(quantidade)
            .bind(format!("verificacao:{};servico:{}", contexto.verificacao_id, servico_id))
            .bind(empresa_id)
            .execute(&mut **tx)
            .await
            .map_err(map)?;
        }
    }

    // Aprovação futura recria as quantidades e as baixas a partir do orçamento restaurado.
    sqlx::query(
        "UPDATE orcamento_consumos SET quantidade_aprovada = 0, quantidade_baixada = 0
         WHERE verificacao_id = $1 AND empresa_id = $2",
    )
    .bind(contexto.verificacao_id)
    .bind(empresa_id)
    .execute(&mut **tx)
    .await
    .map_err(map)?;
    sqlx::query("DELETE FROM orcamento_servicos_decisao WHERE verificacao_id = $1 AND empresa_id = $2")
        .bind(contexto.verificacao_id)
        .bind(empresa_id)
        .execute(&mut **tx)
        .await
        .map_err(map)?;

    // Os dois modos limpam o pagamento; só a restauração reescreve serviços, peças e valor.
    let atualizar_verificacao = match input.modo {
        ModoCorrecao::RestaurarOriginal => {
            "UPDATE verificacoes
             SET servicos_necessarios = servicos_orcamento_original::TEXT,
                 pecas_necessarias = COALESCE(pecas_orcamento_original::TEXT, pecas_necessarias),
                 custo_total = valor_orcamento_original,
                 forma_pagamento_codigo = NULL, forma_pagamento_detalhe = NULL
             WHERE id = $1 AND empresa_id = $2"
        }
        ModoCorrecao::ManterAtual => {
            "UPDATE verificacoes
             SET forma_pagamento_codigo = NULL, forma_pagamento_detalhe = NULL
             WHERE id = $1 AND empresa_id = $2"
        }
    };
    let restaurada = sqlx::query(atualizar_verificacao)
    .bind(contexto.verificacao_id)
    .bind(empresa_id)
    .execute(&mut **tx)
    .await
    .map_err(map)?
    .rows_affected();
    if restaurada != 1 {
        return Err("A verificação técnica mudou durante a correção. Recarregue e tente novamente.".to_string());
    }

    let reaberto = sqlx::query(
        "UPDATE equipamentos
         SET status = 'AGUARDANDO_APROVACAO', valor_orcamento = $4,
             data_aprovacao = NULL, data_reprovacao = NULL, atualizado_em = NOW()
         WHERE id = $1 AND empresa_id = $2 AND atualizado_em = $3::TIMESTAMPTZ",
    )
    .bind(input.equipamento_id)
    .bind(empresa_id)
    .bind(&input.expected_updated_em)
    .bind(valor_reaberto)
    .execute(&mut **tx)
    .await
    .map_err(map)?
    .rows_affected();
    if reaberto == 0 {
        return Err("O equipamento foi alterado por outra pessoa. Recarregue e confira antes de corrigir.".to_string());
    }

    // A resposta antiga (aprovar/recusar) deixaria de valer: sem este registro o portal continuaria
    // mostrando o orçamento como respondido/efetivado. O histórico não é apagado, só acrescentado.
    sqlx::query(
        "INSERT INTO orcamento_respostas
            (empresa_id, equipamento_id, versao_id, origem, decisao, registrada_por_profile_id, motivo)
         SELECT r.empresa_id, r.equipamento_id, r.versao_id, 'EQUIPE', 'DESFEITA', $3, $4
         FROM orcamento_respostas r
         WHERE r.id = (
                 SELECT ultima.id
                 FROM orcamento_respostas ultima
                 JOIN orcamento_versoes v ON v.id = ultima.versao_id AND v.empresa_id = ultima.empresa_id
                 WHERE v.equipamento_id = $1 AND v.empresa_id = $2
                 ORDER BY v.versao DESC, ultima.id DESC
                 LIMIT 1)
           AND r.decisao <> 'DESFEITA'",
    )
    .bind(input.equipamento_id)
    .bind(empresa_id)
    .bind(actor.id)
    .bind(format!("Decisão do orçamento corrigida pela equipe: {}", input.motivo.trim()))
    .execute(&mut **tx)
    .await
    .map_err(map)?;

    sqlx::query(
        "INSERT INTO orcamento_correcoes
            (empresa_id, equipamento_id, status_anterior, motivo, estoque_devolvido,
             quantidade_devolvida, criado_por_profile_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(empresa_id)
    .bind(input.equipamento_id)
    .bind(&contexto.status)
    // A tabela não tem coluna de modo (sem migration): o modo vai à frente do motivo.
    .bind(format!("[{}] {}", input.modo.rotulo(), input.motivo.trim()))
    .bind(total_baixado > 0)
    .bind(total_baixado)
    .bind(actor.id)
    .execute(&mut **tx)
    .await
    .map_err(map)?;

    Ok(CorrecaoAplicada { status_anterior: contexto.status, total_baixado })
}

pub(crate) async fn registrar_auditoria_correcao(
    actor: &SecurityProfileSummary,
    input: &CorrigirDecisaoInput,
    aplicada: &CorrecaoAplicada,
) {
    record_security_event(
        "BUDGET_DECISION_CORRECTED",
        Some(actor),
        format!(
            "equipamento_id={}; modo={:?}; status_anterior={}; estoque_devolvido={}; pecas_devolvidas={}; motivo={}",
            input.equipamento_id,
            input.modo,
            aplicada.status_anterior,
            aplicada.total_baixado > 0,
            aplicada.total_baixado,
            input.motivo.trim().replace(';', ","),
        ),
        true,
    )
    .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contexto(status: &str) -> Contexto {
        Contexto {
            status: status.to_string(),
            verificacao_id: 1,
            pagamento_codigo: Some("PIX".into()),
            pagamento_detalhe: None,
            valor_atual: Some(50.0),
            valor_original: Some(90.0),
            tem_original: true,
            ajustada_depois: false,
        }
    }

    #[test]
    fn approved_and_refused_budgets_can_be_corrected() {
        assert!(bloqueios_de(&contexto("APROVADO")).is_empty());
        assert!(bloqueios_de(&contexto("REPROVADO")).is_empty());
    }

    #[test]
    fn work_in_progress_is_blocked_with_the_current_stage() {
        for status in ["EM_MANUTENCAO", "AGUARDANDO_PECA", "PRONTO", "ENTREGUE"] {
            let bloqueios = bloqueios_de(&contexto(status));
            assert_eq!(bloqueios.len(), 1, "{status}");
            assert!(bloqueios[0].contains(status));
            assert!(!bloqueios[0].contains("atendimento humano"));
        }
        assert!(!bloqueios_de(&contexto("AGUARDANDO_APROVACAO")).is_empty());
    }

    fn instante(texto: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(texto).unwrap().with_timezone(&Utc)
    }

    #[test]
    fn only_an_adjustment_after_the_decision_counts() {
        let aprovado = Some(instante("2026-10-10T12:00:00Z"));
        // Ajuste antes da aprovação (caso real: valor atual = valor enviado): não bloqueia nada.
        assert!(!ajustado_apos_decisao(Some(instante("2026-10-09T08:00:00Z")), aprovado));
        assert!(ajustado_apos_decisao(Some(instante("2026-10-11T08:00:00Z")), aprovado));
        // Nunca ajustado.
        assert!(!ajustado_apos_decisao(None, aprovado));
        assert!(!ajustado_apos_decisao(None, None));
        // Ajustado, mas sem data de decisão legível: na dúvida, preserva o orçamento atual.
        assert!(ajustado_apos_decisao(Some(instante("2026-10-09T08:00:00Z")), None));
    }

    #[test]
    fn restore_needs_the_original_and_keep_needs_an_adjustment() {
        let sem_ajuste = contexto("APROVADO");
        assert!(bloqueios_de(&sem_ajuste).is_empty());
        assert!(modo_permitido(&sem_ajuste, ModoCorrecao::RestaurarOriginal).is_ok());
        assert!(modo_permitido(&sem_ajuste, ModoCorrecao::ManterAtual).is_err());

        let mut ajustado = contexto("APROVADO");
        ajustado.ajustada_depois = true;
        assert!(bloqueios_de(&ajustado).is_empty());
        assert!(modo_permitido(&ajustado, ModoCorrecao::RestaurarOriginal).is_ok());
        assert!(modo_permitido(&ajustado, ModoCorrecao::ManterAtual).is_ok());

        let mut sem_original = contexto("APROVADO");
        sem_original.tem_original = false;
        assert!(bloqueios_de(&sem_original).is_empty());
        assert!(modo_permitido(&sem_original, ModoCorrecao::RestaurarOriginal).is_err());
        assert!(modo_permitido(&sem_original, ModoCorrecao::ManterAtual).is_ok());
    }

    #[test]
    fn mode_defaults_to_restore_and_uses_screaming_names() {
        assert_eq!(ModoCorrecao::default(), ModoCorrecao::RestaurarOriginal);
        let modo: ModoCorrecao = serde_json::from_str("\"MANTER_ATUAL\"").unwrap();
        assert_eq!(modo, ModoCorrecao::ManterAtual);
    }

    #[test]
    fn reason_needs_at_least_five_characters() {
        assert!(!motivo_valido("   oi "));
        assert!(motivo_valido("Cliente ligou"));
    }
}
