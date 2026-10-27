use crate::commands::auth::{
    record_security_event, require_permission, require_sensitive_access, SecurityProfileSummary,
    PERMISSION_CONFIG_WHATSAPP,
};
use crate::commands::types::{
    WhatsappConfigInput, WhatsappConfigResponse, WhatsappConfigStored, WhatsappSendInput,
};
#[cfg(feature = "saas")]
use crate::commands::types::SaasCommunicationConfigInput;
use keyring::Entry;
use reqwest::{Client, Url};
use serde_json::json;
use tracing::{debug, error, info, instrument};

const KEYRING_SERVICE: &str = "autoos";
const KEYRING_USER: &str = "whatsapp_config";
const DEFAULT_PROVIDER: &str = "EVOLUTION";

fn get_keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| {
        error!("Erro ao criar entrada keyring do WhatsApp: {}", e);
        e.to_string()
    })
}

fn normalize_provider(provider: &str) -> Result<String, String> {
    let normalized = provider.trim().to_uppercase();
    if normalized.is_empty() {
        return Ok(DEFAULT_PROVIDER.to_string());
    }

    match normalized.as_str() {
        DEFAULT_PROVIDER => Ok(normalized),
        _ => Err("Provider de WhatsApp não suportado. Use EVOLUTION.".to_string()),
    }
}

fn validate_api_url(api_url: &str) -> Result<String, String> {
    let trimmed = api_url.trim();
    if trimmed.is_empty() {
        return Err("API URL do WhatsApp é obrigatória".to_string());
    }

    let parsed = Url::parse(trimmed).map_err(|_| "API URL do WhatsApp inválida".to_string())?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed.to_string()),
        _ => Err("API URL do WhatsApp deve usar http ou https".to_string()),
    }
}

fn load_stored_whatsapp_config() -> Result<Option<WhatsappConfigStored>, String> {
    let entry = get_keyring_entry()?;
    let json = match entry.get_password() {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };

    let stored = serde_json::from_str(&json).map_err(|e| {
        error!("Erro ao deserializar config WhatsApp: {}", e);
        e.to_string()
    })?;

    Ok(Some(stored))
}

fn validate_whatsapp_config(config: &WhatsappConfigInput) -> Result<(String, String), String> {
    let provider = normalize_provider(&config.provider)?;
    let api_url = validate_api_url(&config.api_url)?;

    Ok((provider, api_url))
}

fn sanitize_phone(raw: &str) -> Result<String, String> {
    let digits: String = raw.chars().filter(|character| character.is_ascii_digit()).collect();
    if digits.len() < 12 {
        return Err("Telefone do WhatsApp inválido".to_string());
    }

    Ok(digits)
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn salvar_config_whatsapp(config: WhatsappConfigInput) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_CONFIG_WHATSAPP)?;
    let (provider, api_url) = validate_whatsapp_config(&config)?;
    debug!("Salvando configuração de WhatsApp");

    let existing_token = load_stored_whatsapp_config()?
        .map(|stored| stored.token)
        .unwrap_or_default();

    let token = config
        .token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or(existing_token);

    if token.is_empty() {
        return Err("Token da API do WhatsApp é obrigatório".to_string());
    }

    let stored = WhatsappConfigStored {
        provider,
        api_url,
        token,
    };

    let json = serde_json::to_string(&stored).map_err(|e| {
        error!("Erro ao serializar config WhatsApp: {}", e);
        e.to_string()
    })?;

    let entry = get_keyring_entry()?;
    entry.set_password(&json).map_err(|e| {
        error!("Erro ao salvar config WhatsApp no keyring: {}", e);
        e.to_string()
    })?;

    record_security_event(
        "WHATSAPP_CONFIG_SAVED",
        Some(&actor),
        format!("provider={}; api_url={}", stored.provider, stored.api_url),
        true,
    )
    .await;

    info!("Configuração de WhatsApp salva com sucesso");
    Ok(true)
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn carregar_config_whatsapp() -> Result<WhatsappConfigResponse, String> {
    require_permission(PERMISSION_CONFIG_WHATSAPP)?;
    debug!("Carregando configuração de WhatsApp");

    let stored = load_stored_whatsapp_config()?
        .ok_or_else(|| "Configuração de WhatsApp não encontrada".to_string())?;

    Ok(WhatsappConfigResponse {
        provider: stored.provider,
        api_url: stored.api_url,
        has_token: !stored.token.is_empty(),
    })
}

