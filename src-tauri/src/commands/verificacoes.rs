//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/verificacoes.rs — Verificações Técnicas            ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  - salvar_verificacao_tecnica: Upsert de verificação         ║
//! ║  - buscar_verificacao_tecnica: Busca por equipamento_id      ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::types::{
    normalize_forma_pagamento, FormaPagamentoCodigo, VerificacaoInput, VerificacaoRow,
    VERIFICACAO_SELECT,
};
use crate::commands::auth::{
    profile_has_permission, record_security_event, require_any_permission, require_active_session_company_id,
    SecurityProfileSummary, PERMISSION_FINANCIAL_ACTIONS, PERMISSION_MANAGE_STATUS_LINKS,
    PERMISSION_PREPARE_QUOTES,
};
use crate::db::get_pool;
use crate::commands::orcamento_correcao::{
    corrigir_na_transacao, registrar_auditoria_correcao, CorrigirDecisaoInput, ModoCorrecao,
};
use crate::commands::orcamento_decisao::{
    desfazer_resposta_pendente, publicar_versao_isolada, situacao_portal,
};
use crate::commands::orcamento_estoque::{aplicar_decisoes, cancelar_pendencias_ausentes, normalizar_servicos, parse_servicos};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::collections::{HashMap, HashSet};
use tracing::{debug, error, info, instrument};

fn verification_has_sensitive_financial_input(input: &VerificacaoInput) -> bool {
    input.custo_estimado_mao_obra.is_some()
        || input.custo_estimado_pecas.is_some()
        || input.custo_total.is_some()
        || input.forma_pagamento_codigo.is_some()
        || input.forma_pagamento_detalhe.is_some()
}

fn verification_audit_details(action: &str, input: &VerificacaoInput) -> String {
    format!(
        "action={}; equipamento_id={}; custo_mao_obra={}; custo_pecas={}; custo_total={}; pagamento={}",
        action,
        input.equipamento_id,
        input.custo_estimado_mao_obra.is_some(),
        input.custo_estimado_pecas.is_some(),
        input.custo_total.is_some(),
        input.forma_pagamento_codigo.is_some(),
    )
}

/// Mesmo tenant, ou verificação legada sem empresa no mesmo equipamento.
const VERIFICATION_TENANT_MATCH: &str =
    "($2::INTEGER IS NULL OR empresa_id = $2 OR empresa_id IS NULL)";

fn claimed_tenant_conflicts(claimed: Option<i32>, actual: Option<i32>) -> bool {
    matches!((claimed, actual), (Some(claimed_id), Some(actual_id)) if claimed_id != actual_id)
}

fn require_financial_actor_for_verification_write(
    input: &VerificacaoInput,
) -> Result<Option<SecurityProfileSummary>, String> {
    if verification_has_sensitive_financial_input(input) {
        return Ok(Some(require_any_permission(&[
            PERMISSION_FINANCIAL_ACTIONS,
            PERMISSION_PREPARE_QUOTES,
        ])?));
    }

    Ok(None)
}

/// Status em que o orçamento ainda não foi decidido pelo cliente.
pub(crate) fn orcamento_em_elaboracao(status: &str) -> bool {
    matches!(
        status,
        "RECEBIDO" | "EM_VERIFICACAO" | "VERIFICADO" | "AGUARDANDO_APROVACAO"
    )
}

/// Perfil sem FINANCIAL_ACTIONS (só PREPARE_QUOTES) altera apenas orçamentos em elaboração.
fn check_prepare_quotes_status(
    actor: Option<&SecurityProfileSummary>,
    status: &str,
) -> Result<(), String> {
    if let Some(actor) = actor {
        if !profile_has_permission(actor, PERMISSION_FINANCIAL_ACTIONS)
            && !orcamento_em_elaboracao(status)
        {
            return Err("Este perfil só altera orçamentos ainda não decididos.".into());
        }
    }
    Ok(())
}

