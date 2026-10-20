//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/orcamentos_insumos.rs — Venda avulsa de insumos    ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  Orçamento "OI-<n>" de etiquetas, ribbons, peças e outros    ║
//! ║  itens do estoque para um cliente, sem equipamento.          ║
//! ║                                                              ║
//! ║  Status: RASCUNHO → ENVIADO → APROVADO → ENTREGUE            ║
//! ║          (REPROVADO e CANCELADO encerram o orçamento)        ║
//! ║                                                              ║
//! ║  - Valores são calculados aqui, em centavos; o total que a   ║
//! ║    tela mostra nunca é gravado.                              ║
//! ║  - Aprovar baixa o estoque inteiro numa transação (SAIDA,    ║
//! ║    origem VENDA_INSUMOS, referência OI-<n>); se faltar algum ║
//! ║    item nada é aprovado.                                     ║
//! ║  - Cancelar um APROVADO devolve o estoque (ENTRADA).         ║
//! ║  - Toda alteração confere `atualizado_em` (concorrência).    ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::auth::{
    record_security_event, require_active_session_company_id, require_permission,
    PERMISSION_FINANCIAL_ACTIONS,
};
use crate::commands::types::{normalize_forma_pagamento, FormaPagamento, FormaPagamentoCodigo, PaginatedResult};
use crate::db::get_pool;
use chrono::{Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};
use tracing::{error, info, instrument};

use super::equipamentos::UI_PAGE_SIZE;
use super::produtos::aplicar_movimentacao_em_tx;

/// Origem gravada em `movimentacoes_estoque` para baixa e devolução de uma venda de insumos.
pub const ORIGEM_VENDA_INSUMOS: &str = "VENDA_INSUMOS";

pub const STATUS_RASCUNHO: &str = "RASCUNHO";
pub const STATUS_ENVIADO: &str = "ENVIADO";
pub const STATUS_APROVADO: &str = "APROVADO";
pub const STATUS_REPROVADO: &str = "REPROVADO";
pub const STATUS_CANCELADO: &str = "CANCELADO";
pub const STATUS_ENTREGUE: &str = "ENTREGUE";

const STATUS_VALIDOS: [&str; 6] = [
    STATUS_RASCUNHO,
    STATUS_ENVIADO,
    STATUS_APROVADO,
    STATUS_REPROVADO,
    STATUS_CANCELADO,
    STATUS_ENTREGUE,
];

const VALIDADE_PADRAO_DIAS: i64 = 7;
const MAX_ITENS: usize = 100;
const MAX_QUANTIDADE: i32 = 100_000;
/// R$ 10.000.000,00 por unidade: barra erro de digitação sem limitar vendas reais.
const MAX_VALOR_CENTAVOS: i64 = 1_000_000_000;
/// R$ 9.999.999.999,99: o que cabe em NUMERIC(12,2) nas colunas de total (0040). Item, subtotal e
/// total acima disso seriam recusados pelo banco com um erro genérico; recusamos antes, com motivo.
const MAX_TOTAL_CENTAVOS: i64 = 999_999_999_999;
/// Trava de segurança contra estouro de i64 em qualquer valor monetário recebido.
const LIMITE_ABSOLUTO_CENTAVOS: f64 = 1e15;
const MAX_OBSERVACOES: usize = 2000;

// ═══════════════════════════════════════════════════════════
// Entradas e saídas
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(default)]
pub struct OrcamentoInsumosItemInput {
    pub produto_id: i32,
    pub quantidade: i32,
    pub valor_unitario: f64,
}

/// Criar/atualizar. Totais e nomes dos itens nunca vêm da tela.
#[derive(Debug, Deserialize, Default, Clone)]
#[serde(default)]
pub struct OrcamentoInsumosInput {
    pub cliente_id: i32,
    pub contato_id: Option<i32>,
    /// `AAAA-MM-DD`. Vazio = hoje + 7 dias.
    pub validade: Option<String>,
    pub observacoes: Option<String>,
    pub desconto: Option<f64>,
    pub itens: Vec<OrcamentoInsumosItemInput>,
    /// Obrigatório ao atualizar.
    pub atualizado_em: Option<String>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(default)]
pub struct FiltrosOrcamentosInsumos {
    pub status: Option<String>,
    pub cliente_id: Option<i32>,
    pub busca: Option<String>,
    pub page: Option<i32>,
}

