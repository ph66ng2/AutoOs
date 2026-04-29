#![allow(dead_code)]

#[path = "../db.rs"]
mod db;
#[path = "../commands/mod.rs"]
mod commands;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use commands::auth;
use commands::smtp;
use commands::types::{EmailSendInput, SmtpConfigInput, WhatsappConfigInput, WhatsappSendInput};
use commands::whatsapp;
use keyring::Entry;
use sqlx::PgPool;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

const KEYRING_SERVICE: &str = "autoos";
const SMTP_KEYRING_USER: &str = "smtp_config";
const WHATSAPP_KEYRING_USER: &str = "whatsapp_config";
const PROFILE_KEYRING_PREFIX: &str = "sensitive_access_profile_";
const PIN: &str = "2468";

#[derive(Clone, Default)]
struct KeyringBackup {
    smtp: Option<String>,
    whatsapp: Option<String>,
}

#[derive(Default)]
struct CleanupState {
    previous_default_id: Option<i32>,
    profile_id: Option<i32>,
    keyring_backup: KeyringBackup,
}

#[derive(Clone, Debug, Default)]
struct HttpCapture {
    headers: String,
    body: String,
}

#[derive(Clone, Debug, Default)]
struct SmtpCapture {
    raw_message: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let pool = db::init_database()
        .await
        .context("failed to init database for communication integration")?;
    let started_at = Utc::now();
    let mut cleanup = CleanupState::default();

    cleanup.keyring_backup = backup_channel_keyring().context("failed to backup channel keyring")?;
    cleanup.previous_default_id = current_default_profile_id(&pool).await?;

    let run_result: Result<()> = async {
        let profile_id = create_temporary_profile(&pool).await?;
        cleanup.profile_id = Some(profile_id);
        set_default_profile(&pool, profile_id).await?;

        auth::configure_sensitive_pin(PIN.to_string(), None)
            .await
            .map_err(|error| anyhow!("failed to configure temp profile pin: {}", error))?;

        let (smtp_port, _smtp_capture, smtp_handle) = start_fake_smtp_server()?;
        let (http_url, http_capture, http_handle) = start_fake_whatsapp_server()?;

        smtp::salvar_config_smtp(SmtpConfigInput {
            host: "127.0.0.1".to_string(),
            port: smtp_port,
            username: "tester".to_string(),
            from_name: "AutoOS Test".to_string(),
            from_email: "autoos@test.local".to_string(),
            use_tls: false,
            password: Some("secret".to_string()),
        })
        .await
        .map_err(|error| anyhow!("failed to save smtp config: {}", error))?;

        whatsapp::salvar_config_whatsapp(WhatsappConfigInput {
            provider: "EVOLUTION".to_string(),
            api_url: http_url.clone(),
            token: Some("token-123".to_string()),
        })
        .await
        .map_err(|error| anyhow!("failed to save whatsapp config: {}", error))?;

        smtp::enviar_email(EmailSendInput {
            destinatario: "Cliente Integracao".to_string(),
            email: "cliente@test.local".to_string(),
            assunto: "P1 Communication Integration".to_string(),
            corpo: "Body from controlled SMTP integration".to_string(),
            corpo_texto: None,
            corpo_html: None,
            anexos: None,
        })
        .await
        .map_err(|error| anyhow!("failed to send smtp email: {}", error))?;

        whatsapp::enviar_whatsapp(WhatsappSendInput {
            contato: "5511999999999".to_string(),
            mensagem: "P1 communication integration over controlled HTTP".to_string(),
        })
        .await
        .map_err(|error| anyhow!("failed to send whatsapp message: {}", error))?;

        let smtp_result = smtp_handle
            .join()
            .map_err(|_| anyhow!("fake smtp thread panicked"))??;
        let http_result = http_handle
            .join()
            .map_err(|_| anyhow!("fake whatsapp thread panicked"))??;

        let http_snapshot = http_capture
            .lock()
            .map_err(|_| anyhow!("failed to read whatsapp capture"))?
            .clone();

        if !smtp_result.raw_message.contains("Subject: P1 Communication Integration")
            || !smtp_result.raw_message.contains("Body from controlled SMTP integration")
        {
            return Err(anyhow!("smtp capture missing expected subject/body"));
        }

        if !http_result.body.contains("\"number\":\"5511999999999\"")
            || !http_result.body.contains("P1 communication integration over controlled HTTP")
        {
            return Err(anyhow!("whatsapp capture missing expected payload"));
        }

        if !http_snapshot.headers.to_ascii_lowercase().contains("apikey: token-123") {
            return Err(anyhow!("whatsapp request missing apikey header"));
        }

        let events: Vec<String> = sqlx::query_scalar(
            "SELECT event_type
             FROM security_audit_log
             WHERE profile_id = $1 AND created_at >= $2
             ORDER BY created_at ASC",
        )
        .bind(profile_id)
        .bind(started_at.naive_utc())
        .fetch_all(&pool)
        .await
        .context("failed to fetch communication audit events")?;

        for expected in [
            "SMTP_CONFIG_SAVED",
            "WHATSAPP_CONFIG_SAVED",
            "EMAIL_SENT",
            "WHATSAPP_SENT",
        ] {
            if !events.iter().any(|event| event == expected) {
                return Err(anyhow!("missing audit event {}", expected));
            }
        }

        println!("P1_COMM_SMTP_MESSAGE_OK=ok");
        println!("P1_COMM_WHATSAPP_REQUEST_OK=ok");
        println!("P1_COMM_AUDIT_OK=ok");
        println!("P1_COMM_OK");

        Ok(())
    }
    .await;