/// Salvar verificação técnica (upsert: cria ou atualiza).
/// Se já existe verificação para o equipamento, atualiza; senão, cria nova.
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = input.equipamento_id))]
pub async fn salvar_verificacao_tecnica(mut input: VerificacaoInput) -> Result<VerificacaoRow, String> {
    debug!("Salvando verificação técnica para equipamento {}", input.equipamento_id);
    let (payment_code, payment_detail) = normalize_forma_pagamento(
        input.forma_pagamento_codigo.as_ref(),
        input.forma_pagamento_detalhe.as_deref(),
    )?;
    let financial_actor = require_financial_actor_for_verification_write(&input)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let empresa_id = require_active_session_company_id(&pool).await?;
    if input.empresa_id.is_some_and(|id| id != empresa_id) {
        return Err("O equipamento não pertence à empresa ativa.".to_string());
    }
    input.empresa_id = Some(empresa_id);
    parse_servicos(input.servicos_necessarios.as_deref().unwrap_or("[]"))?;
    let mut tx = pool.begin().await.map_err(super::operator_errors::mapear_erro_sql)?;
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM equipamentos WHERE id = $1 AND empresa_id = $2 FOR UPDATE")
        .bind(input.equipamento_id).bind(empresa_id).fetch_optional(&mut *tx).await.map_err(super::operator_errors::mapear_erro_sql)?;
    let status = status.ok_or("Equipamento não encontrado na empresa ativa.")?;
    check_prepare_quotes_status(financial_actor.as_ref(), &status)?;
    if matches!(status.as_str(), "APROVADO" | "EM_MANUTENCAO" | "AGUARDANDO_PECA" | "PRONTO" | "ENTREGUE") {
        return Err("Use Alterar Orçamento para modificar serviços de uma OS já aprovada.".to_string());
    }
    sqlx::query("UPDATE equipamentos SET atualizado_em = NOW() WHERE id = $1")
        .bind(input.equipamento_id).execute(&mut *tx).await.map_err(super::operator_errors::mapear_erro_sql)?;

    // Verificar se já existe uma verificação para este equipamento
    let existing: Option<(i32,)> = sqlx::query_as(
        "SELECT id FROM verificacoes
         WHERE equipamento_id = $1 AND ($2::INTEGER IS NULL OR empresa_id = $2 OR empresa_id IS NULL)
         ORDER BY (empresa_id = $2) DESC NULLS LAST, id DESC
         LIMIT 1"
    )
    .bind(input.equipamento_id)
    .bind(input.empresa_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| {
        error!("Erro ao verificar existência de verificação: {}", e);
        super::operator_errors::mapear_erro_sql(e)
    })?;

    if let Some((id,)) = existing {
        // UPDATE existente
        debug!("Atualizando verificação existente id={}", id);
        sqlx::query(
            r#"
            UPDATE verificacoes SET
                tecnico_nome = $1, problema_relatado = $2, diagnostico = $3,
                itens_verificados = $4, servicos_necessarios = $5, pecas_necessarias = $6,
                custo_estimado_mao_obra = $7, custo_estimado_pecas = $8, custo_total = $9,
                tempo_estimado = $10, concluida = $11, observacoes = $12,
                forma_pagamento_codigo = $13, forma_pagamento_detalhe = $14,
                data_fim = CASE WHEN $11 = true THEN NOW() ELSE data_fim END,
                empresa_id = COALESCE(empresa_id, $16)
            WHERE id = $15 AND ($16::INTEGER IS NULL OR empresa_id = $16 OR empresa_id IS NULL)
            "#,
        )
        .bind(&input.tecnico_nome)
        .bind(&input.problema_relatado)
        .bind(&input.diagnostico)
        .bind(&input.itens_verificados)
        .bind(&input.servicos_necessarios)
        .bind(&input.pecas_necessarias)
        .bind(input.custo_estimado_mao_obra)
        .bind(input.custo_estimado_pecas)
        .bind(input.custo_total)
        .bind(input.tempo_estimado)
        .bind(input.concluida.unwrap_or(false))
        .bind(&input.observacoes)
        .bind(payment_code.as_deref())
        .bind(payment_detail.as_deref())
        .bind(id)
        .bind(input.empresa_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            error!("Erro ao atualizar verificação {}: {}", id, e);
            super::operator_errors::mapear_erro_sql(e)
        })?;

        tx.commit().await.map_err(super::operator_errors::mapear_erro_sql)?;
        if let Some(actor) = financial_actor.as_ref() {
            record_security_event(
                "VERIFICATION_FINANCIAL_SAVED",
                Some(actor),
                verification_audit_details("update", &input),
                true,
            )
            .await;
        }

        info!("Verificação {} atualizada", id);
        return buscar_verificacao_tecnica(input.equipamento_id, input.empresa_id).await;
    }

    // INSERT nova verificação
    debug!("Criando nova verificação");
    sqlx::query(
        r#"
        INSERT INTO verificacoes (
            equipamento_id, empresa_id, tecnico_nome, problema_relatado, diagnostico,
            itens_verificados, servicos_necessarios, pecas_necessarias,
            custo_estimado_mao_obra, custo_estimado_pecas, custo_total,
            tempo_estimado, concluida, observacoes,
            forma_pagamento_codigo, forma_pagamento_detalhe
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )
        "#,
    )
    .bind(input.equipamento_id)
    .bind(input.empresa_id)
    .bind(&input.tecnico_nome)
    .bind(&input.problema_relatado)
    .bind(&input.diagnostico)
    .bind(&input.itens_verificados)
    .bind(&input.servicos_necessarios)
    .bind(&input.pecas_necessarias)
    .bind(input.custo_estimado_mao_obra)
    .bind(input.custo_estimado_pecas)
    .bind(input.custo_total)
    .bind(input.tempo_estimado)
    .bind(input.concluida.unwrap_or(false))
    .bind(&input.observacoes)
    .bind(payment_code.as_deref())
    .bind(payment_detail.as_deref())
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        error!("Erro ao criar verificação: {}", e);
        super::operator_errors::mapear_erro_sql(e)
    })?;

    tx.commit().await.map_err(super::operator_errors::mapear_erro_sql)?;
    if let Some(actor) = financial_actor.as_ref() {
        record_security_event(
            "VERIFICATION_FINANCIAL_SAVED",
            Some(actor),
            verification_audit_details("create", &input),
            true,
        )
        .await;
    }

    info!("Verificação criada para equipamento {}", input.equipamento_id);
    buscar_verificacao_tecnica(input.equipamento_id, input.empresa_id).await
}