/// Enviar, reprovar e entregar só precisam identificar o orçamento e a versão vista pela tela.
#[derive(Debug, Deserialize, Default, Clone)]
#[serde(default)]
pub struct OrcamentoInsumosAcaoInput {
    pub id: i32,
    pub atualizado_em: String,
    /// Só para `marcar_enviado`: EMAIL, WHATSAPP ou PDF (registrado na auditoria).
    pub canal: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct AprovarOrcamentoInsumosInput {
    pub id: i32,
    pub atualizado_em: String,
    /// Vazio = "A combinar".
    #[serde(default)]
    pub pagamento: Option<FormaPagamento>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(default)]
pub struct CancelarOrcamentoInsumosInput {
    pub id: i32,
    pub atualizado_em: String,
    /// Exigido quando o orçamento já foi aprovado: cancelar devolve os itens ao estoque.
    pub confirmar_devolucao_estoque: bool,
}

#[derive(Debug, Serialize, FromRow)]
pub struct OrcamentoInsumosRow {
    pub id: i32,
    pub empresa_id: i32,
    pub numero: i32,
    pub numero_exibicao: String,
    pub cliente_id: i32,
    pub cliente_nome: Option<String>,
    pub cliente_documento: Option<String>,
    pub cliente_email: Option<String>,
    pub cliente_telefone: Option<String>,
    pub cliente_receber_email: Option<bool>,
    pub cliente_receber_whatsapp: Option<bool>,
    pub contato_id: Option<i32>,
    pub contato_nome: Option<String>,
    pub contato_email: Option<String>,
    pub contato_telefone: Option<String>,
    pub status: String,
    pub validade: Option<String>,
    pub observacoes: Option<String>,
    pub desconto: f64,
    pub valor_subtotal: f64,
    pub valor_total: f64,
    pub forma_pagamento_codigo: Option<String>,
    pub forma_pagamento_detalhe: Option<String>,
    pub criado_por_profile_id: Option<i32>,
    pub criado_em: String,
    pub atualizado_em: String,
    pub enviado_em: Option<String>,
    pub decidido_em: Option<String>,
    pub entregue_em: Option<String>,
    pub total_itens: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct OrcamentoInsumosItemRow {
    pub id: i32,
    pub orcamento_id: i32,
    pub produto_id: i32,
    pub descricao: String,
    pub categoria: String,
    pub quantidade: i32,
    pub valor_unitario: f64,
    pub valor_total: f64,
    /// Saldo atual do produto, para a tela avisar antes de aprovar.
    pub saldo_estoque: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct OrcamentoInsumosDetalhe {
    #[serde(flatten)]
    pub orcamento: OrcamentoInsumosRow,
    pub itens: Vec<OrcamentoInsumosItemRow>,
}

const ORCAMENTO_SELECT: &str = "
    SELECT o.id, o.empresa_id, o.numero, ('OI-' || o.numero)::TEXT AS numero_exibicao,
           o.cliente_id,
           CASE WHEN c.tipo_pessoa = 'PJ'
                THEN COALESCE(NULLIF(BTRIM(c.nome_fantasia), ''), NULLIF(BTRIM(c.razao_social), ''), c.nome)
                ELSE c.nome END AS cliente_nome,
           COALESCE(c.documento, c.cpf_cnpj) AS cliente_documento,
           c.email AS cliente_email, c.telefone AS cliente_telefone,
           c.receber_email AS cliente_receber_email, c.receber_whatsapp AS cliente_receber_whatsapp,
           o.contato_id, ct.nome AS contato_nome, ct.email AS contato_email, ct.telefone AS contato_telefone,
           o.status, o.validade::TEXT AS validade, o.observacoes,
           o.desconto::FLOAT8 AS desconto,
           (o.valor_total + o.desconto)::FLOAT8 AS valor_subtotal,
           o.valor_total::FLOAT8 AS valor_total,
           o.forma_pagamento_codigo, o.forma_pagamento_detalhe, o.criado_por_profile_id,
           o.criado_em::TEXT AS criado_em, o.atualizado_em::TEXT AS atualizado_em,
           o.enviado_em::TEXT AS enviado_em, o.decidido_em::TEXT AS decidido_em,
           o.entregue_em::TEXT AS entregue_em,
           (SELECT COUNT(*) FROM orcamento_insumos_itens i WHERE i.orcamento_id = o.id)::BIGINT AS total_itens
    FROM orcamentos_insumos o
    JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN cliente_contatos ct ON ct.id = o.contato_id";

// ═══════════════════════════════════════════════════════════
// Regras puras (sem banco)
// ═══════════════════════════════════════════════════════════

pub fn referencia_orcamento(numero: i32) -> String {
    format!("OI-{numero}")
}

/// Converte reais em centavos inteiros, recusando valores inválidos.
pub fn reais_para_centavos(valor: f64, campo: &str) -> Result<i64, String> {
    if !valor.is_finite() {
        return Err(format!("{campo} inválido."));
    }
    if valor < 0.0 {
        return Err(format!("{campo} não pode ser negativo."));
    }
    let centavos = (valor * 100.0).round();
    if centavos > LIMITE_ABSOLUTO_CENTAVOS {
        return Err(format!("{campo} acima do limite permitido."));
    }
    Ok(centavos as i64)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Totais {
    pub itens_centavos: Vec<i64>,
    pub subtotal_centavos: i64,
    pub desconto_centavos: i64,
    pub total_centavos: i64,
}

/// Total de cada item, subtotal e total já com o desconto. `itens` = (quantidade, valor unitário em centavos).
pub fn calcular_totais(itens: &[(i32, i64)], desconto_centavos: i64) -> Result<Totais, String> {
    let mut itens_centavos = Vec::with_capacity(itens.len());
    let mut subtotal: i64 = 0;
    for (quantidade, unitario) in itens {
        let total_item = i64::from(*quantidade)
            .checked_mul(*unitario)
            .ok_or_else(|| "Valor do item acima do limite permitido.".to_string())?;
        if total_item > MAX_TOTAL_CENTAVOS {
            return Err("O total de um item passa de R$ 9.999.999.999,99. Reduza a quantidade ou o valor unitário.".to_string());
        }
        subtotal = subtotal
            .checked_add(total_item)
            .ok_or_else(|| "Total do orçamento acima do limite permitido.".to_string())?;
        if subtotal > MAX_TOTAL_CENTAVOS {
            return Err("O total do orçamento passa de R$ 9.999.999.999,99. Reduza quantidades ou valores.".to_string());
        }
        itens_centavos.push(total_item);
    }
    if desconto_centavos < 0 {
        return Err("Desconto não pode ser negativo.".to_string());
    }
    if desconto_centavos > subtotal {
        return Err("O desconto não pode ser maior que o total dos itens.".to_string());
    }
    Ok(Totais {
        itens_centavos,
        subtotal_centavos: subtotal,
        desconto_centavos,
        total_centavos: subtotal - desconto_centavos,
    })
}

/// Confere quantidade, valor e repetição dos itens recebidos da tela.
pub fn validar_itens(itens: &[OrcamentoInsumosItemInput]) -> Result<Vec<(i32, i64)>, String> {
    if itens.is_empty() {
        return Err("Inclua pelo menos um item no orçamento.".to_string());
    }
    if itens.len() > MAX_ITENS {
        return Err(format!("O orçamento aceita no máximo {MAX_ITENS} itens."));
    }
    let mut vistos = std::collections::HashSet::new();
    let mut resultado = Vec::with_capacity(itens.len());
    for item in itens {
        if item.produto_id <= 0 {
            return Err("Item com produto inválido.".to_string());
        }
        if !vistos.insert(item.produto_id) {
            return Err("O mesmo produto aparece mais de uma vez. Some as quantidades em uma linha só.".to_string());
        }
        if item.quantidade <= 0 {
            return Err("A quantidade de cada item deve ser maior que zero.".to_string());
        }
        if item.quantidade > MAX_QUANTIDADE {
            return Err(format!("Quantidade acima do limite de {MAX_QUANTIDADE} por item."));
        }
        let unitario = reais_para_centavos(item.valor_unitario, "Valor unitário")?;
        if unitario > MAX_VALOR_CENTAVOS {
            return Err("Valor unitário acima do limite permitido.".to_string());
        }
        resultado.push((item.quantidade, unitario));
    }
    Ok(resultado)
}

/// Validade em `AAAA-MM-DD`; vazio = hoje + 7 dias. Aceita ontem por causa do fuso.
pub fn validar_validade(valor: Option<&str>, hoje: NaiveDate) -> Result<NaiveDate, String> {
    let Some(texto) = valor.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(hoje + Duration::days(VALIDADE_PADRAO_DIAS));
    };
    let data = NaiveDate::parse_from_str(texto, "%Y-%m-%d")
        .map_err(|_| "Validade inválida. Use uma data no formato AAAA-MM-DD.".to_string())?;
    if data < hoje - Duration::days(1) {
        return Err("A validade não pode estar no passado.".to_string());
    }
    Ok(data)
}

fn validar_observacoes(valor: Option<&str>) -> Result<Option<String>, String> {
    let texto = valor.map(str::trim).filter(|v| !v.is_empty());
    if let Some(texto) = texto {
        if texto.chars().count() > MAX_OBSERVACOES {
            return Err(format!("As observações aceitam no máximo {MAX_OBSERVACOES} caracteres."));
        }
    }
    Ok(texto.map(str::to_string))
}

/// Fluxo permitido entre status. Estados finais não saem de onde estão.
pub fn transicao_permitida(de: &str, para: &str) -> bool {
    matches!(
        (de, para),
        (STATUS_RASCUNHO, STATUS_ENVIADO)
            | (STATUS_ENVIADO, STATUS_ENVIADO)
            | (STATUS_RASCUNHO | STATUS_ENVIADO, STATUS_APROVADO)
            | (STATUS_RASCUNHO | STATUS_ENVIADO, STATUS_REPROVADO)
            | (STATUS_RASCUNHO | STATUS_ENVIADO | STATUS_APROVADO, STATUS_CANCELADO)
            | (STATUS_APROVADO, STATUS_ENTREGUE)
    )
}

fn exigir_transicao(de: &str, para: &str, referencia: &str) -> Result<(), String> {
    if transicao_permitida(de, para) {
        return Ok(());
    }
    Err(format!(
        "O orçamento {referencia} está {} e não pode ir para {}.",
        de.to_lowercase(),
        para.to_lowercase()
    ))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FaltaEstoque {
    pub descricao: String,
    pub necessario: i32,
    pub disponivel: i32,
}

/// Itens cujo saldo não cobre a quantidade pedida. `itens` = (descrição, necessário, saldo).
pub fn faltas_de_estoque(itens: &[(String, i32, i32)]) -> Vec<FaltaEstoque> {
    itens
        .iter()
        .filter(|(_, necessario, disponivel)| necessario > disponivel)
        .map(|(descricao, necessario, disponivel)| FaltaEstoque {
            descricao: descricao.clone(),
            necessario: *necessario,
            disponivel: (*disponivel).max(0),
        })
        .collect()
}

pub fn mensagem_falta_de_estoque(referencia: &str, faltas: &[FaltaEstoque]) -> String {
    let linhas = faltas
        .iter()
        .map(|f| format!("- {}: precisa de {}, há {} em estoque", f.descricao, f.necessario, f.disponivel))
        .collect::<Vec<_>>()
        .join("\n");
    format!("Estoque insuficiente para aprovar {referencia}. Nada foi baixado.\n{linhas}")
}

fn pagamento_da_aprovacao(pagamento: Option<&FormaPagamento>) -> Result<(String, Option<String>), String> {
    let padrao = FormaPagamentoCodigo::ACombinar;
    let codigo = pagamento.map(|p| &p.codigo).unwrap_or(&padrao);
    let detalhe = pagamento.and_then(|p| p.detalhe.as_deref());
    let (codigo, detalhe) = normalize_forma_pagamento(Some(codigo), detalhe)?;
    Ok((codigo.unwrap_or_else(|| "A_COMBINAR".to_string()), detalhe))
}

fn exigir_token(token: &str) -> Result<&str, String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("Token de concorrência do orçamento de insumos é obrigatório.".to_string());
    }
    Ok(token)
}

fn conflito_de_concorrencia() -> String {
    "Conflito de concorrência: o orçamento foi alterado por outro técnico. Recarregue os dados antes de continuar.".to_string()
}

fn normalizar_canal(canal: Option<&str>) -> &'static str {
    match canal.map(|c| c.trim().to_uppercase()).as_deref() {
        Some("EMAIL") => "EMAIL",
        Some("WHATSAPP") => "WHATSAPP",
        _ => "PDF",
    }
}

// ═══════════════════════════════════════════════════════════
// Acesso ao banco
// ═══════════════════════════════════════════════════════════

type Tx<'a> = sqlx::Transaction<'a, Postgres>;

struct OrcamentoTravado {
    numero: i32,
    status: String,
}

/// Trava a linha do orçamento da empresa e confere a versão que a tela viu.
async fn travar_orcamento(
    tx: &mut Tx<'_>,
    empresa_id: i32,
    id: i32,
    token: &str,
) -> Result<OrcamentoTravado, String> {
    let linha: Option<(i32, String, bool)> = sqlx::query_as(
        "SELECT numero, status, (atualizado_em = $3::TIMESTAMPTZ) AS versao_atual
         FROM orcamentos_insumos
         WHERE id = $1 AND empresa_id = $2
         FOR UPDATE",
    )
    .bind(id)
    .bind(empresa_id)
    .bind(token)
    .fetch_optional(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    let (numero, status, versao_atual) = linha.ok_or_else(|| "Orçamento de insumos não encontrado.".to_string())?;
    if !versao_atual {
        return Err(conflito_de_concorrencia());
    }
    Ok(OrcamentoTravado { numero, status })
}

async fn carregar_detalhe(pool: &PgPool, empresa_id: i32, id: i32) -> Result<OrcamentoInsumosDetalhe, String> {
    let mut consulta = QueryBuilder::<Postgres>::new(ORCAMENTO_SELECT);
    consulta
        .push(" WHERE o.id = ")
        .push_bind(id)
        .push(" AND o.empresa_id = ")
        .push_bind(empresa_id);
    let orcamento = consulta
        .build_query_as::<OrcamentoInsumosRow>()
        .fetch_optional(pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?
        .ok_or_else(|| "Orçamento de insumos não encontrado.".to_string())?;

    let itens = sqlx::query_as::<_, OrcamentoInsumosItemRow>(
        "SELECT i.id, i.orcamento_id, i.produto_id, i.descricao, i.categoria, i.quantidade,
                i.valor_unitario::FLOAT8 AS valor_unitario, i.valor_total::FLOAT8 AS valor_total,
                p.quantidade_estoque AS saldo_estoque
         FROM orcamento_insumos_itens i
         LEFT JOIN produtos p ON p.id = i.produto_id AND p.empresa_id = i.empresa_id
         WHERE i.orcamento_id = $1 AND i.empresa_id = $2
         ORDER BY i.id",
    )
    .bind(id)
    .bind(empresa_id)
    .fetch_all(pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    Ok(OrcamentoInsumosDetalhe { orcamento, itens })
}

struct ItemCalculado {
    produto_id: i32,
    descricao: String,
    categoria: String,
    quantidade: i32,
    unitario_centavos: i64,
    total_centavos: i64,
}

/// Confere cliente e contato na empresa da sessão.
async fn validar_cliente_e_contato(
    tx: &mut Tx<'_>,
    empresa_id: i32,
    cliente_id: i32,
    contato_id: Option<i32>,
) -> Result<(), String> {
    if cliente_id <= 0 {
        return Err("Escolha o cliente do orçamento.".to_string());
    }
    let cliente_ok: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM clientes WHERE id = $1 AND empresa_id = $2 AND COALESCE(ativo, true))",
    )
    .bind(cliente_id)
    .bind(empresa_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    if !cliente_ok {
        return Err("Cliente não encontrado nesta empresa.".to_string());
    }
    if let Some(contato_id) = contato_id {
        let contato_ok: bool = sqlx::query_scalar(
            "SELECT EXISTS (
                 SELECT 1 FROM cliente_contatos
                 WHERE id = $1 AND empresa_id = $2 AND cliente_id = $3 AND ativo = true
             )",
        )
        .bind(contato_id)
        .bind(empresa_id)
        .bind(cliente_id)
        .fetch_one(&mut **tx)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
        if !contato_ok {
            return Err("O contato escolhido não pertence a este cliente.".to_string());
        }
    }
    Ok(())
}

/// Copia nome e categoria dos produtos e calcula cada linha. Produto de outra empresa,
/// inativo ou da categoria IMPRESSORA é recusado.
async fn montar_itens(
    tx: &mut Tx<'_>,
    empresa_id: i32,
    itens: &[OrcamentoInsumosItemInput],
    valores: &[(i32, i64)],
) -> Result<Vec<ItemCalculado>, String> {
    let ids = itens.iter().map(|i| i.produto_id).collect::<Vec<_>>();
    let produtos: Vec<(i32, String, String, Option<bool>)> = sqlx::query_as(
        "SELECT id, nome, categoria, ativo FROM produtos WHERE empresa_id = $1 AND id = ANY($2)",
    )
    .bind(empresa_id)
    .bind(&ids)
    .fetch_all(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    let mut calculados = Vec::with_capacity(itens.len());
    for (item, (quantidade, unitario)) in itens.iter().zip(valores) {
        let (_, nome, categoria, ativo) = produtos
            .iter()
            .find(|(id, ..)| *id == item.produto_id)
            .ok_or_else(|| "Um dos produtos não foi encontrado nesta empresa.".to_string())?;
        if !ativo.unwrap_or(true) {
            return Err(format!("O produto \"{nome}\" está inativo e não pode ser orçado."));
        }
        if categoria == "IMPRESSORA" {
            return Err(format!("\"{nome}\" é uma impressora. Orçamento de insumos não inclui impressoras."));
        }
        calculados.push(ItemCalculado {
            produto_id: item.produto_id,
            descricao: nome.clone(),
            categoria: categoria.clone(),
            quantidade: *quantidade,
            unitario_centavos: *unitario,
            total_centavos: i64::from(*quantidade) * unitario,
        });
    }
    Ok(calculados)
}

async fn gravar_itens(
    tx: &mut Tx<'_>,
    empresa_id: i32,
    orcamento_id: i32,
    itens: &[ItemCalculado],
) -> Result<(), String> {
    for item in itens {
        sqlx::query(
            "INSERT INTO orcamento_insumos_itens
                 (orcamento_id, empresa_id, produto_id, descricao, categoria, quantidade, valor_unitario, valor_total)
             VALUES ($1, $2, $3, $4, $5, $6, $7::BIGINT::NUMERIC / 100, $8::BIGINT::NUMERIC / 100)",
        )
        .bind(orcamento_id)
        .bind(empresa_id)
        .bind(item.produto_id)
        .bind(&item.descricao)
        .bind(&item.categoria)
        .bind(item.quantidade)
        .bind(item.unitario_centavos)
        .bind(item.total_centavos)
        .execute(&mut **tx)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
    }
    Ok(())
}

async fn abrir_transacao(pool: &PgPool) -> Result<Tx<'static>, String> {
    pool.begin().await.map_err(super::operator_errors::mapear_erro_sql)
}

async fn confirmar(tx: Tx<'_>) -> Result<(), String> {
    tx.commit().await.map_err(|e| {
        error!("Erro ao confirmar transação do orçamento de insumos: {}", e);
        super::operator_errors::mapear_erro_sql(e)
    })
}

fn add_filtros(consulta: &mut QueryBuilder<Postgres>, empresa_id: i32, filtros: &FiltrosOrcamentosInsumos) {
    consulta.push(" WHERE o.empresa_id = ").push_bind(empresa_id);
    if let Some(status) = filtros
        .status
        .as_deref()
        .map(|s| s.trim().to_uppercase())
        .filter(|s| STATUS_VALIDOS.contains(&s.as_str()))
    {
        consulta.push(" AND o.status = ").push_bind(status);
    }
    if let Some(cliente_id) = filtros.cliente_id.filter(|id| *id > 0) {
        consulta.push(" AND o.cliente_id = ").push_bind(cliente_id);
    }
    if let Some(busca) = filtros.busca.as_deref().map(str::trim).filter(|b| !b.is_empty()) {
        let padrao = format!("%{busca}%");
        consulta
            .push(" AND (('OI-' || o.numero) ILIKE ")
            .push_bind(padrao.clone())
            .push(" OR COALESCE(c.nome, '') ILIKE ")
            .push_bind(padrao.clone())
            .push(" OR COALESCE(c.nome_fantasia, '') ILIKE ")
            .push_bind(padrao.clone())
            .push(" OR COALESCE(c.razao_social, '') ILIKE ")
            .push_bind(padrao.clone())
            .push(" OR COALESCE(c.documento, c.cpf_cnpj, '') ILIKE ")
            .push_bind(padrao)
            .push(")");
    }
}

// ═══════════════════════════════════════════════════════════
// Comandos
// ═══════════════════════════════════════════════════════════

/// Lista orçamentos da empresa, do mais novo para o mais antigo.
#[tauri::command]
#[instrument(skip_all)]
pub async fn listar_orcamentos_insumos(
    filtros: Option<FiltrosOrcamentosInsumos>,
) -> Result<PaginatedResult<OrcamentoInsumosRow>, String> {
    let filtros = filtros.unwrap_or_default();
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;

    let mut contagem = QueryBuilder::<Postgres>::new(
        "SELECT COUNT(*) FROM orcamentos_insumos o JOIN clientes c ON c.id = o.cliente_id",
    );
    add_filtros(&mut contagem, empresa_id, &filtros);
    let total = contagem
        .build_query_scalar::<i64>()
        .fetch_one(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;

    let limite = i64::from(UI_PAGE_SIZE);
    let deslocamento = i64::from(filtros.page.unwrap_or(0).max(0)) * limite;
    let mut consulta = QueryBuilder::<Postgres>::new(ORCAMENTO_SELECT);
    add_filtros(&mut consulta, empresa_id, &filtros);
    consulta
        .push(" ORDER BY o.numero DESC LIMIT ")
        .push_bind(limite)
        .push(" OFFSET ")
        .push_bind(deslocamento);
    let items = consulta
        .build_query_as::<OrcamentoInsumosRow>()
        .fetch_all(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;

    Ok(PaginatedResult { items, total, below_minimum: None })
}

#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn obter_orcamento_insumos(id: i32) -> Result<OrcamentoInsumosDetalhe, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    carregar_detalhe(&pool, empresa_id, id).await
}

#[tauri::command]
#[instrument(skip_all, fields(cliente_id = input.cliente_id))]
pub async fn criar_orcamento_insumos(input: OrcamentoInsumosInput) -> Result<OrcamentoInsumosDetalhe, String> {
    let actor = require_permission(PERMISSION_FINANCIAL_ACTIONS)?;
    let valores = validar_itens(&input.itens)?;
    let desconto = reais_para_centavos(input.desconto.unwrap_or(0.0), "Desconto")?;
    let validade = validar_validade(input.validade.as_deref(), Utc::now().date_naive())?;
    let observacoes = validar_observacoes(input.observacoes.as_deref())?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = abrir_transacao(&pool).await?;
    validar_cliente_e_contato(&mut tx, empresa_id, input.cliente_id, input.contato_id).await?;
    let itens = montar_itens(&mut tx, empresa_id, &input.itens, &valores).await?;
    let totais = calcular_totais(&valores, desconto)?;

    // O contador trava a linha até o commit: dois orçamentos simultâneos não repetem número.
    let numero: i32 = sqlx::query_scalar(
        "INSERT INTO orcamentos_insumos_contadores (empresa_id, ultimo_numero) VALUES ($1, 1)
         ON CONFLICT (empresa_id) DO UPDATE
             SET ultimo_numero = orcamentos_insumos_contadores.ultimo_numero + 1
         RETURNING ultimo_numero",
    )
    .bind(empresa_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    let id: i32 = sqlx::query_scalar(
        "INSERT INTO orcamentos_insumos
             (empresa_id, numero, cliente_id, contato_id, status, validade, observacoes,
              desconto, valor_total, criado_por_profile_id)
         VALUES ($1, $2, $3, $4, 'RASCUNHO', $5, $6,
                 $7::BIGINT::NUMERIC / 100, $8::BIGINT::NUMERIC / 100, $9)
         RETURNING id",
    )
    .bind(empresa_id)
    .bind(numero)
    .bind(input.cliente_id)
    .bind(input.contato_id)
    .bind(validade)
    .bind(observacoes)
    .bind(totais.desconto_centavos)
    .bind(totais.total_centavos)
    .bind(actor.id)
    .fetch_one(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    gravar_itens(&mut tx, empresa_id, id, &itens).await?;
    confirmar(tx).await?;

    record_security_event(
        "INSUMOS_QUOTE_CREATED",
        Some(&actor),
        format!(
            "orcamento={}; cliente_id={}; itens={}; total_centavos={}",
            referencia_orcamento(numero),
            input.cliente_id,
            itens.len(),
            totais.total_centavos
        ),
        true,
    )
    .await;
    info!("Orçamento de insumos {} criado", referencia_orcamento(numero));
    carregar_detalhe(&pool, empresa_id, id).await
}

/// Edita um orçamento em rascunho ou enviado. Um enviado volta para rascunho: o cliente
/// recebeu outra versão, então é preciso enviar de novo.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn atualizar_orcamento_insumos(
    id: i32,
    input: OrcamentoInsumosInput,
) -> Result<OrcamentoInsumosDetalhe, String> {
    let actor = require_permission(PERMISSION_FINANCIAL_ACTIONS)?;
    let token = exigir_token(input.atualizado_em.as_deref().unwrap_or(""))?.to_string();
    let valores = validar_itens(&input.itens)?;
    let desconto = reais_para_centavos(input.desconto.unwrap_or(0.0), "Desconto")?;
    let validade = validar_validade(input.validade.as_deref(), Utc::now().date_naive())?;
    let observacoes = validar_observacoes(input.observacoes.as_deref())?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = abrir_transacao(&pool).await?;
    let atual = travar_orcamento(&mut tx, empresa_id, id, &token).await?;
    let referencia = referencia_orcamento(atual.numero);
    if atual.status != STATUS_RASCUNHO && atual.status != STATUS_ENVIADO {
        return Err(format!(
            "O orçamento {referencia} está {} e não pode mais ser editado.",
            atual.status.to_lowercase()
        ));
    }
    validar_cliente_e_contato(&mut tx, empresa_id, input.cliente_id, input.contato_id).await?;
    let itens = montar_itens(&mut tx, empresa_id, &input.itens, &valores).await?;
    let totais = calcular_totais(&valores, desconto)?;

    let alteradas = sqlx::query(
        "UPDATE orcamentos_insumos SET
             cliente_id = $1, contato_id = $2, validade = $3, observacoes = $4,
             desconto = $5::BIGINT::NUMERIC / 100, valor_total = $6::BIGINT::NUMERIC / 100,
             status = 'RASCUNHO', atualizado_em = NOW()
         WHERE id = $7 AND empresa_id = $8 AND atualizado_em = $9::TIMESTAMPTZ",
    )
    .bind(input.cliente_id)
    .bind(input.contato_id)
    .bind(validade)
    .bind(observacoes)
    .bind(totais.desconto_centavos)
    .bind(totais.total_centavos)
    .bind(id)
    .bind(empresa_id)
    .bind(&token)
    .execute(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?
    .rows_affected();
    if alteradas == 0 {
        return Err(conflito_de_concorrencia());
    }
    sqlx::query("DELETE FROM orcamento_insumos_itens WHERE orcamento_id = $1 AND empresa_id = $2")
        .bind(id)
        .bind(empresa_id)
        .execute(&mut *tx)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
    gravar_itens(&mut tx, empresa_id, id, &itens).await?;
    confirmar(tx).await?;

    record_security_event(
        "INSUMOS_QUOTE_UPDATED",
        Some(&actor),
        format!(
            "orcamento={referencia}; itens={}; total_centavos={}",
            itens.len(),
            totais.total_centavos
        ),
        true,
    )
    .await;
    carregar_detalhe(&pool, empresa_id, id).await
}

/// Aplica uma mudança simples de status (sem estoque) com trava e conferência de versão.
async fn mudar_status_simples(
    input: &OrcamentoInsumosAcaoInput,
    novo_status: &'static str,
    evento: &'static str,
    detalhe_extra: String,
) -> Result<OrcamentoInsumosDetalhe, String> {
    let actor = require_permission(PERMISSION_FINANCIAL_ACTIONS)?;
    let token = exigir_token(&input.atualizado_em)?.to_string();
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = abrir_transacao(&pool).await?;
    let atual = travar_orcamento(&mut tx, empresa_id, input.id, &token).await?;
    let referencia = referencia_orcamento(atual.numero);
    exigir_transicao(&atual.status, novo_status, &referencia)?;

    let alteradas = sqlx::query(
        "UPDATE orcamentos_insumos SET
             status = $1,
             enviado_em = CASE WHEN $1 = 'ENVIADO' THEN NOW() ELSE enviado_em END,
             decidido_em = CASE WHEN $1 = 'REPROVADO' THEN NOW() ELSE decidido_em END,
             entregue_em = CASE WHEN $1 = 'ENTREGUE' THEN NOW() ELSE entregue_em END,
             atualizado_em = NOW()
         WHERE id = $2 AND empresa_id = $3 AND atualizado_em = $4::TIMESTAMPTZ",
    )
    .bind(novo_status)
    .bind(input.id)
    .bind(empresa_id)
    .bind(&token)
    .execute(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?
    .rows_affected();
    if alteradas == 0 {
        return Err(conflito_de_concorrencia());
    }
    confirmar(tx).await?;

    record_security_event(
        evento,
        Some(&actor),
        format!("orcamento={referencia}; {detalhe_extra}"),
        true,
    )
    .await;
    carregar_detalhe(&pool, empresa_id, input.id).await
}

/// Marca o orçamento como enviado ao cliente (depois de gerar o PDF ou enviar por e-mail/WhatsApp).
#[tauri::command]
#[instrument(skip_all, fields(id = input.id))]
pub async fn marcar_orcamento_insumos_enviado(
    input: OrcamentoInsumosAcaoInput,
) -> Result<OrcamentoInsumosDetalhe, String> {
    let canal = normalizar_canal(input.canal.as_deref());
    mudar_status_simples(&input, STATUS_ENVIADO, "INSUMOS_QUOTE_SENT", format!("canal={canal}")).await
}

#[tauri::command]
#[instrument(skip_all, fields(id = input.id))]
pub async fn reprovar_orcamento_insumos(
    input: OrcamentoInsumosAcaoInput,
) -> Result<OrcamentoInsumosDetalhe, String> {
    mudar_status_simples(&input, STATUS_REPROVADO, "INSUMOS_QUOTE_REJECTED", String::new()).await
}

/// Marca a entrega ao cliente. A baixa já foi feita na aprovação.
#[tauri::command]
#[instrument(skip_all, fields(id = input.id))]
pub async fn marcar_orcamento_insumos_entregue(
    input: OrcamentoInsumosAcaoInput,
) -> Result<OrcamentoInsumosDetalhe, String> {
    mudar_status_simples(&input, STATUS_ENTREGUE, "INSUMOS_QUOTE_DELIVERED", String::new()).await
}

/// Aprova e baixa o estoque de todos os itens na mesma transação. Se faltar saldo em
/// qualquer item, recusa e informa a lista do que falta; nada é aprovado nem baixado.
#[tauri::command]
#[instrument(skip_all, fields(id = input.id))]
pub async fn aprovar_orcamento_insumos(
    input: AprovarOrcamentoInsumosInput,
) -> Result<OrcamentoInsumosDetalhe, String> {
    let actor = require_permission(PERMISSION_FINANCIAL_ACTIONS)?;
    let token = exigir_token(&input.atualizado_em)?.to_string();
    let (pagamento_codigo, pagamento_detalhe) = pagamento_da_aprovacao(input.pagamento.as_ref())?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = abrir_transacao(&pool).await?;
    let atual = travar_orcamento(&mut tx, empresa_id, input.id, &token).await?;
    let referencia = referencia_orcamento(atual.numero);
    exigir_transicao(&atual.status, STATUS_APROVADO, &referencia)?;

    // Produtos travados em ordem de id: duas aprovações ao mesmo tempo não se bloqueiam em círculo.
    let linhas: Vec<(i32, String, i32, f64, i32, bool)> = sqlx::query_as(
        "SELECT i.produto_id, i.descricao, i.quantidade, i.valor_unitario::FLOAT8,
                COALESCE(p.quantidade_estoque, 0), COALESCE(p.ativo, true)
         FROM orcamento_insumos_itens i
         JOIN produtos p ON p.id = i.produto_id AND p.empresa_id = i.empresa_id
         WHERE i.orcamento_id = $1 AND i.empresa_id = $2
         ORDER BY i.produto_id
         FOR UPDATE OF p",
    )
    .bind(input.id)
    .bind(empresa_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    if linhas.is_empty() {
        return Err(format!("O orçamento {referencia} não tem itens."));
    }

    let conferencia = linhas
        .iter()
        .map(|(_, descricao, quantidade, _, saldo, ativo)| {
            (descricao.clone(), *quantidade, if *ativo { *saldo } else { 0 })
        })
        .collect::<Vec<_>>();
    let faltas = faltas_de_estoque(&conferencia);
    if !faltas.is_empty() {
        return Err(mensagem_falta_de_estoque(&referencia, &faltas));
    }

    for (produto_id, _, quantidade, valor_unitario, _, _) in &linhas {
        aplicar_movimentacao_em_tx(
            &mut tx,
            empresa_id,
            *produto_id,
            "SAIDA",
            *quantidade,
            ORIGEM_VENDA_INSUMOS,
            Some(&referencia),
            Some(*valor_unitario),
        )
        .await?;
    }

    let alteradas = sqlx::query(
        "UPDATE orcamentos_insumos SET
             status = 'APROVADO', forma_pagamento_codigo = $1, forma_pagamento_detalhe = $2,
             decidido_em = NOW(), atualizado_em = NOW()
         WHERE id = $3 AND empresa_id = $4 AND atualizado_em = $5::TIMESTAMPTZ",
    )
    .bind(&pagamento_codigo)
    .bind(&pagamento_detalhe)
    .bind(input.id)
    .bind(empresa_id)
    .bind(&token)
    .execute(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?
    .rows_affected();
    if alteradas == 0 {
        return Err(conflito_de_concorrencia());
    }
    confirmar(tx).await?;

    record_security_event(
        "INSUMOS_QUOTE_APPROVED",
        Some(&actor),
        format!(
            "orcamento={referencia}; itens={}; pagamento={pagamento_codigo}; origem_estoque={ORIGEM_VENDA_INSUMOS}",
            linhas.len()
        ),
        true,
    )
    .await;
    info!("Orçamento de insumos {} aprovado", referencia);
    carregar_detalhe(&pool, empresa_id, input.id).await
}

/// Cancela. Se já estava aprovado (estoque baixado, ainda não entregue), devolve cada item
/// ao estoque, e só faz isso com a confirmação explícita no input.
#[tauri::command]
#[instrument(skip_all, fields(id = input.id))]
pub async fn cancelar_orcamento_insumos(
    input: CancelarOrcamentoInsumosInput,
) -> Result<OrcamentoInsumosDetalhe, String> {
    let actor = require_permission(PERMISSION_FINANCIAL_ACTIONS)?;
    let token = exigir_token(&input.atualizado_em)?.to_string();
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = abrir_transacao(&pool).await?;
    let atual = travar_orcamento(&mut tx, empresa_id, input.id, &token).await?;
    let referencia = referencia_orcamento(atual.numero);
    exigir_transicao(&atual.status, STATUS_CANCELADO, &referencia)?;

    let devolve_estoque = atual.status == STATUS_APROVADO;
    if devolve_estoque && !input.confirmar_devolucao_estoque {
        return Err(format!(
            "O orçamento {referencia} já baixou o estoque. Confirme a devolução dos itens para cancelar."
        ));
    }

    let mut devolvidos = 0usize;
    if devolve_estoque {
        let linhas: Vec<(i32, String, i32, f64)> = sqlx::query_as(
            "SELECT produto_id, descricao, quantidade, valor_unitario::FLOAT8
             FROM orcamento_insumos_itens
             WHERE orcamento_id = $1 AND empresa_id = $2
             ORDER BY produto_id",
        )
        .bind(input.id)
        .bind(empresa_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
        for (produto_id, descricao, quantidade, valor_unitario) in &linhas {
            aplicar_movimentacao_em_tx(
                &mut tx,
                empresa_id,
                *produto_id,
                "ENTRADA",
                *quantidade,
                ORIGEM_VENDA_INSUMOS,
                Some(&referencia),
                Some(*valor_unitario),
            )
            .await
            .map_err(|erro| format!("Não foi possível devolver \"{descricao}\" ao estoque: {erro}"))?;
            devolvidos += 1;
        }
    }

    let alteradas = sqlx::query(
        "UPDATE orcamentos_insumos SET
             status = 'CANCELADO', decidido_em = COALESCE(decidido_em, NOW()), atualizado_em = NOW()
         WHERE id = $1 AND empresa_id = $2 AND atualizado_em = $3::TIMESTAMPTZ",
    )
    .bind(input.id)
    .bind(empresa_id)
    .bind(&token)
    .execute(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?
    .rows_affected();
    if alteradas == 0 {
        return Err(conflito_de_concorrencia());
    }
    confirmar(tx).await?;

    record_security_event(
        "INSUMOS_QUOTE_CANCELLED",
        Some(&actor),
        format!("orcamento={referencia}; estoque_devolvido={devolve_estoque}; itens_devolvidos={devolvidos}"),
        true,
    )
    .await;
    carregar_detalhe(&pool, empresa_id, input.id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(produto_id: i32, quantidade: i32, valor_unitario: f64) -> OrcamentoInsumosItemInput {
        OrcamentoInsumosItemInput { produto_id, quantidade, valor_unitario }
    }

    fn data(texto: &str) -> NaiveDate {
        NaiveDate::parse_from_str(texto, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn centavos_arredondam_sem_erro_de_ponto_flutuante() {
        assert_eq!(reais_para_centavos(10.0, "v").unwrap(), 1000);
        assert_eq!(reais_para_centavos(0.1 + 0.2, "v").unwrap(), 30);
        assert_eq!(reais_para_centavos(19.99, "v").unwrap(), 1999);
        assert_eq!(reais_para_centavos(0.07, "v").unwrap(), 7);
        assert_eq!(reais_para_centavos(1.005, "v").unwrap(), 100);
        assert!(reais_para_centavos(-0.01, "v").unwrap_err().contains("negativo"));
        assert!(reais_para_centavos(f64::NAN, "v").is_err());
        assert!(reais_para_centavos(f64::INFINITY, "v").is_err());
    }

    #[test]
    fn totais_somam_itens_e_aplicam_desconto() {
        let totais = calcular_totais(&[(3, 1050), (2, 2500)], 550).unwrap();
        assert_eq!(totais.itens_centavos, vec![3150, 5000]);
        assert_eq!(totais.subtotal_centavos, 8150);
        assert_eq!(totais.total_centavos, 7600);
    }

    #[test]
    fn desconto_nao_pode_passar_do_subtotal() {
        assert!(calcular_totais(&[(1, 1000)], 1001).unwrap_err().contains("desconto"));
        assert_eq!(calcular_totais(&[(1, 1000)], 1000).unwrap().total_centavos, 0);
        assert!(calcular_totais(&[(1, 1000)], -1).is_err());
    }

    #[test]
    fn totais_recusam_o_que_nao_cabe_no_banco() {
        // Limite exato (R$ 9.999.999.999,99) passa; um centavo a mais, em item ou soma, não.
        assert_eq!(calcular_totais(&[(1, MAX_TOTAL_CENTAVOS)], 0).unwrap().total_centavos, MAX_TOTAL_CENTAVOS);
        assert!(calcular_totais(&[(1, MAX_TOTAL_CENTAVOS + 1)], 0).unwrap_err().contains("9.999.999.999,99"));
        // 100.000 unidades a R$ 10.000.000,00 (o que as validações por campo aceitam).
        assert!(calcular_totais(&[(MAX_QUANTIDADE, MAX_VALOR_CENTAVOS)], 0).unwrap_err().contains("item"));
        let soma = calcular_totais(&[(1, MAX_TOTAL_CENTAVOS), (1, 1)], 0).unwrap_err();
        assert!(soma.contains("total do orçamento") && soma.contains("9.999.999.999,99"), "{soma}");
    }

    #[test]
    fn totais_recusam_estouro() {
        assert!(calcular_totais(&[(i32::MAX, i64::MAX)], 0).is_err());
    }

    #[test]
    fn itens_exigem_quantidade_valor_e_produto_unico() {
        assert!(validar_itens(&[]).unwrap_err().contains("pelo menos um item"));
        assert!(validar_itens(&[item(1, 0, 1.0)]).unwrap_err().contains("maior que zero"));
        assert!(validar_itens(&[item(1, -2, 1.0)]).is_err());
        assert!(validar_itens(&[item(1, 1, -1.0)]).unwrap_err().contains("negativo"));
        assert!(validar_itens(&[item(0, 1, 1.0)]).unwrap_err().contains("produto inválido"));
        assert!(validar_itens(&[item(1, 1, 1.0), item(1, 2, 1.0)]).unwrap_err().contains("mais de uma vez"));
        assert!(validar_itens(&[item(1, MAX_QUANTIDADE + 1, 1.0)]).is_err());
        assert_eq!(validar_itens(&[item(1, 2, 0.0), item(2, 1, 12.34)]).unwrap(), vec![(2, 0), (1, 1234)]);
    }

    #[test]
    fn validade_padrao_e_sete_dias() {
        let hoje = data("2026-10-20");
        assert_eq!(validar_validade(None, hoje).unwrap(), data("2026-10-27"));
        assert_eq!(validar_validade(Some("  "), hoje).unwrap(), data("2026-10-27"));
        assert_eq!(validar_validade(Some("2026-11-01"), hoje).unwrap(), data("2026-11-01"));
        assert_eq!(validar_validade(Some("2026-10-19"), hoje).unwrap(), data("2026-10-19"));
        assert!(validar_validade(Some("2026-10-18"), hoje).unwrap_err().contains("passado"));
        assert!(validar_validade(Some("20/10/2026"), hoje).unwrap_err().contains("inválida"));
    }

    #[test]
    fn fluxo_de_status_permitido() {
        assert!(transicao_permitida("RASCUNHO", "ENVIADO"));
        assert!(transicao_permitida("ENVIADO", "ENVIADO"));
        assert!(transicao_permitida("RASCUNHO", "APROVADO"));
        assert!(transicao_permitida("ENVIADO", "APROVADO"));
        assert!(transicao_permitida("ENVIADO", "REPROVADO"));
        assert!(transicao_permitida("APROVADO", "ENTREGUE"));
        assert!(transicao_permitida("APROVADO", "CANCELADO"));
        assert!(transicao_permitida("RASCUNHO", "CANCELADO"));
        for final_ in ["REPROVADO", "CANCELADO", "ENTREGUE"] {
            for destino in STATUS_VALIDOS {
                assert!(!transicao_permitida(final_, destino), "{final_} -> {destino}");
            }
        }
        assert!(!transicao_permitida("APROVADO", "APROVADO"));
        assert!(!transicao_permitida("APROVADO", "REPROVADO"));
        assert!(!transicao_permitida("ENVIADO", "ENTREGUE"));
        assert!(!transicao_permitida("RASCUNHO", "ENTREGUE"));
        assert!(exigir_transicao("ENTREGUE", "CANCELADO", "OI-3").unwrap_err().contains("OI-3"));
    }

    #[test]
    fn faltas_listam_so_o_que_nao_cobre() {
        let itens = vec![
            ("Etiqueta 100x50".to_string(), 10, 4),
            ("Ribbon cera".to_string(), 2, 2),
            ("Cabeça".to_string(), 1, -3),
        ];
        let faltas = faltas_de_estoque(&itens);
        assert_eq!(faltas.len(), 2);
        assert_eq!(faltas[0], FaltaEstoque { descricao: "Etiqueta 100x50".into(), necessario: 10, disponivel: 4 });
        assert_eq!(faltas[1].disponivel, 0);
        let texto = mensagem_falta_de_estoque("OI-12", &faltas);
        assert!(texto.contains("OI-12") && texto.contains("Nada foi baixado"));
        assert!(texto.contains("- Etiqueta 100x50: precisa de 10, há 4 em estoque"));
        assert!(faltas_de_estoque(&[("X".into(), 1, 1)]).is_empty());
    }

    #[test]
    fn pagamento_padrao_e_a_combinar() {
        assert_eq!(pagamento_da_aprovacao(None).unwrap(), ("A_COMBINAR".to_string(), None));
        let pix = FormaPagamento { codigo: FormaPagamentoCodigo::Pix, detalhe: None };
        assert_eq!(pagamento_da_aprovacao(Some(&pix)).unwrap().0, "PIX");
        let outro = FormaPagamento { codigo: FormaPagamentoCodigo::Outro, detalhe: Some("  ".into()) };
        assert!(pagamento_da_aprovacao(Some(&outro)).is_err());
    }

    #[test]
    fn referencia_token_e_canal() {
        assert_eq!(referencia_orcamento(12), "OI-12");
        assert!(exigir_token("  ").is_err());
        assert_eq!(exigir_token(" 2026-01-01 ").unwrap(), "2026-01-01");
        assert_eq!(normalizar_canal(Some("email")), "EMAIL");
        assert_eq!(normalizar_canal(Some("whatsapp")), "WHATSAPP");
        assert_eq!(normalizar_canal(Some("x")), "PDF");
        assert_eq!(normalizar_canal(None), "PDF");
    }

    #[test]
    fn observacoes_tem_limite() {
        assert_eq!(validar_observacoes(Some("  ")).unwrap(), None);
        assert_eq!(validar_observacoes(Some(" ok ")).unwrap(), Some("ok".to_string()));
        assert!(validar_observacoes(Some(&"a".repeat(MAX_OBSERVACOES + 1))).is_err());
    }
}
