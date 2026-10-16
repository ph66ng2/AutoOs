//! Correção guiada da decisão de um orçamento já aplicado.
//!
//! "Mudar Status" só troca o rótulo da etapa. Uma aprovação também grava pagamento, reescreve
//! serviços e pode baixar peças; por isso a correção confere o que aconteceu e desfaz tudo
//! junto, ou recusa e manda o caso para atendimento humano.

use crate::commands::auth::{
    record_security_event, require_active_session_company_id, require_permission,
    PERMISSION_FINANCIAL_ACTIONS,
};
use crate::commands::types::EquipamentoRow;
use crate::db::get_pool;
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnaliseCorrecaoDecisao {
    pub status: String,
    pub pode_corrigir: bool,
    /// Motivos que impedem a correção automática; com algum bloqueio, o caso é atendimento humano.
    pub bloqueios: Vec<String>,
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
}

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

/// Bloqueios independentes do estoque. Lista vazia = a correção automática é permitida.
fn bloqueios_de(contexto: &Contexto) -> Vec<String> {
    let mut bloqueios = Vec::new();
    match contexto.status.as_str() {
        "APROVADO" | "REPROVADO" => {}
        "AGUARDANDO_APROVACAO" => bloqueios.push("O orçamento já está aguardando decisão.".to_string()),
        _ => bloqueios.push(
            "O atendimento já passou da decisão (serviço em andamento ou etapa posterior). A correção exige atendimento humano; o sistema não devolve peças por conta própria.".to_string(),
        ),
    }
    if !contexto.tem_original {
        bloqueios.push("Este orçamento não guardou a versão original enviada ao cliente. Use Mudar Status com ajuste do orçamento.".to_string());
    }
    if contexto.ajustada_depois {
        bloqueios.push("O orçamento foi ajustado depois da aprovação. Corrigir restauraria a versão original e perderia esse ajuste; trate com atendimento humano.".to_string());
    }
    bloqueios
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

    let verificacao = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT id, forma_pagamento_codigo, forma_pagamento_detalhe,
                custo_total::FLOAT8 AS custo_total,
                valor_orcamento_original::FLOAT8 AS valor_original,
                (servicos_orcamento_original IS NOT NULL AND valor_orcamento_original IS NOT NULL) AS tem_original,
                (adjusted_at IS NOT NULL) AS ajustada_depois
         FROM verificacoes
         WHERE equipamento_id = $1 AND empresa_id = $2
         ORDER BY id DESC LIMIT 1{sufixo}"
    )))
    .bind(equipamento_id)
    .bind(empresa_id)
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
        ajustada_depois: verificacao.try_get("ajustada_depois").map_err(map)?,
    })
}

