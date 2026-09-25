//! Túnel Cloudflare para o QR público de fotos.
//!
//! IMPROVISADO / TEMPORÁRIO — não é o desenho de fotos do SaaS.
//! O celular envia para este PC (`localhost:8765`) só enquanto o QR estiver
//! aberto. Tickets futuros (PHOTO / AO-EQP-ONLINE) devem mandar a foto para a
//! API ou Storage da empresa (URL assinada), não através deste túnel.
//! Não reabrir PHOTO-001 / PHOTO-009 para promover esta solução.
//!
//! Padrão atual: túnel rápido (`cloudflared tunnel --url`), uma URL HTTPS
//! temporária por PC (`*.trycloudflare.com`). Não precisa de DNS nem de token.
//! Opcional: token de túnel nomeado para `fotos.bmitag.com.br` (um PC por vez).

use crate::commands::auth::{
    record_security_event, require_permission, PERMISSION_CONFIG_SMTP,
};
use crate::commands::util::{autoos_logs_dir, local_app_data_dir};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tracing::{error, info, warn};

pub const PHOTO_PUBLIC_HOST: &str = "fotos.bmitag.com.br";
pub const PHOTO_PUBLIC_BASE_URL: &str = "https://fotos.bmitag.com.br";
pub const PHOTO_TUNNEL_ENV: &str = "AUTOOS_PHOTO_TUNNEL_TOKEN";
const KEYRING_SERVICE: &str = "autoos";
const KEYRING_USER: &str = "photo_tunnel_token";
const NAMED_TUNNEL_READY_WAIT: Duration = Duration::from_millis(1500);
const QUICK_TUNNEL_WAIT: Duration = Duration::from_secs(20);
const QUICK_TUNNEL_POLL: Duration = Duration::from_millis(200);

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct PhotoTunnelConfigInput {
    pub token: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PhotoTunnelConfigResponse {
    pub has_token: bool,
    pub env_override: bool,
    pub public_host: String,
}

struct TunnelHandle {
    child: Child,
    public_base_url: String,
}

static TUNNEL: OnceLock<Mutex<Option<TunnelHandle>>> = OnceLock::new();

fn tunnel_slot() -> &'static Mutex<Option<TunnelHandle>> {
    TUNNEL.get_or_init(|| Mutex::new(None))
}

fn get_keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| {
        error!("Erro ao criar entrada keyring do túnel de fotos: {}", e);
        e.to_string()
    })
}

fn load_keyring_token() -> Option<String> {
    let entry = get_keyring_entry().ok()?;
    match entry.get_password() {
        Ok(value) => {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        Err(_) => None,
    }
}

pub(crate) fn load_env_token() -> Option<String> {
    std::env::var(PHOTO_TUNNEL_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn load_tunnel_token() -> Option<String> {
    load_env_token().or_else(load_keyring_token)
}

pub(crate) fn is_named_tunnel_configured() -> bool {
    load_tunnel_token().is_some()
}

pub(crate) fn should_use_tunnel() -> bool {
    is_named_tunnel_configured() || cloudflared_available()
}

pub(crate) fn cloudflared_binary_name() -> &'static str {
    if cfg!(windows) {
        "cloudflared.exe"
    } else {
        "cloudflared"
    }
}

pub(crate) fn cloudflared_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(dir) = local_app_data_dir() {
        candidates.push(dir.join(cloudflared_binary_name()));
    }
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            candidates.push(dir.join(cloudflared_binary_name()));
        }
    }
    if !cfg!(windows) {
        candidates.push(PathBuf::from("/usr/local/bin/cloudflared"));
        candidates.push(PathBuf::from("/usr/bin/cloudflared"));
    }
    candidates
}

fn is_executable_candidate(path: &Path) -> bool {
    path.is_file()
}

pub(crate) fn cloudflared_available() -> bool {
    resolve_cloudflared().is_ok()
}

pub(crate) fn resolve_cloudflared() -> Result<PathBuf, String> {
    cloudflared_candidates()
        .into_iter()
        .find(|path| is_executable_candidate(path))
        .ok_or_else(|| {
            format!(
                "cloudflared não encontrado. Copie o executável para o PATH ou para {}.",
                local_app_data_dir()
                    .map(|dir| dir.join(cloudflared_binary_name()).display().to_string())
                    .unwrap_or_else(|_| cloudflared_binary_name().to_string())
            )
        })
}

pub(crate) fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(character) = chars.next() {
        if character == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for next in chars.by_ref() {
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            continue;
        }
        out.push(character);
    }
    out
}

