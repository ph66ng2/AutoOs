//! Fila de envios de WhatsApp.
//!
//! Toda mensagem (automática ou reenvio manual) entra por `solicitar_envio_whatsapp`: a tela
//! informa só o equipamento e o tipo; o backend busca os dados atualizados, congela o orçamento
//! quando necessário, escolhe o texto e registra cada tentativa. O pedido é único por evento
//! (`envios_whatsapp_pedidos`), e uma tentativa em andamento por pedido impede envio duplicado
//! por clique repetido ou por duas instâncias do AutoOS no mesmo banco.
//!
//! Resultado `INCERTA` (tempo esgotado, erro 5xx, instância interrompida) nunca é repetido sem
//! confirmação explícita: a mensagem pode já ter saído.

use crate::commands::auth::{
    record_security_event, require_active_session_company_id, require_permission,
    PERMISSION_CONFIG_WHATSAPP, PERMISSION_MANAGE_STATUS_LINKS,
};
use crate::commands::orcamento_decisao::{
    emitir_link_decisao, exigir_aceite_online, obter_ou_criar_versao, url_decisao,
};
use crate::commands::types::WhatsappConfigStored;
use crate::commands::whatsapp::{
    carregar_config_armazenada, despachar_evolution, normalizar_telefone_br, redact_long_hex_values,
    ErroProvedor,
};
use crate::db::get_pool;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Postgres, Row, Transaction};
use tracing::{info, instrument};

const PROVEDOR_EVOLUTION: &str = "EVOLUTION";
/// Provedor registrado na tentativa enquanto o processador central ainda não escolheu o transporte.
const PROVEDOR_CENTRAL: &str = "CENTRAL";
/// No modo central o link de decisão nasce no momento do envio; o texto leva este marcador.
pub(crate) const TOKEN_PLACEHOLDER: &str = "{{TOKEN}}";
/// Uma tentativa `PREPARANDO` mais antiga que isto é de uma instância que parou; vira `INCERTA`.
const TENTATIVA_ABANDONADA_MINUTOS: i32 = 2;
const ERRO_MAX_CHARS: usize = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TipoEnvio {
    OrcamentoInformativo,
    OrcamentoDecisao,
    EquipamentoPronto,
}

impl TipoEnvio {
    fn parse(valor: &str) -> Result<Self, String> {
        match valor {
            "orcamento_informativo" => Ok(Self::OrcamentoInformativo),
            "orcamento_decisao" => Ok(Self::OrcamentoDecisao),
            "equipamento_pronto" => Ok(Self::EquipamentoPronto),
            _ => Err("Tipo de envio inválido.".to_string()),
        }
    }

    fn como_texto(self) -> &'static str {
        match self {
            Self::OrcamentoInformativo => "orcamento_informativo",
            Self::OrcamentoDecisao => "orcamento_decisao",
            Self::EquipamentoPronto => "equipamento_pronto",
        }
    }

    /// Tipo mostrado no histórico de comunicações.
    fn tipo_comunicacao(self) -> &'static str {
        match self {
            Self::OrcamentoInformativo => "ORCAMENTO",
            Self::OrcamentoDecisao => "ORCAMENTO_DECISAO",
            Self::EquipamentoPronto => "PRONTO",
        }
    }

    fn usa_versao_do_orcamento(self) -> bool {
        !matches!(self, Self::EquipamentoPronto)
    }
}

