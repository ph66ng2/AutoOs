//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/smtp.rs — Configuração e Envio de Email SMTP       ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  - salvar_config_smtp: Salva configuração no keyring         ║
//! ║  - carregar_config_smtp: Carrega configuração (sem senha)    ║
//! ║  - enviar_email: Envia email real via SMTP                   ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::types::{
    EmailAttachmentInput, EmailSendInput, SmtpConfigInput, SmtpConfigResponse, SmtpConfigStored,
};
use crate::commands::auth::{
    record_security_event, require_permission, PERMISSION_CONFIG_SMTP,
};
use keyring::Entry;
use lettre::{
    Address,
    message::{header::ContentType, Attachment, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use std::env;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tracing::{debug, error, info, instrument, warn};

/// Timeout para conexão e envio SMTP. Sem timeout o cliente pode ficar
/// pendurado indefinidamente em caso de host/porta incorretos ou servidor
/// que não responde (ex.: STARTTLS contra porta de SMTPS implícito).
const SMTP_TIMEOUT: Duration = Duration::from_secs(30);

/// Porta padrão de SMTPS implícito (TLS desde o handshake).
/// Diferente de 587 (STARTTLS), que conecta em texto plano e faz upgrade.
const SMTPS_IMPLICIT_PORT: u16 = 465;

const KEYRING_SERVICE: &str = "autoos";
const KEYRING_USER: &str = "smtp_config";
const AUTOOS_TEMP_DIR: &str = "autoos";

fn get_keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| {
        error!("Erro ao criar entrada keyring: {}", e);
        e.to_string()
    })
}

fn load_stored_smtp_config() -> Result<Option<SmtpConfigStored>, String> {
    let entry = get_keyring_entry()?;
    let json = match entry.get_password() {
        Ok(password) => password,
        Err(_) => return Ok(None),
    };

    let stored = serde_json::from_str(&json).map_err(|e| {
        error!("Erro ao deserializar config SMTP: {}", e);
        e.to_string()
    })?;

    Ok(Some(stored))
}

fn validate_smtp_config(config: &SmtpConfigInput) -> Result<(), String> {
    if config.host.trim().is_empty() {
        return Err("Host SMTP é obrigatório".to_string());
    }

    if config.port == 0 {
        return Err("Porta SMTP inválida".to_string());
    }

    if config.username.trim().is_empty() {
        return Err("Usuário SMTP é obrigatório".to_string());
    }

    if config.from_name.trim().is_empty() {
        return Err("Nome do remetente é obrigatório".to_string());
    }

    config
        .from_email
        .trim()
        .parse::<Address>()
        .map_err(|_| "Email do remetente inválido".to_string())?;

    Ok(())
}

fn autoos_temp_dir() -> Result<PathBuf, String> {
    let temp_dir = env::temp_dir().join(AUTOOS_TEMP_DIR);
    fs::create_dir_all(&temp_dir).map_err(|e| {
        error!("Erro ao preparar diretório temporário do app: {}", e);
        format!("Erro ao preparar diretório temporário: {}", e)
    })?;
    Ok(temp_dir)
}

fn sanitize_leaf_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Nome do anexo é obrigatório".to_string());
    }

    let path = Path::new(trimmed);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("Nome do anexo inválido".to_string());
    }

    let leaf = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Nome do anexo inválido".to_string())?;

    let sanitized: String = leaf
        .chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '-' | '_' => character,
            _ => '_',
        })
        .collect();

    if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
        return Err("Nome do anexo inválido".to_string());
    }

    Ok(sanitized)
}

fn resolve_allowed_attachment_path(path: &str) -> Result<PathBuf, String> {
    let allowed_root = autoos_temp_dir()?;
    let allowed_root = fs::canonicalize(&allowed_root).map_err(|e| {
        error!("Erro ao resolver diretório temporário seguro: {}", e);
        "Diretório temporário seguro indisponível".to_string()
    })?;

    let requested_path = Path::new(path);
    if !requested_path.is_absolute() {
        return Err("Anexos por caminho devem estar no diretório temporário do app".to_string());
    }

    let canonical = fs::canonicalize(requested_path).map_err(|e| {
        error!("Erro ao resolver caminho do anexo: {}", e);
        format!("Erro ao acessar anexo informado: {}", e)
    })?;

    if !canonical.starts_with(&allowed_root) {
        warn!("Tentativa de acesso a anexo fora do diretório temporário permitido");
        return Err("Anexo fora do diretório temporário permitido".to_string());
    }

    Ok(canonical)
}