    cleanup_state(&pool, cleanup).await?;
    run_result
}

async fn current_default_profile_id(pool: &PgPool) -> Result<Option<i32>> {
    sqlx::query_scalar(
        "SELECT id FROM security_profiles WHERE ativo = true AND is_default = true ORDER BY id LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .context("failed to read current default profile")
}

async fn create_temporary_profile(pool: &PgPool) -> Result<i32> {
    let permissions = serde_json::to_string(&vec![
        auth::PERMISSION_CONFIG_SMTP.to_string(),
        auth::PERMISSION_CONFIG_WHATSAPP.to_string(),
    ])
    .context("failed to serialize temp profile permissions")?;

    sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em)
         VALUES ($1, 'OPERADOR', $2, true, false, NOW())
         RETURNING id",
    )
    .bind(format!("P1 Communication {}", Utc::now().format("%Y%m%d%H%M%S")))
    .bind(permissions)
    .fetch_one(pool)
    .await
    .context("failed to create temporary communication profile")
}

async fn set_default_profile(pool: &PgPool, profile_id: i32) -> Result<()> {
    sqlx::query("UPDATE security_profiles SET is_default = (id = $1), atualizado_em = NOW() WHERE ativo = true")
        .bind(profile_id)
        .execute(pool)
        .await
        .context("failed to switch default profile")?;
    let _ = auth::lock_sensitive_access().await;
    Ok(())
}

async fn cleanup_state(pool: &PgPool, cleanup: CleanupState) -> Result<()> {
    let _ = auth::lock_sensitive_access().await;

    if let Some(profile_id) = cleanup.profile_id {
        sqlx::query("DELETE FROM security_profiles WHERE id = $1")
            .bind(profile_id)
            .execute(pool)
            .await
            .context("failed to delete temporary communication profile")?;

        if let Ok(entry) = Entry::new(KEYRING_SERVICE, &format!("{}{}", PROFILE_KEYRING_PREFIX, profile_id)) {
            let _ = entry.delete_password();
        }
    }

    if let Some(previous_default_id) = cleanup.previous_default_id {
        sqlx::query("UPDATE security_profiles SET is_default = (id = $1), atualizado_em = NOW() WHERE ativo = true")
            .bind(previous_default_id)
            .execute(pool)
            .await
            .context("failed to restore previous default profile")?;
    }

    restore_channel_keyring(&cleanup.keyring_backup).context("failed to restore channel keyring")?;
    Ok(())
}