/// Buscar verificação técnica por equipamento_id.
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn buscar_verificacao_tecnica(
    equipamento_id: i32,
    empresa_id: Option<i32>,
) -> Result<VerificacaoRow, String> {
    debug!("Buscando verificação do equipamento {}", equipamento_id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let equipment_empresa_id: Option<(Option<i32>,)> = sqlx::query_as(
        "SELECT empresa_id FROM equipamentos WHERE id = $1",
    )
    .bind(equipamento_id)
    .fetch_optional(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    let Some((resolved_empresa_id,)) = equipment_empresa_id else {
        return Err("Equipamento não encontrado.".to_string());
    };
    if claimed_tenant_conflicts(empresa_id, resolved_empresa_id) {
        return Err("O equipamento não pertence à empresa informada.".to_string());
    }

    let query = format!(
        "{} WHERE equipamento_id = $1 AND {} ORDER BY (empresa_id = $2) DESC NULLS LAST, id DESC LIMIT 1",
        VERIFICACAO_SELECT,
        VERIFICATION_TENANT_MATCH
    );
    let row = sqlx::query_as::<_, VerificacaoRow>(sqlx::AssertSqlSafe(&*query))
        .bind(equipamento_id)
        .bind(resolved_empresa_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            error!("Verificação do equipamento {} não encontrada: {}", equipamento_id, e);
            super::operator_errors::mapear_erro_sql(e)
        })?;

    info!("Verificação do equipamento {} encontrada", equipamento_id);
    Ok(row)
}

/// O que fazer quando o orçamento JÁ APROVADO é alterado.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ModoAjusteAprovado {
    /// O cliente concordou com a mudança: o orçamento segue aprovado, com o valor novo.
    SemNovaAprovacao,
    /// Reabre a aprovação (mantendo o orçamento alterado) e publica a nova versão no portal.
    NovaAprovacao,
}

impl ModoAjusteAprovado {
    fn codigo(self) -> &'static str {
        match self {
            Self::SemNovaAprovacao => "SEM_NOVA_APROVACAO",
            Self::NovaAprovacao => "NOVA_APROVACAO",
        }
    }
}

/// Escolhas do operador ao salvar a alteração do orçamento.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct OpcoesAjusteOrcamento {
    /// Só vale para orçamento aprovado. Sem valor, mantém o comportamento antigo (sem nova aprovação).
    pub modo_aprovado: Option<ModoAjusteAprovado>,
    /// Confirma a devolução ao estoque das peças já baixadas (pedir nova aprovação).
    pub devolver_estoque: bool,
    /// Confirma que a nova versão anula a resposta que o cliente deu e a equipe ainda não aplicou.
    pub confirmar_resposta_pendente: bool,
}