/// Salvar configuração SMTP no keyring do sistema.
#[tauri::command]
#[instrument(skip_all)]
pub async fn salvar_config_smtp(config: SmtpConfigInput) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_CONFIG_SMTP)?;
    validate_smtp_config(&config)?;
    debug!("Salvando configuração SMTP");

    let existing_password = load_stored_smtp_config()?
        .map(|stored| stored.password)
        .unwrap_or_default();

    let password = config
        .password
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or(existing_password);

    let stored = SmtpConfigStored {
        host: config.host.trim().to_string(),
        port: config.port,
        username: config.username.trim().to_string(),
        from_name: config.from_name.trim().to_string(),
        from_email: config.from_email.trim().to_string(),
        use_tls: config.use_tls,
        password,
    };

    let json = serde_json::to_string(&stored).map_err(|e| {
        error!("Erro ao serializar config SMTP: {}", e);
        e.to_string()
    })?;

    let entry = get_keyring_entry()?;

    entry.set_password(&json).map_err(|e| {
        error!("Erro ao salvar no keyring: {}", e);
        e.to_string()
    })?;

    record_security_event(
        "SMTP_CONFIG_SAVED",
        Some(&actor),
        format!(
            "host={}; port={}; username={}; use_tls={}",
            stored.host,
            stored.port,
            stored.username,
            stored.use_tls,
        ),
        true,
    )
    .await;

    info!("Configuração SMTP salva com sucesso");
    Ok(true)
}

/// Carregar configuração SMTP do keyring (sem senha).
#[tauri::command]
#[instrument(skip_all)]
pub async fn carregar_config_smtp() -> Result<SmtpConfigResponse, String> {
    require_permission(PERMISSION_CONFIG_SMTP)?;
    debug!("Carregando configuração SMTP");

    let stored = match load_stored_smtp_config()? {
        Some(config) => config,
        None => {
            warn!("Configuração SMTP não encontrada");
            return Err("Configuração SMTP não encontrada".to_string());
        }
    };

    info!("Configuração SMTP carregada");
    Ok(SmtpConfigResponse {
        host: stored.host,
        port: stored.port,
        username: stored.username,
        from_name: stored.from_name,
        from_email: stored.from_email,
        use_tls: stored.use_tls,
        has_password: !stored.password.is_empty(),
    })
}