fn backup_channel_keyring() -> Result<KeyringBackup> {
    Ok(KeyringBackup {
        smtp: read_keyring_password(SMTP_KEYRING_USER)?,
        whatsapp: read_keyring_password(WHATSAPP_KEYRING_USER)?,
    })
}

fn restore_channel_keyring(backup: &KeyringBackup) -> Result<()> {
    restore_keyring_password(SMTP_KEYRING_USER, backup.smtp.as_deref())?;
    restore_keyring_password(WHATSAPP_KEYRING_USER, backup.whatsapp.as_deref())?;
    Ok(())
}

fn read_keyring_password(user: &str) -> Result<Option<String>> {
    let entry = Entry::new(KEYRING_SERVICE, user).map_err(|error| anyhow!("keyring entry error: {}", error))?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(_) => Ok(None),
    }
}

fn restore_keyring_password(user: &str, value: Option<&str>) -> Result<()> {
    let entry = Entry::new(KEYRING_SERVICE, user).map_err(|error| anyhow!("keyring entry error: {}", error))?;
    if let Some(value) = value {
        entry
            .set_password(value)
            .map_err(|error| anyhow!("failed to restore keyring value for {}: {}", user, error))?;
    } else {
        let _ = entry.delete_password();
    }
    Ok(())
}

fn start_fake_smtp_server() -> Result<(u16, Arc<Mutex<SmtpCapture>>, JoinHandle<Result<SmtpCapture>>)> {
    let listener = TcpListener::bind("127.0.0.1:0").context("failed to bind fake smtp server")?;
    listener
        .set_nonblocking(false)
        .context("failed to configure fake smtp listener")?;
    let port = listener.local_addr().context("failed to read fake smtp addr")?.port();
    let capture = Arc::new(Mutex::new(SmtpCapture::default()));
    let capture_for_thread = Arc::clone(&capture);

    let handle = thread::spawn(move || -> Result<SmtpCapture> {
        let (mut stream, _) = listener.accept().context("failed to accept fake smtp connection")?;
        stream
            .set_read_timeout(Some(Duration::from_secs(15)))
            .context("failed to set fake smtp read timeout")?;
        stream
            .set_write_timeout(Some(Duration::from_secs(15)))
            .context("failed to set fake smtp write timeout")?;

        write_smtp_line(&mut stream, "220 localhost ESMTP AutoOS")?;
        let mut reader = BufReader::new(stream.try_clone().context("failed to clone smtp stream")?);
        let mut raw_message = String::new();
        let mut in_data = false;
        let mut auth_login_stage = 0_u8;

        loop {
            let mut line = String::new();
            let bytes = reader.read_line(&mut line).context("failed to read fake smtp line")?;
            if bytes == 0 {
                break;
            }
            let trimmed = line.trim_end_matches(['\r', '\n']);

            if in_data {
                if trimmed == "." {
                    in_data = false;
                    write_smtp_line(&mut stream, "250 queued")?;
                    continue;
                }
                raw_message.push_str(trimmed);
                raw_message.push('\n');
                continue;
            }

            if auth_login_stage == 1 {
                auth_login_stage = 2;
                write_smtp_line(&mut stream, "334 UGFzc3dvcmQ6")?;
                continue;
            }

            if auth_login_stage == 2 {
                auth_login_stage = 0;
                write_smtp_line(&mut stream, "235 authenticated")?;
                continue;
            }

            let upper = trimmed.to_ascii_uppercase();
            if upper.starts_with("EHLO") || upper.starts_with("HELO") {
                stream
                    .write_all(b"250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n")
                    .context("failed to write fake smtp EHLO response")?;
            } else if upper.starts_with("AUTH PLAIN") {
                write_smtp_line(&mut stream, "235 authenticated")?;
            } else if upper == "AUTH LOGIN" {
                auth_login_stage = 1;
                write_smtp_line(&mut stream, "334 VXNlcm5hbWU6")?;
            } else if upper.starts_with("MAIL FROM:") || upper.starts_with("RCPT TO:") {
                write_smtp_line(&mut stream, "250 OK")?;
            } else if upper == "DATA" {
                in_data = true;
                write_smtp_line(&mut stream, "354 End data with <CR><LF>.<CR><LF>")?;
            } else if upper == "QUIT" {
                write_smtp_line(&mut stream, "221 bye")?;
                break;
            } else {
                write_smtp_line(&mut stream, "250 OK")?;
            }
        }

        let snapshot = SmtpCapture { raw_message };
        if let Ok(mut guard) = capture_for_thread.lock() {
            *guard = snapshot.clone();
        }
        Ok(snapshot)
    });

    Ok((port, capture, handle))
}