/// O que aconteceu no portal por causa do ajuste, em palavras para o operador.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PortalAjusteInfo {
    /// `NENHUMA`, `VERSAO_PUBLICADA`, `NOVA_APROVACAO_PUBLICADA`, `VALOR_ATUALIZADO` ou `NAO_PUBLICADA`.
    pub acao: String,
    pub versao: Option<i32>,
    pub mensagem: Option<String>,
    /// Algo que a equipe precisa resolver (ex.: a publicação automática falhou).
    pub aviso: Option<String>,
}

impl PortalAjusteInfo {
    pub(crate) fn nenhuma() -> Self {
        Self { acao: "NENHUMA".into(), versao: None, mensagem: None, aviso: None }
    }
}

/// Verificação com o resultado do ajuste. Os campos da verificação continuam na raiz do JSON.
#[derive(Debug, Serialize)]
pub struct ResultadoAjusteOrcamento {
    #[serde(flatten)]
    pub verificacao: VerificacaoRow,
    pub portal: PortalAjusteInfo,
}

impl std::ops::Deref for ResultadoAjusteOrcamento {
    type Target = VerificacaoRow;
    fn deref(&self) -> &VerificacaoRow {
        &self.verificacao
    }
}

fn mensagem_publicacao(nova_aprovacao: bool, versao: i32) -> String {
    if nova_aprovacao {
        format!("Nova aprovação pedida: a versão {versao} foi publicada no portal para o cliente responder.")
    } else {
        format!("Portal atualizado: versão {versao} publicada.")
    }
}

fn mensagem_valor_atualizado(valor: Option<f64>) -> String {
    match valor {
        Some(valor) => format!("Valor atualizado no portal sem nova aprovação (R$ {valor:.2})."),
        None => "Valor atualizado no portal sem nova aprovação.".to_string(),
    }
}

fn pode_publicar_no_portal(actor: &SecurityProfileSummary) -> bool {
    actor.role == "ADMIN"
        || actor
            .permissions
            .iter()
            .any(|p| p == PERMISSION_MANAGE_STATUS_LINKS || p == PERMISSION_PREPARE_QUOTES)
}

/// Publica a versão nova logo depois do ajuste já gravado. Nunca falha o ajuste: se não der,
/// devolve um aviso para o operador publicar manualmente.
pub(crate) async fn publicar_apos_ajuste(
    pool: &PgPool,
    actor: &SecurityProfileSummary,
    empresa_id: i32,
    equipamento_id: i32,
    nova_aprovacao: bool,
) -> PortalAjusteInfo {
    let nao_publicada = |aviso: String| PortalAjusteInfo {
        acao: "NAO_PUBLICADA".into(),
        versao: None,
        mensagem: None,
        aviso: Some(aviso),
    };
    if !pode_publicar_no_portal(actor) {
        return nao_publicada(
            "A alteração foi salva, mas este perfil não pode publicar no portal. Peça a quem tenha a permissão de links de status para publicar a nova versão.".to_string(),
        );
    }
    match publicar_versao_isolada(pool, empresa_id, equipamento_id, actor.id).await {
        Ok(versao) => {
            record_security_event(
                "BUDGET_PUBLISHED_TO_PORTAL",
                Some(actor),
                format!(
                    "empresa_id={empresa_id}; equipamento_id={equipamento_id}; versao={}; automatica=true; nova_aprovacao={nova_aprovacao}",
                    versao.numero
                ),
                true,
            )
            .await;
            PortalAjusteInfo {
                acao: if nova_aprovacao { "NOVA_APROVACAO_PUBLICADA" } else { "VERSAO_PUBLICADA" }.into(),
                versao: Some(versao.numero),
                mensagem: Some(mensagem_publicacao(nova_aprovacao, versao.numero)),
                aviso: None,
            }
        }
        Err(erro) => nao_publicada(format!(
            "A alteração foi salva, mas o portal não foi atualizado: {erro} Use Publicar no portal quando puder."
        )),
    }
}