async fn pecas_baixadas(
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
    Ok(AnaliseCorrecaoDecisao {
        status: contexto.status,
        pode_corrigir: bloqueios.is_empty(),
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

/// Reabre o orçamento: restaura a versão enviada, limpa pagamento e decisões por serviço e,
/// só com confirmação explícita, devolve ao estoque as peças baixadas.
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = input.equipamento_id))]
pub async fn corrigir_decisao_orcamento(input: CorrigirDecisaoInput) -> Result<EquipamentoRow, String> {
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

    let contexto = carregar_contexto(&mut tx, empresa_id, input.equipamento_id, true).await?;
    let bloqueios = bloqueios_de(&contexto);
    if let Some(primeiro) = bloqueios.first() {
        return Err(primeiro.clone());
    }
    let valor_original = contexto
        .valor_original
        .ok_or_else(|| "Valor original do orçamento indisponível.".to_string())?;

    let pecas = pecas_baixadas(&mut tx, empresa_id, contexto.verificacao_id).await?;
    let total_baixado: i32 = pecas.iter().map(|peca| peca.quantidade).sum();
    if total_baixado > 0 && !input.devolver_estoque {
        return Err(format!(
            "{total_baixado} peça(s) já foram baixadas do estoque. Confirme a devolução ao estoque (apenas se estiverem intactas) ou trate com atendimento humano."
        ));
    }

    if total_baixado > 0 {
        let mut produtos: Vec<i32> = pecas.iter().map(|peca| peca.produto_id).collect();
        produtos.sort_unstable();
        sqlx::query("SELECT id FROM produtos WHERE id = ANY($1) AND empresa_id = $2 ORDER BY id FOR UPDATE")
            .bind(&produtos)
            .bind(empresa_id)
            .fetch_all(&mut *tx)
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
        .fetch_all(&mut *tx)
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
            .execute(&mut *tx)
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
            .execute(&mut *tx)
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
    .execute(&mut *tx)
    .await
    .map_err(map)?;
    sqlx::query("DELETE FROM orcamento_servicos_decisao WHERE verificacao_id = $1 AND empresa_id = $2")
        .bind(contexto.verificacao_id)
        .bind(empresa_id)
        .execute(&mut *tx)
        .await
        .map_err(map)?;

    let restaurada = sqlx::query(
        "UPDATE verificacoes
         SET servicos_necessarios = servicos_orcamento_original::TEXT,
             pecas_necessarias = COALESCE(pecas_orcamento_original::TEXT, pecas_necessarias),
             custo_total = valor_orcamento_original,
             forma_pagamento_codigo = NULL, forma_pagamento_detalhe = NULL
         WHERE id = $1 AND empresa_id = $2",
    )
    .bind(contexto.verificacao_id)
    .bind(empresa_id)
    .execute(&mut *tx)
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
    .bind(valor_original)
    .execute(&mut *tx)
    .await
    .map_err(map)?
    .rows_affected();
    if reaberto == 0 {
        return Err("O equipamento foi alterado por outra pessoa. Recarregue e confira antes de corrigir.".to_string());
    }

    sqlx::query(
        "INSERT INTO orcamento_correcoes
            (empresa_id, equipamento_id, status_anterior, motivo, estoque_devolvido,
             quantidade_devolvida, criado_por_profile_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(empresa_id)
    .bind(input.equipamento_id)
    .bind(&contexto.status)
    .bind(input.motivo.trim())
    .bind(total_baixado > 0)
    .bind(total_baixado)
    .bind(actor.id)
    .execute(&mut *tx)
    .await
    .map_err(map)?;

    tx.commit().await.map_err(map)?;

    record_security_event(
        "BUDGET_DECISION_CORRECTED",
        Some(&actor),
        format!(
            "equipamento_id={}; status_anterior={}; estoque_devolvido={}; pecas_devolvidas={}; motivo={}",
            input.equipamento_id,
            contexto.status,
            total_baixado > 0,
            total_baixado,
            input.motivo.trim().replace(';', ","),
        ),
        true,
    )
    .await;

    super::equipamentos::buscar_equipamento(input.equipamento_id).await
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
    fn work_in_progress_goes_to_human_support() {
        for status in ["EM_MANUTENCAO", "AGUARDANDO_PECA", "PRONTO", "ENTREGUE"] {
            let bloqueios = bloqueios_de(&contexto(status));
            assert_eq!(bloqueios.len(), 1, "{status}");
            assert!(bloqueios[0].contains("atendimento humano"));
        }
        assert!(!bloqueios_de(&contexto("AGUARDANDO_APROVACAO")).is_empty());
    }

    #[test]
    fn missing_original_or_later_adjustment_blocks_the_restore() {
        let mut sem_original = contexto("APROVADO");
        sem_original.tem_original = false;
        assert_eq!(bloqueios_de(&sem_original).len(), 1);

        let mut ajustado = contexto("APROVADO");
        ajustado.ajustada_depois = true;
        assert!(bloqueios_de(&ajustado)[0].contains("ajustado depois da aprovação"));
    }

    #[test]
    fn reason_needs_at_least_five_characters() {
        assert!(!motivo_valido("   oi "));
        assert!(motivo_valido("Cliente ligou"));
    }
}