#[derive(Debug, Deserialize)]
pub struct SolicitarEnvioInput {
    pub equipamento_id: i32,
    pub tipo: String,
    /// Gesto explícito do operador: cria outra tentativa do mesmo pedido.
    #[serde(default)]
    pub reenvio_manual: bool,
    /// Confirma que uma tentativa de resultado incerto pode ser repetida.
    #[serde(default)]
    pub confirmar_incerto: bool,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResultadoEnvioWhatsapp {
    pub pedido_id: Option<i64>,
    pub tentativa_id: Option<i64>,
    /// `ENVIADA`, `FALHOU`, `INCERTA`, `EM_ANDAMENTO`, `JA_SOLICITADO` ou `REQUER_CONFIRMACAO`.
    pub estado: String,
    /// Estado da última tentativa quando o pedido já existia (`JA_SOLICITADO`).
    pub ultimo_estado: Option<String>,
    pub mensagem: Option<String>,
}

// ─── Mensagens ──────────────────────────────────────────────────────────────

/// Mensagem pronta para o provedor. A Evolution usa `texto`; os campos `template`, `parametros`
/// e `url_botao` descrevem o mesmo conteúdo como modelo aprovado para a Cloud API.
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub(crate) struct MensagemWhatsapp {
    pub template: &'static str,
    pub parametros: Vec<String>,
    /// Parte variável da URL do botão (o token), nunca registrada em log nem em histórico.
    pub url_botao: Option<String>,
    pub texto: String,
    /// Texto gravado no histórico de comunicações, sem token nem URL de decisão.
    pub historico: String,
}

fn formatar_brl(valor: f64) -> String {
    let centavos = (valor.abs() * 100.0).round() as u64;
    let inteiro = (centavos / 100).to_string();
    let mut agrupado = String::new();
    for (indice, digito) in inteiro.chars().enumerate() {
        if indice > 0 && (inteiro.len() - indice).is_multiple_of(3) {
            agrupado.push('.');
        }
        agrupado.push(digito);
    }
    format!("{}R$ {},{:02}", if valor < 0.0 { "-" } else { "" }, agrupado, centavos % 100)
}

/// `2026-10-30` → `30/10/2026`; outros formatos ficam como estão.
fn formatar_data_br(valor: &str) -> String {
    let bytes = valor.as_bytes();
    if valor.len() >= 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && valor[..10].chars().enumerate().all(|(i, c)| matches!(i, 4 | 7) || c.is_ascii_digit())
    {
        format!("{}/{}/{}", &valor[8..10], &valor[5..7], &valor[0..4])
    } else {
        valor.to_string()
    }
}

fn nome_do_equipamento(marca: &str, modelo: &str) -> String {
    format!("{} {}", marca.trim(), modelo.trim()).trim().to_string()
}

pub(crate) fn mensagem_pronto(
    nome: &str,
    marca: &str,
    modelo: &str,
    serial: &str,
    valor: Option<f64>,
) -> MensagemWhatsapp {
    let equipamento = nome_do_equipamento(marca, modelo);
    let valor_texto = valor.filter(|v| *v > 0.0).map(formatar_brl);
    let linha_valor = valor_texto
        .as_ref()
        .map(|v| format!("💰 Valor a pagar: {v}\n"))
        .unwrap_or_default();
    let texto = format!(
        "🎉 *Ótimas notícias, {nome}!*\n\nSeu equipamento está *PRONTO* para retirada! ✅\n\n*EQUIPAMENTO:*\n{equipamento}\nSN: {serial}\n\n{linha_valor}\nTraga documento com foto para retirada.\n\nAguardamos você! 😊"
    );
    MensagemWhatsapp {
        template: "equipamento_pronto",
        parametros: vec![nome.to_string(), equipamento, valor_texto.unwrap_or_default()],
        url_botao: None,
        historico: texto.clone(),
        texto,
    }
}

pub(crate) fn mensagem_informativo(
    nome: &str,
    marca: &str,
    modelo: &str,
    serial: &str,
    snapshot: &serde_json::Value,
    valor_total: f64,
    prazo: Option<&str>,
) -> MensagemWhatsapp {
    let equipamento = nome_do_equipamento(marca, modelo);
    let servicos = snapshot.get("servicos").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let mut mao_de_obra = 0.0;
    let mut pecas_total = 0.0;
    let mut linhas_servicos = Vec::new();
    let mut linhas_pecas = Vec::new();
    for servico in &servicos {
        let valor = servico.get("valor").and_then(|v| v.as_f64()).unwrap_or(0.0);
        mao_de_obra += valor;
        let descricao = servico.get("descricao").and_then(|v| v.as_str()).unwrap_or("Serviço");
        linhas_servicos.push(format!("• {descricao}: {}", formatar_brl(valor)));
        for peca in servico.get("pecas").and_then(|v| v.as_array()).into_iter().flatten() {
            let quantidade = peca.get("quantidade").and_then(|v| v.as_i64()).unwrap_or(0);
            let unitario = peca.get("valor_unitario").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let nome_peca = peca.get("nome").and_then(|v| v.as_str()).unwrap_or("Peça");
            pecas_total += quantidade as f64 * unitario;
            linhas_pecas.push(format!("• {nome_peca} (x{quantidade}): {}", formatar_brl(quantidade as f64 * unitario)));
        }
    }
    // Orçamentos antigos sem serviços detalhados trazem só a lista de peças já totalizada.
    if servicos.is_empty() {
        for peca in snapshot.get("pecas").and_then(|v| v.as_array()).into_iter().flatten() {
            let quantidade = peca.get("quantidade").and_then(|v| v.as_i64()).unwrap_or(0);
            let total = peca.get("valorTotal").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let nome_peca = peca.get("nome").and_then(|v| v.as_str()).unwrap_or("Peça");
            linhas_pecas.push(format!("• {nome_peca} (x{quantidade}): {}", formatar_brl(total)));
        }
    }

    let bloco_servicos = if linhas_servicos.is_empty() {
        String::new()
    } else {
        format!("\n*SERVIÇOS:*\n{}", linhas_servicos.join("\n"))
    };
    let bloco_pecas = if linhas_pecas.is_empty() {
        String::new()
    } else {
        format!("\n*PEÇAS:*\n{}", linhas_pecas.join("\n"))
    };
    let bloco_subtotais = if servicos.is_empty() {
        String::new()
    } else {
        format!("Mão de Obra: {}\nPeças: {}\n━━━━━━━━━━━━━━━━━━━━\n", formatar_brl(mao_de_obra), formatar_brl(pecas_total))
    };
    let prazo_texto = prazo.filter(|p| !p.trim().is_empty()).map(formatar_data_br);
    let linha_prazo = prazo_texto
        .as_ref()
        .map(|p| format!("📅 Prazo para aprovação: {p}\n"))
        .unwrap_or_default();

    let texto = format!(
        "🔧 *Olá, {nome}!*\n\nSeu equipamento foi verificado e elaboramos o orçamento:\n\n*EQUIPAMENTO:*\n{equipamento}\nSN: {serial}\n{bloco_servicos}{bloco_pecas}\n\n*ORÇAMENTO:*\n{bloco_subtotais}*TOTAL: {total}*\n\n{linha_prazo}\nPara aprovar, responda *APROVADO*.\nPara dúvidas, estamos à disposição! 😊",
        total = formatar_brl(valor_total),
    );
    MensagemWhatsapp {
        template: "orcamento_informativo",
        parametros: vec![
            nome.to_string(),
            equipamento,
            formatar_brl(valor_total),
            prazo_texto.unwrap_or_default(),
        ],
        url_botao: None,
        historico: texto.clone(),
        texto,
    }
}

pub(crate) fn mensagem_decisao(
    nome: &str,
    marca: &str,
    modelo: &str,
    valor_total: f64,
    token: &str,
    valido_ate: Option<DateTime<Utc>>,
) -> MensagemWhatsapp {
    let equipamento = nome_do_equipamento(marca, modelo);
    let valor = formatar_brl(valor_total);
    let validade = valido_ate
        .map(|limite| format!("\n\nO link vale até {}.", limite.format("%d/%m/%Y")))
        .unwrap_or_default();
    let texto = format!(
        "Olá, {nome}!\n\nO orçamento do equipamento {equipamento} está pronto: {valor}.\nPara aprovar ou recusar, ou tirar uma dúvida, abra o link abaixo. Nada é decidido até você confirmar, e você pode corrigir sua resposta enquanto a equipe não a aplicar.\n\n{url}{validade}\n\nEquipe BMI TAG",
        url = url_decisao(token),
    );
    MensagemWhatsapp {
        template: "orcamento_decisao",
        parametros: vec![nome.to_string(), equipamento.clone(), valor.clone()],
        url_botao: Some(token.to_string()),
        texto,
        historico: format!(
            "Link de decisão do orçamento de {equipamento} ({valor}) enviado. O link foi omitido do histórico interno."
        ),
    }
}

// ─── Apoio ──────────────────────────────────────────────────────────────────

/// Conteúdo que o processador central usa para enviar: parâmetros do modelo e o texto da Evolution.
/// Nunca contém token: no modo central o texto traz `{{TOKEN}}` e o processador o substitui.
fn montar_payload(mensagem: &MensagemWhatsapp, nome: &str, telefone: &str, tipo: TipoEnvio) -> serde_json::Value {
    serde_json::json!({
        "template": mensagem.template,
        "parametros": mensagem.parametros,
        "usaLink": mensagem.url_botao.is_some(),
        "texto": mensagem.texto,
        "historico": mensagem.historico,
        "destinatario": nome,
        "contato": telefone,
        "tipoComunicacao": tipo.tipo_comunicacao(),
    })
}

fn mascarar_telefone(telefone: &str) -> String {
    if telefone.len() <= 8 {
        return "****".to_string();
    }
    format!("{}****{}", &telefone[..4], &telefone[telefone.len() - 4..])
}

/// Limita o texto de erro e remove segredos (token da decisão, hex longo, URL de decisão).
fn sanear_erro(texto: &str, segredos: &[&str]) -> String {
    let mut limpo = texto.to_string();
    for segredo in segredos.iter().filter(|s| !s.is_empty()) {
        limpo = limpo.replace(segredo, "[REDACTED]");
    }
    let limpo = redact_long_hex_values(&limpo);
    limpo.chars().take(ERRO_MAX_CHARS).collect()
}

struct DadosEquipamento {
    status: String,
    marca: String,
    modelo: String,
    serial: String,
    nome_destinatario: String,
    telefone: Option<String>,
    valor_final_ou_orcamento: Option<f64>,
    prazo_aprovacao: Option<String>,
    status_alterado_micros: Option<i64>,
}

async fn carregar_equipamento(
    tx: &mut Transaction<'_, Postgres>,
    empresa_id: i32,
    equipamento_id: i32,
) -> Result<DadosEquipamento, String> {
    let map = super::operator_errors::mapear_erro_sql;
    let row = sqlx::query(
        "SELECT COALESCE(status, '') AS status, COALESCE(marca, '') AS marca, COALESCE(modelo, '') AS modelo,
                COALESCE(serial_number, '') AS serial,
                COALESCE(NULLIF(BTRIM(responsavel_nome), ''), NULLIF(BTRIM(cliente_nome), ''), 'Cliente') AS nome,
                COALESCE(NULLIF(BTRIM(responsavel_telefone), ''), NULLIF(BTRIM(cliente_telefone), '')) AS telefone,
                COALESCE(valor_final, valor_orcamento)::FLOAT8 AS valor,
                prazo_aprovacao,
                (EXTRACT(EPOCH FROM status_alterado_em) * 1000000)::BIGINT AS micros
         FROM equipamentos
         WHERE id = $1 AND empresa_id = $2
         FOR UPDATE",
    )
    .bind(equipamento_id)
    .bind(empresa_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map)?
    .ok_or_else(|| "Equipamento não encontrado na empresa do perfil ativo.".to_string())?;
    Ok(DadosEquipamento {
        status: row.try_get("status").map_err(map)?,
        marca: row.try_get("marca").map_err(map)?,
        modelo: row.try_get("modelo").map_err(map)?,
        serial: row.try_get("serial").map_err(map)?,
        nome_destinatario: row.try_get("nome").map_err(map)?,
        telefone: row.try_get("telefone").map_err(map)?,
        valor_final_ou_orcamento: row.try_get("valor").map_err(map)?,
        prazo_aprovacao: row.try_get("prazo_aprovacao").map_err(map)?,
        status_alterado_micros: row.try_get("micros").map_err(map)?,
    })
}

/// Tudo o que a fase de envio precisa depois que a reserva foi confirmada.
struct EnvioPreparado {
    pedido_id: i64,
    tentativa_id: i64,
    config: WhatsappConfigStored,
    telefone: String,
    nome_destinatario: String,
    mensagem: MensagemWhatsapp,
    segredos: Vec<String>,
}

enum Reserva {
    Resposta(ResultadoEnvioWhatsapp),
    /// A tentativa já nasceu `FALHOU` (sem telefone, sem configuração): só falta o histórico.
    FalhaImediata {
        resposta: ResultadoEnvioWhatsapp,
        nome_destinatario: String,
        telefone_ou_vazio: String,
        erro: String,
    },
    Enviar(Box<EnvioPreparado>),
}

#[allow(clippy::too_many_arguments)]
async fn reservar(
    tx: &mut Transaction<'_, Postgres>,
    empresa_id: i32,
    profile_id: i32,
    tipo: TipoEnvio,
    input: &SolicitarEnvioInput,
) -> Result<Reserva, String> {
    let map = super::operator_errors::mapear_erro_sql;
    let equipamento = carregar_equipamento(tx, empresa_id, input.equipamento_id).await?;

    // Identidade do evento.
    let (chave_evento, versao_id, valido_ate) = if tipo.usa_versao_do_orcamento() {
        if equipamento.status != "AGUARDANDO_APROVACAO" {
            return Err("O orçamento só pode ser enviado enquanto aguarda aprovação.".to_string());
        }
        if tipo == TipoEnvio::OrcamentoDecisao {
            exigir_aceite_online(tx).await?;
        }
        let versao = obter_ou_criar_versao(tx, empresa_id, input.equipamento_id, profile_id).await?;
        (format!("v:{}", versao.id), Some(versao.id), versao.valido_ate)
    } else {
        if equipamento.status != "PRONTO" {
            return Err("O aviso de equipamento pronto só pode ser enviado quando ele está PRONTO.".to_string());
        }
        let micros = equipamento.status_alterado_micros.ok_or_else(|| {
            "Não há data confiável da mudança para PRONTO neste atendimento. Use o contato manual.".to_string()
        })?;
        (format!("s:{micros}"), None, None)
    };

    let pedido_id: i64 = match sqlx::query_scalar(
        "INSERT INTO envios_whatsapp_pedidos
            (empresa_id, equipamento_id, tipo, chave_evento, versao_id, criado_por_profile_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (empresa_id, equipamento_id, tipo, chave_evento) DO NOTHING
         RETURNING id",
    )
    .bind(empresa_id)
    .bind(input.equipamento_id)
    .bind(tipo.como_texto())
    .bind(&chave_evento)
    .bind(versao_id)
    .bind(profile_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map)?
    {
        Some(id) => id,
        None => sqlx::query_scalar(
            "SELECT id FROM envios_whatsapp_pedidos
             WHERE empresa_id = $1 AND equipamento_id = $2 AND tipo = $3 AND chave_evento = $4",
        )
        .bind(empresa_id)
        .bind(input.equipamento_id)
        .bind(tipo.como_texto())
        .bind(&chave_evento)
        .fetch_one(&mut **tx)
        .await
        .map_err(map)?,
    };

    // Serializa instâncias concorrentes sobre o mesmo pedido.
    sqlx::query("SELECT id FROM envios_whatsapp_pedidos WHERE id = $1 FOR UPDATE")
        .bind(pedido_id)
        .execute(&mut **tx)
        .await
        .map_err(map)?;

    let ultima: Option<(i64, i32, String, bool)> = sqlx::query_as(
        "SELECT id, numero, estado,
                (COALESCE(reservado_em, criado_em) < NOW() - make_interval(mins => $2)) AS abandonada
         FROM envios_whatsapp_tentativas
         WHERE pedido_id = $1
         ORDER BY numero DESC
         LIMIT 1",
    )
    .bind(pedido_id)
    .bind(TENTATIVA_ABANDONADA_MINUTOS)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map)?;

    let mut numero = 1;
    let mut origem = if input.reenvio_manual { "REENVIO_MANUAL" } else { "AUTOMATICO" };
    if let Some((ultima_id, ultimo_numero, mut ultimo_estado, abandonada)) = ultima {
        if ultimo_estado == "PENDENTE" {
            return Ok(Reserva::Resposta(ResultadoEnvioWhatsapp {
                pedido_id: Some(pedido_id),
                tentativa_id: Some(ultima_id),
                estado: "EM_ANDAMENTO".to_string(),
                ultimo_estado: Some(ultimo_estado),
                mensagem: Some("Esta mensagem já está na fila de envio.".to_string()),
            }));
        }
        if ultimo_estado == "PREPARANDO" {
            if !abandonada {
                return Ok(Reserva::Resposta(ResultadoEnvioWhatsapp {
                    pedido_id: Some(pedido_id),
                    tentativa_id: Some(ultima_id),
                    estado: "EM_ANDAMENTO".to_string(),
                    ultimo_estado: Some(ultimo_estado),
                    mensagem: Some("Já existe um envio em andamento para este evento.".to_string()),
                }));
            }
            // A instância que reservou parou antes de registrar o resultado: pode ter enviado.
            sqlx::query(
                "UPDATE envios_whatsapp_tentativas
                 SET estado = 'INCERTA', finalizado_em = NOW(),
                     erro_resumo = 'O AutoOS foi interrompido durante o envio. A mensagem pode ter sido enviada.'
                 WHERE id = $1 AND estado = 'PREPARANDO'",
            )
            .bind(ultima_id)
            .execute(&mut **tx)
            .await
            .map_err(map)?;
            ultimo_estado = "INCERTA".to_string();
        }
        if !input.reenvio_manual {
            return Ok(Reserva::Resposta(ResultadoEnvioWhatsapp {
                pedido_id: Some(pedido_id),
                tentativa_id: Some(ultima_id),
                estado: "JA_SOLICITADO".to_string(),
                ultimo_estado: Some(ultimo_estado),
                mensagem: Some("Este evento já foi solicitado e não será enviado de novo automaticamente.".to_string()),
            }));
        }
        if ultimo_estado == "INCERTA" && !input.confirmar_incerto {
            return Ok(Reserva::Resposta(ResultadoEnvioWhatsapp {
                pedido_id: Some(pedido_id),
                tentativa_id: Some(ultima_id),
                estado: "REQUER_CONFIRMACAO".to_string(),
                ultimo_estado: Some(ultimo_estado),
                mensagem: Some("O resultado do envio anterior é incerto: a mensagem pode já ter chegado ao cliente. Confirme para enviar de novo.".to_string()),
            }));
        }
        numero = ultimo_numero + 1;
        origem = "REENVIO_MANUAL";
    }

    let nome = equipamento.nome_destinatario.clone();

    // Destino e configuração antes de gerar qualquer link.
    let telefone = match equipamento.telefone.as_deref().map(normalizar_telefone_br) {
        Some(Ok(telefone)) => telefone,
        Some(Err(_)) | None => {
            return registrar_falha_imediata(
                tx, empresa_id, profile_id, pedido_id, numero, origem, nome, String::new(),
                "Cliente sem telefone válido cadastrado para este atendimento.",
            )
            .await;
        }
    };
    // Modo da empresa: sem linha de configuração o envio segue local (computador que clicou).
    let central = sqlx::query_scalar::<_, String>(
        "SELECT modo FROM envio_whatsapp_config_empresa WHERE empresa_id = $1",
    )
    .bind(empresa_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map)?
    .is_some_and(|modo| modo == "CENTRAL");

    // No modo central a configuração e o token ficam no processador, não neste computador.
    let config = if central {
        None
    } else {
        Some(match carregar_config_armazenada()? {
            Some(config) if config.provider.trim().eq_ignore_ascii_case(PROVEDOR_EVOLUTION) => config,
            Some(_) => {
                return registrar_falha_imediata(
                    tx, empresa_id, profile_id, pedido_id, numero, origem, nome, telefone,
                    "Provider de WhatsApp não suportado.",
                )
                .await;
            }
            None => {
                return registrar_falha_imediata(
                    tx, empresa_id, profile_id, pedido_id, numero, origem, nome, telefone,
                    "Configure o WhatsApp primeiro",
                )
                .await;
            }
        })
    };

    // Texto a partir dos dados atuais e, no orçamento, da versão congelada.
    let mut segredos = Vec::new();
    let mut link_id = None;
    let mensagem = match tipo {
        TipoEnvio::EquipamentoPronto => mensagem_pronto(
            &nome,
            &equipamento.marca,
            &equipamento.modelo,
            &equipamento.serial,
            equipamento.valor_final_ou_orcamento,
        ),
        TipoEnvio::OrcamentoInformativo => {
            let (snapshot_texto, valor): (String, f64) = sqlx::query_as(
                "SELECT snapshot::TEXT, valor_total::FLOAT8 FROM orcamento_versoes WHERE id = $1",
            )
            .bind(versao_id)
            .fetch_one(&mut **tx)
            .await
            .map_err(map)?;
            let snapshot: serde_json::Value =
                serde_json::from_str(&snapshot_texto).map_err(|_| "Versão do orçamento inválida.".to_string())?;
            mensagem_informativo(
                &nome,
                &equipamento.marca,
                &equipamento.modelo,
                &equipamento.serial,
                &snapshot,
                valor,
                equipamento.prazo_aprovacao.as_deref(),
            )
        }
        TipoEnvio::OrcamentoDecisao if central => {
            let valor: f64 = sqlx::query_scalar("SELECT valor_total::FLOAT8 FROM orcamento_versoes WHERE id = $1")
                .bind(versao_id)
                .fetch_one(&mut **tx)
                .await
                .map_err(map)?;
            let limite = Utc::now() + chrono::Duration::days(30);
            mensagem_decisao(
                &nome,
                &equipamento.marca,
                &equipamento.modelo,
                valor,
                TOKEN_PLACEHOLDER,
                valido_ate.map_or(Some(limite), |v| Some(v.min(limite))),
            )
        }
        TipoEnvio::OrcamentoDecisao => {
            let emitido =
                emitir_link_decisao(tx, empresa_id, input.equipamento_id, profile_id, false).await?;
            let valor: f64 = sqlx::query_scalar("SELECT valor_total::FLOAT8 FROM orcamento_versoes WHERE id = $1")
                .bind(emitido.versao.id)
                .fetch_one(&mut **tx)
                .await
                .map_err(map)?;
            link_id = Some(emitido.link_id);
            segredos.push(emitido.token.clone());
            segredos.push(url_decisao(&emitido.token));
            mensagem_decisao(
                &nome,
                &equipamento.marca,
                &equipamento.modelo,
                valor,
                &emitido.token,
                valido_ate.map_or(Some(emitido.expires_at), |limite| Some(limite.min(emitido.expires_at))),
            )
        }
    };

    // O conteúdo só é gravado na fila central, e lá o link de decisão é sempre um marcador.
    // No envio local o texto pode conter o token real e nunca vai para o banco.
    let payload = central.then(|| montar_payload(&mensagem, &nome, &telefone, tipo).to_string());
    let tentativa_id: i64 = match sqlx::query_scalar(
        "INSERT INTO envios_whatsapp_tentativas
            (pedido_id, empresa_id, numero, origem, estado, provedor, destino_final,
             link_decisao_id, criado_por_profile_id, reservado_em, mensagem_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 CASE WHEN $5 = 'PREPARANDO' THEN NOW() END, $10::TEXT::JSONB)
         RETURNING id",
    )
    .bind(pedido_id)
    .bind(empresa_id)
    .bind(numero)
    .bind(origem)
    .bind(if central { "PENDENTE" } else { "PREPARANDO" })
    .bind(if central { PROVEDOR_CENTRAL } else { PROVEDOR_EVOLUTION })
    .bind(mascarar_telefone(&telefone))
    .bind(link_id)
    .bind(profile_id)
    .bind(payload)
    .fetch_one(&mut **tx)
    .await
    {
        Ok(id) => id,
        Err(sqlx::Error::Database(erro)) if erro.is_unique_violation() => {
            return Ok(Reserva::Resposta(ResultadoEnvioWhatsapp {
                pedido_id: Some(pedido_id),
                tentativa_id: None,
                estado: "EM_ANDAMENTO".to_string(),
                ultimo_estado: Some("PREPARANDO".to_string()),
                mensagem: Some("Já existe um envio em andamento para este evento.".to_string()),
            }));
        }
        Err(erro) => return Err(map(erro)),
    };

    let Some(config) = config else {
        // Modo central: a tentativa fica na fila e o processador faz o resto.
        return Ok(Reserva::Resposta(ResultadoEnvioWhatsapp {
            pedido_id: Some(pedido_id),
            tentativa_id: Some(tentativa_id),
            estado: "ENFILEIRADA".to_string(),
            ultimo_estado: None,
            mensagem: Some("Mensagem na fila; será enviada em instantes.".to_string()),
        }));
    };

    Ok(Reserva::Enviar(Box::new(EnvioPreparado {
        pedido_id,
        tentativa_id,
        config,
        telefone,
        nome_destinatario: nome,
        mensagem,
        segredos,
    })))
}

#[allow(clippy::too_many_arguments)]
async fn registrar_falha_imediata(
    tx: &mut Transaction<'_, Postgres>,
    empresa_id: i32,
    profile_id: i32,
    pedido_id: i64,
    numero: i32,
    origem: &str,
    nome_destinatario: String,
    telefone: String,
    erro: &str,
) -> Result<Reserva, String> {
    let tentativa_id: i64 = sqlx::query_scalar(
        "INSERT INTO envios_whatsapp_tentativas
            (pedido_id, empresa_id, numero, origem, estado, provedor, destino_final,
             erro_resumo, finalizado_em, criado_por_profile_id)
         VALUES ($1, $2, $3, $4, 'FALHOU', $5, $6, $7, NOW(), $8)
         RETURNING id",
    )
    .bind(pedido_id)
    .bind(empresa_id)
    .bind(numero)
    .bind(origem)
    .bind(PROVEDOR_EVOLUTION)
    .bind(if telefone.is_empty() { None } else { Some(mascarar_telefone(&telefone)) })
    .bind(erro)
    .bind(profile_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    Ok(Reserva::FalhaImediata {
        resposta: ResultadoEnvioWhatsapp {
            pedido_id: Some(pedido_id),
            tentativa_id: Some(tentativa_id),
            estado: "FALHOU".to_string(),
            ultimo_estado: None,
            mensagem: Some(erro.to_string()),
        },
        nome_destinatario,
        telefone_ou_vazio: telefone,
        erro: erro.to_string(),
    })
}

#[allow(clippy::too_many_arguments)]
async fn registrar_historico(
    pool: &sqlx::PgPool,
    empresa_id: i32,
    equipamento_id: i32,
    tipo: TipoEnvio,
    destinatario: &str,
    contato: &str,
    mensagem: &str,
    enviado: bool,
    erro: Option<&str>,
) {
    // O histórico visível é complementar: falhar aqui não pode esconder o resultado do envio,
    // que já está nas tabelas da fila.
    let resultado = sqlx::query(
        "INSERT INTO comunicacoes
            (empresa_id, equipamento_id, tipo, canal, destinatario, contato, mensagem,
             enviado, data_envio, erro)
         VALUES ($1, $2, $3, 'WHATSAPP', $4, $5, $6, $7, CASE WHEN $7 THEN NOW() END, $8)",
    )
    .bind(empresa_id)
    .bind(equipamento_id)
    .bind(tipo.tipo_comunicacao())
    .bind(if destinatario.trim().is_empty() { "Cliente" } else { destinatario })
    .bind(if contato.is_empty() { "-" } else { contato })
    .bind(mensagem)
    .bind(enviado)
    .bind(erro)
    .execute(pool)
    .await;
    if let Err(erro) = resultado {
        tracing::warn!("Falha ao gravar o histórico do envio de WhatsApp: {}", erro);
    }
}

/// Único ponto de entrada para enviar WhatsApp ao cliente.
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = input.equipamento_id, tipo = %input.tipo, manual = input.reenvio_manual))]
pub async fn solicitar_envio_whatsapp(input: SolicitarEnvioInput) -> Result<ResultadoEnvioWhatsapp, String> {
    let tipo = TipoEnvio::parse(&input.tipo)?;
    let actor = require_permission(PERMISSION_CONFIG_WHATSAPP)?;
    if tipo == TipoEnvio::OrcamentoDecisao {
        require_permission(PERMISSION_MANAGE_STATUS_LINKS)?;
    }
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;

    let mut tx = pool.begin().await.map_err(super::operator_errors::mapear_erro_sql)?;
    let reserva = reservar(&mut tx, empresa_id, actor.id, tipo, &input).await;
    let reserva = match reserva {
        Ok(reserva) => {
            tx.commit().await.map_err(super::operator_errors::mapear_erro_sql)?;
            reserva
        }
        Err(erro) => {
            // Erros de validação não deixam pedido, versão nem link pela metade.
            let _ = tx.rollback().await;
            return Err(erro);
        }
    };

    let preparado = match reserva {
        Reserva::Resposta(resposta) => return Ok(resposta),
        Reserva::FalhaImediata { resposta, nome_destinatario, telefone_ou_vazio, erro } => {
            registrar_historico(
                &pool, empresa_id, input.equipamento_id, tipo, &nome_destinatario,
                &telefone_ou_vazio, "Envio de WhatsApp não realizado.", false, Some(&erro),
            )
            .await;
            auditar(&actor, tipo, &resposta, input.equipamento_id).await;
            return Ok(resposta);
        }
        Reserva::Enviar(preparado) => *preparado,
    };

    // A chamada ao provedor acontece fora de qualquer transação.
    let segredos: Vec<&str> = preparado.segredos.iter().map(String::as_str).collect();
    let resultado = despachar_evolution(&preparado.config, &preparado.telefone, &preparado.mensagem.texto).await;
    let (estado, mensagem_externa, erro) = match resultado {
        Ok(id_externo) => ("ENVIADA", id_externo, None),
        Err(ErroProvedor::Falhou(texto)) => ("FALHOU", None, Some(sanear_erro(&texto, &segredos))),
        Err(ErroProvedor::Incerto(texto)) => ("INCERTA", None, Some(sanear_erro(&texto, &segredos))),
    };

    sqlx::query(
        "UPDATE envios_whatsapp_tentativas
         SET estado = $2, finalizado_em = NOW(), mensagem_externa_id = $3, erro_resumo = $4
         WHERE id = $1 AND estado = 'PREPARANDO'",
    )
    .bind(preparado.tentativa_id)
    .bind(estado)
    .bind(&mensagem_externa)
    .bind(&erro)
    .execute(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    registrar_historico(
        &pool,
        empresa_id,
        input.equipamento_id,
        tipo,
        &preparado.nome_destinatario,
        &preparado.telefone,
        &preparado.mensagem.historico,
        estado == "ENVIADA",
        erro.as_deref(),
    )
    .await;

    let resposta = ResultadoEnvioWhatsapp {
        pedido_id: Some(preparado.pedido_id),
        tentativa_id: Some(preparado.tentativa_id),
        estado: estado.to_string(),
        ultimo_estado: None,
        mensagem: erro,
    };
    auditar(&actor, tipo, &resposta, input.equipamento_id).await;
    info!("Envio de WhatsApp {} concluído: {}", tipo.como_texto(), estado);
    Ok(resposta)
}

async fn auditar(
    actor: &crate::commands::auth::SecurityProfileSummary,
    tipo: TipoEnvio,
    resposta: &ResultadoEnvioWhatsapp,
    equipamento_id: i32,
) {
    record_security_event(
        if resposta.estado == "ENVIADA" { "WHATSAPP_SENT" } else { "WHATSAPP_SEND_FAILED" },
        Some(actor),
        format!(
            "equipamento_id={}; tipo={}; pedido_id={}; tentativa_id={}; estado={}",
            equipamento_id,
            tipo.como_texto(),
            resposta.pedido_id.unwrap_or(0),
            resposta.tentativa_id.unwrap_or(0),
            resposta.estado,
        ),
        resposta.estado == "ENVIADA",
    )
    .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn money_uses_brazilian_format() {
        assert_eq!(formatar_brl(250.0), "R$ 250,00");
        assert_eq!(formatar_brl(1234.5), "R$ 1.234,50");
        assert_eq!(formatar_brl(1234567.891), "R$ 1.234.567,89");
        assert_eq!(formatar_brl(0.0), "R$ 0,00");
    }

    #[test]
    fn dates_are_formatted_only_when_iso() {
        assert_eq!(formatar_data_br("2026-10-30"), "30/10/2026");
        assert_eq!(formatar_data_br("2026-10-30T10:00:00Z"), "30/10/2026");
        assert_eq!(formatar_data_br("amanhã"), "amanhã");
    }

    #[test]
    fn event_types_round_trip_and_reject_unknown() {
        for tipo in ["orcamento_informativo", "orcamento_decisao", "equipamento_pronto"] {
            assert_eq!(TipoEnvio::parse(tipo).unwrap().como_texto(), tipo);
        }
        assert!(TipoEnvio::parse("codigo_verificacao").is_err());
        assert!(TipoEnvio::parse("").is_err());
    }

    #[test]
    fn decision_message_carries_the_link_but_history_does_not() {
        let token = "ab".repeat(32);
        let mensagem = mensagem_decisao("Maria", "Zebra", "ZT230", 250.0, &token, None);
        assert!(mensagem.texto.contains(&format!("/#/o/{token}")));
        assert!(mensagem.texto.contains("R$ 250,00"));
        assert!(!mensagem.historico.contains(&token));
        assert!(!mensagem.historico.contains("/#/o/"));
        assert_eq!(mensagem.url_botao.as_deref(), Some(token.as_str()));
        assert_eq!(mensagem.template, "orcamento_decisao");
    }

    #[test]
    fn informative_message_is_built_from_the_frozen_snapshot() {
        let snapshot = serde_json::json!({
            "servicos": [{
                "descricao": "Troca da cabeça", "valor": 20.0,
                "pecas": [{ "nome": "Cabeça", "quantidade": 2, "valor_unitario": 10.0 }]
            }],
            "pecas": []
        });
        let mensagem = mensagem_informativo("Maria", "Zebra", "ZT230", "SN1", &snapshot, 40.0, Some("2026-10-30"));
        assert!(mensagem.texto.contains("• Troca da cabeça: R$ 20,00"));
        assert!(mensagem.texto.contains("• Cabeça (x2): R$ 20,00"));
        assert!(mensagem.texto.contains("*TOTAL: R$ 40,00*"));
        assert!(mensagem.texto.contains("Prazo para aprovação: 30/10/2026"));
        assert_eq!(mensagem.parametros[3], "30/10/2026");
    }

    #[test]
    fn ready_message_omits_the_value_when_unknown() {
        let sem_valor = mensagem_pronto("Maria", "Zebra", "ZT230", "SN1", None);
        assert!(!sem_valor.texto.contains("Valor a pagar"));
        let com_valor = mensagem_pronto("Maria", "Zebra", "ZT230", "SN1", Some(99.9));
        assert!(com_valor.texto.contains("Valor a pagar: R$ 99,90"));
    }

    #[test]
    fn phone_is_masked_and_errors_are_scrubbed() {
        assert_eq!(mascarar_telefone("5571999998888"), "5571****8888");
        assert_eq!(mascarar_telefone("1234"), "****");

        let token = "cd".repeat(32);
        let url = format!("https://status.bmitag.com.br/#/o/{token}");
        let erro = sanear_erro(&format!("falhou ao entregar {url} e {token}"), &[&token, &url]);
        assert!(!erro.contains(&token));
        assert!(erro.contains("[REDACTED]"));
        assert!(sanear_erro(&"x".repeat(1000), &[]).chars().count() <= ERRO_MAX_CHARS);
    }
}