/// Enviar email real via SMTP.
/// Suporta anexos (bytes diretos ou caminho de arquivo).
#[tauri::command]
#[instrument(skip_all)]
pub async fn enviar_email(input: EmailSendInput) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_CONFIG_SMTP)?;
    debug!("Enviando email via SMTP");

    let audit_details = format!(
        "destinatario={}; email={}; assunto={}",
        input.destinatario.trim(),
        input.email.trim(),
        input.assunto.trim(),
    );

    let config = match load_stored_smtp_config()? {
        Some(config) => config,
        None => {
            let details = format!("{}; motivo=configuracao_ausente", audit_details);
            record_security_event("EMAIL_SEND_FAILED", Some(&actor), details, false).await;
            return Err("Configure o SMTP primeiro".to_string());
        }
    };

    // Construir a mensagem
    let from = format!("{} <{}>", config.from_name, config.from_email);
    let to = format!("{} <{}>", input.destinatario, input.email);

    let mut message_builder = Message::builder()
        .from(from.parse().map_err(|e| {
            error!("Email de origem inválido: {}", e);
            format!("Email de origem inválido: {}", e)
        })?)
        .to(to.parse().map_err(|e| {
            error!("Email de destino inválido: {}", e);
            format!("Email de destino inválido: {}", e)
        })?)
        .subject(&input.assunto);

    if let Some(cc_list) = &input.cc {
        for cc in cc_list {
            let cc_email = cc.trim();
            if cc_email.is_empty() {
                continue;
            }
            message_builder = message_builder.cc(cc_email.parse().map_err(|e| {
                error!("Email de CC inválido: {}", e);
                format!("Email de CC inválido: {}", e)
            })?);
        }
    }

    let corpo_texto = input
        .corpo_texto
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| input.corpo.clone());
    let corpo_html = input
        .corpo_html
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    let corpo_multipart = if let Some(html) = corpo_html {
        MultiPart::alternative()
            .singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_PLAIN)
                    .body(corpo_texto.clone()),
            )
            .singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_HTML)
                    .body(html),
            )
    } else {
        MultiPart::alternative().singlepart(
            SinglePart::builder()
                .header(ContentType::TEXT_PLAIN)
                .body(corpo_texto),
        )
    };

    let email = if let Some(ref anexos) = input.anexos {
        if !anexos.is_empty() {
            debug!("Processando {} anexo(s)", anexos.len());
            let mut multipart = MultiPart::mixed().multipart(corpo_multipart);

            for anexo in anexos {
                let bytes = get_attachment_bytes(anexo)?;
                let content_type = anexo
                    .content_type
                    .clone()
                    .unwrap_or_else(|| "application/octet-stream".to_string());
                let content_type = content_type.parse::<ContentType>().map_err(|e| {
                    error!("Content-Type inválido para anexo: {}", e);
                    format!("Content-Type inválido para o anexo {}", anexo.filename)
                })?;
                let attachment = Attachment::new(sanitize_leaf_name(&anexo.filename)?)
                    .body(bytes, content_type);
                multipart = multipart.singlepart(attachment);
            }

            message_builder.multipart(multipart).map_err(|e| {
                error!("Erro ao construir email com anexos: {}", e);
                e.to_string()
            })?
        } else {
            message_builder.multipart(corpo_multipart).map_err(|e| {
                error!("Erro ao construir email: {}", e);
                e.to_string()
            })?
        }
    } else {
        message_builder.multipart(corpo_multipart).map_err(|e| {
            error!("Erro ao construir email: {}", e);
            e.to_string()
        })?
    };

    // Configurar transporte SMTP
    let creds = Credentials::new(config.username.clone(), config.password.clone());

    let mailer = if !config.use_tls {
        info!(
            "Configurando SMTP sem TLS (host={}, porta={})",
            config.host, config.port
        );
        AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&config.host)
            .credentials(creds)
            .port(config.port)
            .timeout(Some(SMTP_TIMEOUT))
            .build()
    } else if config.port == SMTPS_IMPLICIT_PORT {
        // SMTPS implícito (TLS desde o handshake). Usar `relay()` em vez de
        // `starttls_relay()`. Caso contrário a conexão fica pendurada
        // indefinidamente, pois o servidor espera TLS antes de qualquer
        // comando SMTP em texto.
        info!(
            "Configurando SMTPS implícito (host={}, porta={})",
            config.host, config.port
        );
        AsyncSmtpTransport::<Tokio1Executor>::relay(&config.host)
            .map_err(|e| {
                error!("Erro ao configurar SMTPS implícito: {}", e);
                e.to_string()
            })?
            .credentials(creds)
            .port(config.port)
            .timeout(Some(SMTP_TIMEOUT))
            .build()
    } else {
        info!(
            "Configurando SMTP STARTTLS (host={}, porta={})",
            config.host, config.port
        );
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host)
            .map_err(|e| {
                error!("Erro ao configurar SMTP STARTTLS: {}", e);
                e.to_string()
            })?
            .credentials(creds)
            .port(config.port)
            .timeout(Some(SMTP_TIMEOUT))
            .build()
    };

    debug!("Conectando ao servidor SMTP...");
    // Enviar
    mailer.send(email).await.map_err(|e| {
        error!("Erro ao enviar email: {}", e);
        let error_message = format!("Erro ao enviar email: {}", e);
        let details = format!("{}; motivo={}", audit_details, error_message);
        let actor = actor.clone();
        tauri::async_runtime::spawn(async move {
            record_security_event("EMAIL_SEND_FAILED", Some(&actor), details, false).await;
        });
        error_message
    })?;

    record_security_event("EMAIL_SENT", Some(&actor), audit_details, true).await;

    info!("Email enviado com sucesso para {}", input.email);
    Ok(true)
}

/// Obter bytes do anexo (de bytes diretos ou lendo arquivo).
fn get_attachment_bytes(anexo: &EmailAttachmentInput) -> Result<Vec<u8>, String> {
    if let Some(ref bytes) = anexo.bytes {
        debug!("Usando bytes diretos para anexo {}", anexo.filename);
        return Ok(bytes.clone());
    }

    if let Some(ref path) = anexo.path {
        debug!("Lendo anexo de arquivo permitido");
        let allowed_path = resolve_allowed_attachment_path(path)?;
        return fs::read(&allowed_path).map_err(|e| {
            error!("Erro ao ler anexo informado: {}", e);
            format!("Erro ao ler anexo informado: {}", e)
        });
    }

    error!("Anexo {} sem bytes nem caminho", anexo.filename);
    Err(format!(
        "Anexo {} não tem bytes nem caminho",
        anexo.filename
    ))
}