pub(crate) fn extract_quick_tunnel_url(line: &str) -> Option<String> {
    let cleaned = strip_ansi(line);
    let start = cleaned.find("https://")?;
    let rest = &cleaned[start..];
    let end = rest
        .find(|character: char| {
            character.is_whitespace()
                || matches!(character, '|' | '"' | '\'' | ')' | ']' | ',' | '>')
        })
        .unwrap_or(rest.len());
    let url = rest[..end].trim_end_matches('/').to_string();
    if url.contains(".trycloudflare.com") {
        Some(url)
    } else {
        None
    }
}

pub(crate) fn active_public_base_url() -> Option<String> {
    let guard = tunnel_slot().lock().ok()?;
    guard
        .as_ref()
        .map(|handle| handle.public_base_url.clone())
}

fn append_log_line(line: &str) {
    let Ok(dir) = autoos_logs_dir() else {
        return;
    };
    let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("cloudflared.log"))
    else {
        return;
    };
    let _ = writeln!(file, "{}", line);
}

fn spawn_cloudflared(args: &[&str], token: Option<&str>) -> Result<Child, String> {
    let binary = resolve_cloudflared()?;
    let mut cmd = Command::new(&binary);
    cmd.args(args).stdin(Stdio::null());
    if token.is_some() {
        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::null());
        if let Ok(dir) = autoos_logs_dir() {
            if let Ok(file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(dir.join("cloudflared.log"))
            {
                if let Ok(stderr) = file.try_clone() {
                    cmd.stdout(Stdio::from(file));
                    cmd.stderr(Stdio::from(stderr));
                }
            }
        }
    } else {
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
    }
    if let Some(token) = token {
        cmd.env("TUNNEL_TOKEN", token);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.spawn().map_err(|e| {
        error!("Falha ao iniciar cloudflared: {}", e);
        format!("Não foi possível iniciar o cloudflared: {}", e)
    })
}

fn pipe_url_finder(child: &mut Child, tx: mpsc::Sender<String>) {
    if let Some(stdout) = child.stdout.take() {
        let tx_stdout = tx.clone();
        std::thread::spawn(move || drain_pipe(BufReader::new(stdout), tx_stdout));
    }
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || drain_pipe(BufReader::new(stderr), tx));
    }
}

fn drain_pipe<R: std::io::Read + Send + 'static>(reader: BufReader<R>, tx: mpsc::Sender<String>) {
    for line in reader.lines() {
        let Ok(line) = line else {
            break;
        };
        append_log_line(&line);
        if let Some(url) = extract_quick_tunnel_url(&line) {
            let _ = tx.send(url);
        }
    }
}

async fn wait_for_quick_url(
    child: &mut Child,
    rx: mpsc::Receiver<String>,
) -> Result<String, String> {
    let deadline = Instant::now() + QUICK_TUNNEL_WAIT;
    loop {
        if let Ok(url) = rx.try_recv() {
            return Ok(url);
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(format!(
                    "cloudflared encerrou antes de publicar a URL ({}). Confira a internet de saída (HTTPS).",
                    status
                ));
            }
            Ok(None) => {}
            Err(e) => {
                let _ = child.kill();
                return Err(format!("Erro ao verificar o processo cloudflared: {}", e));
            }
        }

        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(
                "cloudflared não publicou a URL a tempo. Confira a internet de saída (HTTPS) e se o executável está instalado."
                    .to_string(),
            );
        }

        tokio::time::sleep(QUICK_TUNNEL_POLL).await;
    }
}

fn store_handle(child: Child, public_base_url: String) -> Result<String, String> {
    let mut guard = tunnel_slot().lock().map_err(|e| e.to_string())?;
    *guard = Some(TunnelHandle {
        child,
        public_base_url: public_base_url.clone(),
    });
    Ok(public_base_url)
}

pub async fn start_tunnel(local_port: u16) -> Result<String, String> {
    stop_tunnel().await;
    let binary_note = resolve_cloudflared()?;

    if let Some(token) = load_tunnel_token() {
        let mut child = spawn_cloudflared(&["tunnel", "run", "--token", &token], Some(&token))?;
        tokio::time::sleep(NAMED_TUNNEL_READY_WAIT).await;
        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(format!(
                    "cloudflared encerrou imediatamente ({}). Confira o token do túnel e o hostname {} → http://127.0.0.1:{}.",
                    status, PHOTO_PUBLIC_HOST, local_port
                ));
            }
            Ok(None) => {}
            Err(e) => {
                let _ = child.kill();
                return Err(format!("Erro ao verificar o processo cloudflared: {}", e));
            }
        }
        info!(
            "Túnel nomeado de fotos iniciado ({}) via {}",
            PHOTO_PUBLIC_BASE_URL,
            binary_note.display()
        );
        return store_handle(child, PHOTO_PUBLIC_BASE_URL.to_string());
    }

    let origin = format!("http://127.0.0.1:{}", local_port);
    let mut child = spawn_cloudflared(
        &["tunnel", "--no-autoupdate", "--url", &origin],
        None,
    )?;
    let (tx, rx) = mpsc::channel();
    pipe_url_finder(&mut child, tx);
    let public_base_url = wait_for_quick_url(&mut child, rx).await?;
    info!(
        "Túnel rápido de fotos iniciado em {} (origem {})",
        public_base_url, origin
    );
    store_handle(child, public_base_url)
}

