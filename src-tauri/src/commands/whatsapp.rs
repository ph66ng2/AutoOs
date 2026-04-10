use crate::commands::auth::{
    require_permission, PERMISSION_CONFIG_WHATSAPP, PERMISSION_FINANCIAL_ACTIONS,
};
use crate::commands::types::{
    WhatsappConfigInput, WhatsappConfigResponse, WhatsappConfigStored, WhatsappSendInput,
};
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
    require_permission(PERMISSION_CONFIG_WHATSAPP)?;
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

#[tauri::command]
#[instrument(skip_all)]
pub async fn enviar_whatsapp(input: WhatsappSendInput) -> Result<bool, String> {
    require_permission(PERMISSION_FINANCIAL_ACTIONS)?;
    debug!("Enviando WhatsApp via provider HTTP");

    let config = load_stored_whatsapp_config()?
        .ok_or_else(|| "Configure o WhatsApp primeiro".to_string())?;

    let provider = normalize_provider(&config.provider)?;
    if provider != DEFAULT_PROVIDER {
        return Err("Provider de WhatsApp não suportado".to_string());
    }

    let contato = sanitize_phone(&input.contato)?;
    let mensagem = input.mensagem.trim();
    if mensagem.is_empty() {
        return Err("Mensagem do WhatsApp é obrigatória".to_string());
    }

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
        .map_err(|e| {
            error!("Erro ao criar cliente HTTP do WhatsApp: {}", e);
            e.to_string()
        })?;

    let response = client
        .post(&config.api_url)
        .header("apikey", &config.token)
        .bearer_auth(&config.token)
        .json(&payload)
        .send()
        .await
        .map_err(|e| {
            error!("Erro ao enviar WhatsApp: {}", e);
            format!("Erro ao enviar WhatsApp: {}", e)
        })?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        error!("Provider WhatsApp retornou {}: {}", status, body);
        return Err(if body.trim().is_empty() {
            format!("Provider WhatsApp retornou status {}", status)
        } else {
            format!("Provider WhatsApp retornou status {}: {}", status, body)
        });
    }

    info!("WhatsApp enviado com sucesso para {}", contato);
    Ok(true)
}