async fn portal_ligado(pool: &PgPool, empresa_id: i32) -> bool {
    sqlx::query_scalar::<_, bool>("SELECT portal_enabled FROM portal_config_empresa WHERE empresa_id = $1")
        .bind(empresa_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .unwrap_or(false)
}

fn count_json_array_items(json: &Option<String>) -> usize {
    match json {
        Some(text) if !text.trim().is_empty() => {
            serde_json::from_str::<Vec<serde_json::Value>>(text)
                .map(|arr| arr.len())
                .unwrap_or(0)
        }
        _ => 0,
    }
}

#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn atualizar_servicos_verificacao(
    equipamento_id: i32,
    servicos_json: Option<String>,
    pecas_json: Option<String>,
    custo_total: Option<f64>,
    profile_id: i32,
    divergence: bool,
    observacoes: Option<String>,
    forma_pagamento_codigo: Option<FormaPagamentoCodigo>,
    forma_pagamento_detalhe: Option<String>,
    empresa_id: Option<i32>,
    cliente_aprovou_alteracao: Option<bool>,
    expected_updated_em: Option<String>,
    opcoes: Option<OpcoesAjusteOrcamento>,
) -> Result<ResultadoAjusteOrcamento, String> {
    let opcoes = opcoes.unwrap_or_default();
    let actor = require_any_permission(&[PERMISSION_FINANCIAL_ACTIONS, PERMISSION_PREPARE_QUOTES])?;
    let (payment_code, payment_detail) = normalize_forma_pagamento(
        forma_pagamento_codigo.as_ref(),
        forma_pagamento_detalhe.as_deref(),
    )?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let active_empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = pool.begin().await.map_err(|error| {
        error!("Erro ao iniciar ajuste da verificação: {}", error);
        super::operator_errors::mapear_erro_sql(error)
    })?;

    let equipment: Option<(Option<i32>, String, bool, Option<f64>)> = sqlx::query_as(
        "SELECT empresa_id, status, ($2::TIMESTAMPTZ IS NULL OR atualizado_em = $2::TIMESTAMPTZ),
                valor_orcamento::FLOAT8
         FROM equipamentos WHERE id = $1 FOR UPDATE",
    )
    .bind(equipamento_id)
    .bind(expected_updated_em.as_deref())
    .fetch_optional(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    let Some((resolved_empresa_id, status, versao_valida, valor_equipamento)) = equipment else {
        return Err("Equipamento não encontrado.".to_string());
    };
    check_prepare_quotes_status(Some(&actor), &status)?;
    if resolved_empresa_id != Some(active_empresa_id) {
        return Err("O equipamento não pertence à empresa ativa.".to_string());
    }
    if !versao_valida {
        return Err("O orçamento mudou em outra sessão. Reabra Alterar Orçamento antes de salvar.".to_string());
    }
    if status == "AGUARDANDO_APROVACAO"
        && !custo_total.is_some_and(|value| value.is_finite() && value > 0.0)
    {
        return Err("Informe um valor de orçamento maior que zero.".to_string());
    }
    if claimed_tenant_conflicts(empresa_id, resolved_empresa_id) {
        return Err("O equipamento não pertence à empresa informada.".to_string());
    }

    if let Some(resolved_id) = resolved_empresa_id {
        let conflicting_verification: Option<i32> = sqlx::query_scalar(
            "SELECT id
             FROM verificacoes
             WHERE equipamento_id = $1 AND empresa_id IS NOT NULL AND empresa_id <> $2
             ORDER BY id DESC
             LIMIT 1
             FOR UPDATE",
        )
        .bind(equipamento_id)
        .bind(resolved_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
        if conflicting_verification.is_some() {
            return Err(
                "A verificação técnica pertence a outra empresa e não pode ser ajustada.".to_string(),
            );
        }
    }

    let existing: Option<(i32, Option<String>, Option<String>, Option<f64>)> = sqlx::query_as(
        "SELECT id, servicos_necessarios, pecas_necessarias, custo_total::FLOAT8 as custo_total
         FROM verificacoes
         WHERE equipamento_id = $1 AND ($2::INTEGER IS NULL OR empresa_id = $2 OR empresa_id IS NULL)
         ORDER BY (empresa_id = $2) DESC NULLS LAST, id DESC
         LIMIT 1
         FOR UPDATE"
    )
    .bind(equipamento_id)
    .bind(resolved_empresa_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| {
        error!("Erro ao buscar verificação existente: {}", e);
        super::operator_errors::mapear_erro_sql(e)
    })?;

    let (verificacao_id, old_servicos, old_pecas, old_total) = match existing {
        Some(row) => row,
        None => return Err("Nenhuma verificação encontrada para este equipamento.".to_string()),
    };

    let servicos = parse_servicos(servicos_json.as_deref().unwrap_or("[]"))?;
    let depois_aprovacao = matches!(status.as_str(), "APROVADO" | "EM_MANUTENCAO" | "AGUARDANDO_PECA" | "PRONTO" | "ENTREGUE");
    let alterou_itens = old_servicos != servicos_json || old_pecas != pecas_json || old_total != custo_total;
    let modo_aprovado = (depois_aprovacao && alterou_itens)
        .then(|| opcoes.modo_aprovado.unwrap_or(ModoAjusteAprovado::SemNovaAprovacao));
    let nova_aprovacao = modo_aprovado == Some(ModoAjusteAprovado::NovaAprovacao);
    if nova_aprovacao && status != "APROVADO" {
        return Err("Só dá para pedir nova aprovação enquanto o orçamento está Aprovado. Com o serviço em andamento, use o ajuste sem nova aprovação.".to_string());
    }
    if depois_aprovacao && alterou_itens && !nova_aprovacao {
        if cliente_aprovou_alteracao != Some(true) {
            return Err("Confirme que o cliente aprovou as mudanças nos serviços e peças.".to_string());
        }
        let Some(empresa_id) = resolved_empresa_id else {
            return Err("A OS precisa estar vinculada a uma empresa.".to_string());
        };
        let antigos: HashMap<String, serde_json::Value> = normalizar_servicos(old_servicos.as_deref().unwrap_or("[]"))?
        .into_iter().filter_map(|s| {
            s.get("id").and_then(|id| id.as_str()).map(|id| (id.to_string(), s.clone()))
        }).collect();
        let ja_aprovados: Vec<String> = sqlx::query_scalar(
            "SELECT servico_id FROM orcamento_servicos_decisao
             WHERE verificacao_id = $1 AND empresa_id = $2 AND decisao = 'APROVADO'"
        ).bind(verificacao_id).bind(empresa_id).fetch_all(&mut *tx).await.map_err(super::operator_errors::mapear_erro_sql)?;
        let mut aprovados: HashSet<String> = ja_aprovados.into_iter().chain(antigos.keys().cloned()).collect();
        for novo in normalizar_servicos(servicos_json.as_deref().unwrap_or("[]"))? {
            let id = novo["id"].as_str().ok_or("Serviço sem identificador")?;
            if Some(&novo) != antigos.get(id) { aprovados.insert(id.to_string()); }
        }
        let aprovados: Vec<String> = servicos.iter().filter(|s| aprovados.contains(&s.id))
            .map(|s| s.id.clone()).collect();
        aplicar_decisoes(&mut tx, empresa_id, verificacao_id, &servicos, &aprovados).await?;
        cancelar_pendencias_ausentes(&mut tx, verificacao_id, &servicos).await?;
    }

    // Aguardando aprovação: se o orçamento já foi ao portal e vai mudar, a versão aberta será
    // encerrada pelos gatilhos; a resposta pendente do cliente precisa de confirmação antes.
    let mut republicar = false;
    if status == "AGUARDANDO_APROVACAO" {
        let situacao = situacao_portal(&mut tx, active_empresa_id, equipamento_id, true).await?;
        let vai_mudar = alterou_itens || valor_equipamento != custo_total;
        if situacao.ja_publicado && vai_mudar {
            if let Some(pendente) = situacao.pendente.as_ref() {
                if !opcoes.confirmar_resposta_pendente {
                    return Err(format!(
                        "O cliente já respondeu a este orçamento no portal ({}) e a equipe ainda não aplicou. Salvar a alteração publica uma nova versão e anula essa resposta. Confirme para continuar.",
                        if pendente.decisao == "APROVAR" { "aprovou" } else { "recusou" }
                    ));
                }
                desfazer_resposta_pendente(&mut tx, active_empresa_id, equipamento_id, actor.id).await?;
            }
            republicar = true;
        }
    }

    sqlx::query(
        r#"
        UPDATE verificacoes SET
            servicos_necessarios = $1,
            pecas_necessarias = $2,
            custo_total = $3,
            observacoes = CASE
                WHEN $4::TEXT IS NULL THEN observacoes
                WHEN btrim($4) = '' THEN NULL
                ELSE btrim($4)
            END,
            forma_pagamento_codigo = CASE
                WHEN $5::TEXT IS NOT NULL THEN $5
                ELSE forma_pagamento_codigo
            END,
            forma_pagamento_detalhe = CASE
                WHEN $5::TEXT IS NOT NULL THEN $6
                ELSE forma_pagamento_detalhe
            END,
            adjusted_at = NOW(),
            adjusted_by_profile_id = $7,
            empresa_id = COALESCE(empresa_id, $9)
        WHERE id = $8 AND ($9::INTEGER IS NULL OR empresa_id = $9 OR empresa_id IS NULL)
        "#,
    )
    .bind(&servicos_json)
    .bind(&pecas_json)
    .bind(custo_total)
    .bind(observacoes.as_deref())
    .bind(payment_code.as_deref())
    .bind(payment_detail.as_deref())
    .bind(profile_id)
    .bind(verificacao_id)
    .bind(resolved_empresa_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        error!("Erro ao atualizar serviços da verificação {}: {}", verificacao_id, e);
        super::operator_errors::mapear_erro_sql(e)
    })?;

    let equipment_updated = sqlx::query(
        "UPDATE equipamentos
         SET valor_orcamento = $1, atualizado_em = NOW()
         WHERE id = $2 AND ($3::INTEGER IS NULL OR empresa_id = $3)",
    )
        .bind(custo_total)
        .bind(equipamento_id)
        .bind(resolved_empresa_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            error!("Erro ao sincronizar valor_orcamento do equipamento {}: {}", equipamento_id, e);
            super::operator_errors::mapear_erro_sql(e)
        })?
        .rows_affected();

    if equipment_updated == 0 {
        return Err("Equipamento não encontrado na empresa informada.".to_string());
    }

    // Pedir nova aprovação: na mesma transação, reabre a aprovação mantendo o orçamento alterado
    // (mesma regra de estoque da correção de decisão). Se algo falhar, nada é gravado.
    let correcao = if nova_aprovacao {
        let token: String = sqlx::query_scalar("SELECT atualizado_em::TEXT FROM equipamentos WHERE id = $1")
            .bind(equipamento_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(super::operator_errors::mapear_erro_sql)?;
        let input = CorrigirDecisaoInput {
            equipamento_id,
            expected_updated_em: token,
            motivo: "Orçamento alterado depois da aprovação: nova aprovação pedida ao cliente.".to_string(),
            devolver_estoque: opcoes.devolver_estoque,
            modo: ModoCorrecao::ManterAtual,
        };
        let aplicada = corrigir_na_transacao(&mut tx, &actor, active_empresa_id, &input).await?;
        Some((input, aplicada))
    } else {
        None
    };

    tx.commit().await.map_err(|error| {
        error!("Erro ao confirmar ajuste da verificação {}: {}", verificacao_id, error);
        super::operator_errors::mapear_erro_sql(error)
    })?;
    if let Some((input, aplicada)) = correcao.as_ref() {
        registrar_auditoria_correcao(&actor, input, aplicada).await;
    }

    let portal = if nova_aprovacao || republicar {
        publicar_apos_ajuste(&pool, &actor, active_empresa_id, equipamento_id, nova_aprovacao).await
    } else if modo_aprovado == Some(ModoAjusteAprovado::SemNovaAprovacao)
        && old_total != custo_total
        && portal_ligado(&pool, active_empresa_id).await
    {
        PortalAjusteInfo {
            acao: "VALOR_ATUALIZADO".into(),
            versao: None,
            mensagem: Some(mensagem_valor_atualizado(custo_total)),
            aviso: None,
        }
    } else {
        PortalAjusteInfo::nenhuma()
    };

    let old_service_count = count_json_array_items(&old_servicos);
    let new_service_count = count_json_array_items(&servicos_json);
    let services_added = if new_service_count > old_service_count {
        new_service_count - old_service_count
    } else {
        0
    };
    let services_removed = if old_service_count > new_service_count {
        old_service_count - new_service_count
    } else {
        0
    };

    record_security_event(
        "BUDGET_ADJUSTED",
        Some(&actor),
        format!(
            "equipamento_id={}; old_total={}; new_total={}; services_added={}; services_removed={}; divergence={}; observacoes_updated={}; pagamento_updated={}; modo={}; portal={}",
            equipamento_id,
            old_total.unwrap_or(0.0),
            custo_total.unwrap_or(0.0),
            services_added,
            services_removed,
            divergence,
            observacoes.is_some(),
            payment_code.is_some(),
            modo_aprovado.map_or("NENHUM", ModoAjusteAprovado::codigo),
            portal.acao,
        ),
        true,
    )
    .await;

    info!("Serviços e orçamento atualizados para equipamento {}", equipamento_id);
    let verificacao = buscar_verificacao_tecnica(equipamento_id, resolved_empresa_id).await?;
    Ok(ResultadoAjusteOrcamento { verificacao, portal })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claimed_tenant_is_ignored_when_either_side_is_missing() {
        assert!(!claimed_tenant_conflicts(None, Some(1)));
        assert!(!claimed_tenant_conflicts(Some(1), None));
        assert!(!claimed_tenant_conflicts(Some(1), Some(1)));
        assert!(claimed_tenant_conflicts(Some(1), Some(2)));
    }

    #[test]
    fn portal_messages_are_plain_for_the_operator() {
        assert_eq!(mensagem_publicacao(false, 3), "Portal atualizado: versão 3 publicada.");
        assert!(mensagem_publicacao(true, 4).contains("versão 4"));
        assert!(mensagem_publicacao(true, 4).contains("Nova aprovação"));
        assert_eq!(
            mensagem_valor_atualizado(Some(60.0)),
            "Valor atualizado no portal sem nova aprovação (R$ 60.00)."
        );
    }

    #[test]
    fn approved_adjustment_modes_use_screaming_names_and_default_to_no_new_approval() {
        let modo: ModoAjusteAprovado = serde_json::from_str("\"NOVA_APROVACAO\"").unwrap();
        assert_eq!(modo, ModoAjusteAprovado::NovaAprovacao);
        assert_eq!(modo.codigo(), "NOVA_APROVACAO");
        let opcoes: OpcoesAjusteOrcamento = serde_json::from_str("{}").unwrap();
        assert!(opcoes.modo_aprovado.is_none() && !opcoes.devolver_estoque && !opcoes.confirmar_resposta_pendente);
        let opcoes: OpcoesAjusteOrcamento =
            serde_json::from_str(r#"{"modoAprovado":"SEM_NOVA_APROVACAO","devolverEstoque":true}"#).unwrap();
        assert_eq!(opcoes.modo_aprovado, Some(ModoAjusteAprovado::SemNovaAprovacao));
        assert!(opcoes.devolver_estoque);
    }

    #[test]
    fn portal_publication_needs_the_status_links_permission() {
        let mut perfil = SecurityProfileSummary {
            id: 1, nome: "Ana".into(), role: "OPERADOR".into(), permissions: vec![],
            pin_configured: true, pin_required: true, is_default: false, ativo: true,
            avatar_icone: None, avatar_cor: None, tema: None, onboarding_pendente: false,
            tour_permissoes_vistas: None,
        };
        assert!(!pode_publicar_no_portal(&perfil));
        perfil.permissions.push(PERMISSION_MANAGE_STATUS_LINKS.to_string());
        assert!(pode_publicar_no_portal(&perfil));
        perfil.permissions.clear();
        perfil.permissions.push(PERMISSION_PREPARE_QUOTES.to_string());
        assert!(pode_publicar_no_portal(&perfil));
        perfil.permissions.clear();
        perfil.role = "ADMIN".into();
        assert!(pode_publicar_no_portal(&perfil));
    }

    #[test]
    fn orcamento_em_elaboracao_only_for_undecided_statuses() {
        for s in ["RECEBIDO", "EM_VERIFICACAO", "VERIFICADO", "AGUARDANDO_APROVACAO"] {
            assert!(orcamento_em_elaboracao(s), "{s}");
        }
        for s in ["APROVADO", "REPROVADO", "EM_MANUTENCAO", "AGUARDANDO_PECA", "PRONTO", "ENTREGUE", "ORCAMENTO_VENCIDO", ""] {
            assert!(!orcamento_em_elaboracao(s), "{s}");
        }
    }

    #[test]
    fn prepare_quotes_only_profile_is_limited_to_undecided_budgets() {
        let mut perfil = SecurityProfileSummary {
            id: 1, nome: "Ana".into(), role: "OPERADOR".into(),
            permissions: vec![PERMISSION_PREPARE_QUOTES.to_string()],
            pin_configured: true, pin_required: true, is_default: false, ativo: true,
            avatar_icone: None, avatar_cor: None, tema: None, onboarding_pendente: false,
            tour_permissoes_vistas: None,
        };
        assert!(check_prepare_quotes_status(Some(&perfil), "VERIFICADO").is_ok());
        assert!(check_prepare_quotes_status(Some(&perfil), "APROVADO").is_err());
        assert!(check_prepare_quotes_status(None, "APROVADO").is_ok());
        perfil.permissions.push(PERMISSION_FINANCIAL_ACTIONS.to_string());
        assert!(check_prepare_quotes_status(Some(&perfil), "APROVADO").is_ok());
    }

    #[test]
    fn p0_sensitive_verification_write_detects_financial_payload() {
        let mut input = VerificacaoInput::default();
        assert!(!verification_has_sensitive_financial_input(&input));

        input.custo_total = Some(150.0);
        assert!(verification_has_sensitive_financial_input(&input));
    }
}