pub async fn stop_tunnel() {
    let handle = match tunnel_slot().lock() {
        Ok(mut guard) => guard.take(),
        Err(poisoned) => poisoned.into_inner().take(),
    };

    let Some(mut handle) = handle else {
        return;
    };

    if let Err(e) = handle.child.kill() {
        warn!("Falha ao encerrar cloudflared: {}", e);
    }
    let _ = handle.child.wait();
    info!("Túnel de fotos encerrado");
}

#[tauri::command]
pub async fn salvar_config_photo_tunnel(
    config: PhotoTunnelConfigInput,
) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_CONFIG_SMTP)?;
    let token = config
        .token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let entry = get_keyring_entry()?;
    if let Some(token) = token {
        entry.set_password(token).map_err(|e| {
            error!("Erro ao salvar token do túnel de fotos no keyring: {}", e);
            e.to_string()
        })?;
        record_security_event(
            "PHOTO_TUNNEL_CONFIG_SAVED",
            Some(&actor),
            format!("host={}", PHOTO_PUBLIC_HOST),
            true,
        )
        .await;
        info!("Token do túnel de fotos salvo no keyring");
    } else {
        match entry.delete_password() {
            Ok(()) => {}
            Err(keyring::Error::NoEntry) => {}
            Err(e) => {
                error!("Erro ao remover token do túnel de fotos: {}", e);
                return Err(e.to_string());
            }
        }
        record_security_event(
            "PHOTO_TUNNEL_CONFIG_CLEARED",
            Some(&actor),
            format!("host={}", PHOTO_PUBLIC_HOST),
            true,
        )
        .await;
        info!("Token do túnel de fotos removido do keyring");
    }

    Ok(true)
}

#[tauri::command]
pub async fn carregar_config_photo_tunnel() -> Result<PhotoTunnelConfigResponse, String> {
    require_permission(PERMISSION_CONFIG_SMTP)?;
    Ok(PhotoTunnelConfigResponse {
        has_token: is_named_tunnel_configured(),
        env_override: load_env_token().is_some(),
        public_host: PHOTO_PUBLIC_HOST.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn env_token_is_trimmed_and_optional() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::remove_var(PHOTO_TUNNEL_ENV);
        assert_eq!(load_env_token(), None);

        std::env::set_var(PHOTO_TUNNEL_ENV, "  eyJtest  ");
        assert_eq!(load_env_token().as_deref(), Some("eyJtest"));

        std::env::set_var(PHOTO_TUNNEL_ENV, "   ");
        assert_eq!(load_env_token(), None);
        std::env::remove_var(PHOTO_TUNNEL_ENV);
    }

    #[test]
    fn binary_name_matches_platform() {
        if cfg!(windows) {
            assert_eq!(cloudflared_binary_name(), "cloudflared.exe");
        } else {
            assert_eq!(cloudflared_binary_name(), "cloudflared");
        }
    }

    #[test]
    fn candidates_include_app_data_and_path() {
        let candidates = cloudflared_candidates();
        assert!(
            candidates.iter().any(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name == cloudflared_binary_name())
            }),
            "expected cloudflared filename in candidates: {:?}",
            candidates
        );
    }

    #[test]
    fn extracts_trycloudflare_url_from_banner() {
        let line = "2024-01-01 INF |  https://random-words-here.trycloudflare.com                          |";
        assert_eq!(
            extract_quick_tunnel_url(line).as_deref(),
            Some("https://random-words-here.trycloudflare.com")
        );
    }

    #[test]
    fn extracts_trycloudflare_url_from_plain_line() {
        assert_eq!(
            extract_quick_tunnel_url("Visit it at:\nhttps://foo-bar.trycloudflare.com/")
                .as_deref(),
            Some("https://foo-bar.trycloudflare.com")
        );
    }

    #[test]
    fn ignores_metrics_and_other_https() {
        assert_eq!(
            extract_quick_tunnel_url("metrics server on https://127.0.0.1:20241/metrics"),
            None
        );
        assert_eq!(extract_quick_tunnel_url("https://fotos.bmitag.com.br"), None);
    }

    #[test]
    fn strips_ansi_before_parsing_url() {
        let line = "\u{1b}[32mhttps://ansi-color.trycloudflare.com\u{1b}[0m";
        assert_eq!(
            extract_quick_tunnel_url(line).as_deref(),
            Some("https://ansi-color.trycloudflare.com")
        );
    }
}