/// Resultado de uma chamada ao provedor que não foi aceita.
///
/// `Falhou` significa que nada chegou ao provedor ou que ele recusou o pedido; repetir é seguro.
/// `Incerto` significa que o pedido pode ter sido processado (tempo esgotado, erro 5xx):
/// repetir sem conferir pode duplicar a mensagem.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ErroProvedor {
    Falhou(String),
    Incerto(String),
}

impl ErroProvedor {
    pub(crate) fn mensagem(&self) -> &str {
        match self {
            Self::Falhou(texto) | Self::Incerto(texto) => texto,
        }
    }
}

pub(crate) fn carregar_config_armazenada() -> Result<Option<WhatsappConfigStored>, String> {
    load_stored_whatsapp_config()
}

/// Normaliza telefone brasileiro: só dígitos, com DDI 55 e no mínimo 12 dígitos.
/// Decide pelo tamanho, não pelo prefixo: DDD + número (10 ou 11 dígitos) ganha o DDI, mesmo
/// quando o DDD é 55 (RS).
pub(crate) fn normalizar_telefone_br(raw: &str) -> Result<String, String> {
    let digits: String = raw.chars().filter(|character| character.is_ascii_digit()).collect();
    let ja_tem_ddi = digits.starts_with("55") && digits.len() >= 12;
    let com_ddi = if ja_tem_ddi { digits } else { format!("55{digits}") };
    sanitize_phone(&com_ddi)
}

fn resumir_corpo(corpo: &str) -> String {
    let corpo = redact_long_hex_values(corpo);
    let corpo = corpo.split_whitespace().collect::<Vec<_>>().join(" ");
    corpo.chars().take(160).collect()
}

/// Id da mensagem devolvido pela Evolution, quando existir (`key.id` ou `id`).
fn extrair_id_mensagem(corpo: &str) -> Option<String> {
    let valor: serde_json::Value = serde_json::from_str(corpo).ok()?;
    let id = valor
        .pointer("/key/id")
        .or_else(|| valor.get("id"))
        .and_then(|candidato| candidato.as_str())?;
    Some(id.chars().take(120).collect())
}

/// Uma chamada à Evolution API. Não grava histórico: quem chama decide o que registrar.
pub(crate) async fn despachar_evolution(
    config: &WhatsappConfigStored,
    contato: &str,
    mensagem: &str,
) -> Result<Option<String>, ErroProvedor> {
    let payload = json!({
        "number": contato,
        "text": mensagem,
        "textMessage": {
            "text": mensagem,
        },
        "options": {
            "delay": 1200,
            "presence": "composing",
            "linkPreview": false,
        }
    });

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| ErroProvedor::Falhou(format!("Erro ao preparar o envio de WhatsApp: {}", e.without_url())))?;

    let response = client
        .post(&config.api_url)
        .header("apikey", &config.token)
        .bearer_auth(&config.token)
        .json(&payload)
        .send()
        .await
        .map_err(|e| {
            let e = e.without_url();
            if e.is_connect() || e.is_builder() {
                ErroProvedor::Falhou(format!("Não foi possível conectar ao provedor de WhatsApp: {e}"))
            } else {
                ErroProvedor::Incerto(format!("O provedor de WhatsApp não respondeu a tempo ({e}). A mensagem pode ter sido enviada."))
            }
        })?;

    let status = response.status();
    let corpo = response.text().await.unwrap_or_default();
    if status.is_success() {
        return Ok(extrair_id_mensagem(&corpo));
    }
    let resumo = resumir_corpo(&corpo);
    let texto = if resumo.is_empty() {
        format!("Provider WhatsApp retornou status {status}")
    } else {
        format!("Provider WhatsApp retornou status {status}: {resumo}")
    };
    if status.is_server_error() {
        Err(ErroProvedor::Incerto(texto))
    } else {
        Err(ErroProvedor::Falhou(texto))
    }
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn enviar_whatsapp(input: WhatsappSendInput) -> Result<bool, String> {
    let actor = require_sensitive_access()?;
    enviar_whatsapp_interno(input, Some(actor), true).await
}

