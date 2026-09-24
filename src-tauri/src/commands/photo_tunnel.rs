//! Túnel Cloudflare para o QR público de fotos (`fotos.bmitag.com.br`).
//!
//! O hostname e o DNS continuam na conta Cloudflare da BMITAG. Este módulo
//! só lê o token do conector (env ou keyring) e sobe `cloudflared tunnel run`
//! apontando para o Axum local em `127.0.0.1:8765`.

use crate::commands::auth::{
    record_security_event, require_permission, PERMISSION_CONFIG_SMTP,
};
use crate::commands::util::{autoos_logs_dir, local_app_data_dir};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tracing::{error, info, warn};

pub const PHOTO_PUBLIC_HOST: &str = "fotos.bmitag.com.br";
pub const PHOTO_PUBLIC_BASE_URL: &str = "https://fotos.bmitag.com.br";
pub const PHOTO_TUNNEL_ENV: &str = "AUTOOS_PHOTO_TUNNEL_TOKEN";
const KEYRING_SERVICE: &str = "autoos";
const KEYRING_USER: &str = "photo_tunnel_token";
const TUNNEL_READY_WAIT: Duration = Duration::from_millis(1500);

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

pub(crate) fn is_tunnel_configured() -> bool {
    load_tunnel_token().is_some()
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

pub(crate) fn resolve_cloudflared() -> Result<PathBuf, String> {
    cloudflared_candidates()
        .into_iter()
        .find(|path| is_executable_candidate(path))
        .ok_or_else(|| {
            format!(
                "cloudflared não encontrado. Instale o cliente Cloudflare Tunnel e coloque o executável no PATH ou em {}.",
                local_app_data_dir()
                    .map(|dir| dir.join(cloudflared_binary_name()).display().to_string())
                    .unwrap_or_else(|_| cloudflared_binary_name().to_string())
            )
        })
}

fn apply_stdio(cmd: &mut Command) {
    match autoos_logs_dir().and_then(|dir| {
        File::create(dir.join("cloudflared.log")).map_err(|e| e.to_string())
    }) {
        Ok(file) => match file.try_clone() {
            Ok(stderr) => {
                cmd.stdout(Stdio::from(file));
                cmd.stderr(Stdio::from(stderr));
            }
            Err(_) => {
                cmd.stdout(Stdio::from(file));
                cmd.stderr(Stdio::null());
            }
        },
        Err(_) => {
            cmd.stdout(Stdio::null());
            cmd.stderr(Stdio::null());
        }
    }
}

pub async fn start_tunnel() -> Result<(), String> {
    stop_tunnel().await;

    let token = load_tunnel_token().ok_or_else(|| {
        "Token do túnel de fotos não configurado. Cole o token em Configurações → Integrações ou defina AUTOOS_PHOTO_TUNNEL_TOKEN.".to_string()
    })?;
    let binary = resolve_cloudflared()?;

    let mut cmd = Command::new(&binary);
    cmd.args(["tunnel", "run", "--token", &token])
        .stdin(Stdio::null())
        .env("TUNNEL_TOKEN", &token);
    apply_stdio(&mut cmd);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| {
        error!("Falha ao iniciar cloudflared: {}", e);
        format!("Não foi possível iniciar o cloudflared: {}", e)
    })?;

    tokio::time::sleep(TUNNEL_READY_WAIT).await;

    match child.try_wait() {
        Ok(Some(status)) => {
            return Err(format!(
                "cloudflared encerrou imediatamente ({}). Confira o token do túnel e o hostname {} → http://127.0.0.1:8765.",
                status, PHOTO_PUBLIC_HOST
            ));
        }
        Ok(None) => {}
        Err(e) => {
            let _ = child.kill();
            return Err(format!("Erro ao verificar o processo cloudflared: {}", e));
        }
    }

    let mut guard = tunnel_slot().lock().map_err(|e| e.to_string())?;
    *guard = Some(TunnelHandle { child });
    info!(
        "Túnel de fotos iniciado para https://{}",
        PHOTO_PUBLIC_HOST
    );
    Ok(())
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
        has_token: is_tunnel_configured(),
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
    fn public_host_is_bmitag_fotos() {
        assert_eq!(PHOTO_PUBLIC_HOST, "fotos.bmitag.com.br");
        assert_eq!(PHOTO_PUBLIC_BASE_URL, "https://fotos.bmitag.com.br");
    }

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
}