fn write_smtp_line(stream: &mut TcpStream, line: &str) -> Result<()> {
    stream
        .write_all(format!("{}\r\n", line).as_bytes())
        .context("failed to write fake smtp line")?;
    Ok(())
}

fn start_fake_whatsapp_server() -> Result<(String, Arc<Mutex<HttpCapture>>, JoinHandle<Result<HttpCapture>>)> {
    let listener = TcpListener::bind("127.0.0.1:0").context("failed to bind fake whatsapp server")?;
    let port = listener.local_addr().context("failed to read fake whatsapp addr")?.port();
    let capture = Arc::new(Mutex::new(HttpCapture::default()));
    let capture_for_thread = Arc::clone(&capture);

    let handle = thread::spawn(move || -> Result<HttpCapture> {
        let (mut stream, _) = listener.accept().context("failed to accept fake whatsapp connection")?;
        stream
            .set_read_timeout(Some(Duration::from_secs(15)))
            .context("failed to set fake whatsapp read timeout")?;
        stream
            .set_write_timeout(Some(Duration::from_secs(15)))
            .context("failed to set fake whatsapp write timeout")?;

        let mut buffer = Vec::new();
        let mut chunk = [0_u8; 1024];
        loop {
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(read) => {
                    buffer.extend_from_slice(&chunk[..read]);
                    if let Some((header_end, content_length)) = parse_http_header(&buffer) {
                        let total = header_end + content_length;
                        if buffer.len() >= total {
                            break;
                        }
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => continue,
                Err(error) => return Err(anyhow!("failed to read fake whatsapp request: {}", error)),
            }
        }

        let request = String::from_utf8_lossy(&buffer).to_string();
        let (header_end, content_length) = parse_http_header(&buffer)
            .ok_or_else(|| anyhow!("failed to parse fake whatsapp request headers"))?;
        let headers = String::from_utf8_lossy(&buffer[..header_end]).to_string();
        let body_bytes = &buffer[header_end..header_end + content_length];
        let body = String::from_utf8_lossy(body_bytes).to_string();

        stream
            .write_all(
                b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 15\r\nConnection: close\r\n\r\n{\"status\":\"ok\"}",
            )
            .context("failed to write fake whatsapp response")?;

        let snapshot = HttpCapture { headers, body };
        if let Ok(mut guard) = capture_for_thread.lock() {
            *guard = snapshot.clone();
        }
        let _ = request;
        Ok(snapshot)
    });

    Ok((format!("http://127.0.0.1:{}/send", port), capture, handle))
}

fn parse_http_header(buffer: &[u8]) -> Option<(usize, usize)> {
    let marker = b"\r\n\r\n";
    let header_pos = buffer.windows(marker.len()).position(|window| window == marker)?;
    let header_end = header_pos + marker.len();
    let headers = String::from_utf8_lossy(&buffer[..header_end]).to_string();
    let content_length = headers
        .lines()
        .find_map(|line| {
            let mut parts = line.splitn(2, ':');
            let key = parts.next()?.trim();
            let value = parts.next()?.trim();
            if key.eq_ignore_ascii_case("content-length") {
                value.parse::<usize>().ok()
            } else {
                None
            }
        })
        .unwrap_or(0);
    Some((header_end, content_length))
}