/// Usa o provider EVOLUTION já existente no keyring no build SaaS, após
/// validar perfil e permissão atuais no Supabase.
#[cfg(feature = "saas")]
#[tauri::command]
#[instrument(skip_all)]
pub async fn enviar_whatsapp_saas(
    input: WhatsappSendInput,
    config: SaasCommunicationConfigInput,
) -> Result<bool, String> {
    crate::commands::saas_communication::authorize_communication(
        &config.supabase_url,
        &config.publishable_key,
        None,
    )
    .await?;
    enviar_whatsapp_interno(input, None, false).await
}

async fn enviar_whatsapp_interno(
    input: WhatsappSendInput,
    actor: Option<SecurityProfileSummary>,
    record_local_audit: bool,
) -> Result<bool, String> {
    debug!("Enviando WhatsApp via provider HTTP");

    let audit_details = format!("contato={}", input.contato.trim());

    let config = match load_stored_whatsapp_config()? {
        Some(config) => config,
        None => {
            if record_local_audit {
                if let Some(actor) = actor.as_ref() {
                    let details = format!("{}; motivo=configuracao_ausente", audit_details);
                    record_security_event("WHATSAPP_SEND_FAILED", Some(actor), details, false).await;
                }
            }
            return Err("Configure o WhatsApp primeiro".to_string());
        }
    };

    let provider = normalize_provider(&config.provider)?;
    if provider != DEFAULT_PROVIDER {
        return Err("Provider de WhatsApp não suportado".to_string());
    }

    let contato = sanitize_phone(&input.contato)?;
    let mensagem = input.mensagem.trim();
    if mensagem.is_empty() {
        return Err("Mensagem do WhatsApp é obrigatória".to_string());
    }

    let config = WhatsappConfigStored { provider, ..config };
    if let Err(erro) = despachar_evolution(&config, &contato, mensagem).await {
        let detalhe = erro.mensagem().to_string();
        error!("Erro ao enviar WhatsApp: {}", detalhe);
        if record_local_audit {
            if let Some(actor) = actor.as_ref() {
                record_security_event(
                    "WHATSAPP_SEND_FAILED",
                    Some(actor),
                    format!("{}; {}", audit_details, detalhe),
                    false,
                )
                .await;
            }
        }
        return Err(detalhe);
    }

    if record_local_audit {
        if let Some(actor) = actor.as_ref() {
            record_security_event("WHATSAPP_SENT", Some(actor), audit_details, true).await;
        }
    }

    info!("WhatsApp enviado com sucesso para {}", contato);
    Ok(true)
}

pub(crate) fn redact_long_hex_values(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = String::with_capacity(value.len());
    let mut index = 0;
    let mut copied_until = 0;

    while index < bytes.len() {
        if !bytes[index].is_ascii_hexdigit() {
            index += 1;
            continue;
        }

        let start = index;
        while index < bytes.len() && bytes[index].is_ascii_hexdigit() {
            index += 1;
        }

        if index - start >= 64 {
            output.push_str(&value[copied_until..start]);
            output.push_str("[REDACTED]");
            copied_until = index;
        }
    }

    output.push_str(&value[copied_until..]);
    output
}

#[cfg(test)]
mod tests {
    use super::normalizar_telefone_br;

    #[test]
    fn telefone_com_ddd_55_ganha_o_ddi() {
        assert_eq!(normalizar_telefone_br("(55) 99999-8888").unwrap(), "5555999998888");
        assert_eq!(normalizar_telefone_br("55 3222-1111").unwrap(), "555532221111");
        assert_eq!(normalizar_telefone_br("(71) 98888-7777").unwrap(), "5571988887777");
        assert_eq!(normalizar_telefone_br("+55 71 98888-7777").unwrap(), "5571988887777");
        assert_eq!(normalizar_telefone_br("+55 55 99999-8888").unwrap(), "5555999998888");
        assert!(normalizar_telefone_br("9999-8888").is_err());
    }
}
