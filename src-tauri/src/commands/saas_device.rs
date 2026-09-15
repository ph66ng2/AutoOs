use crate::commands::util::local_app_data_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tracing::{error, info};
use uuid::Uuid;

const DEVICE_MARKER_FILE: &str = "saas-device-v1.json";

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaasDeviceMarker {
    pub device_id: String,
}

fn marker_path() -> Result<PathBuf, String> {
    Ok(local_app_data_dir()?.join(DEVICE_MARKER_FILE))
}

fn validate_marker(marker: &SaasDeviceMarker) -> Result<(), String> {
    Uuid::parse_str(&marker.device_id)
        .map(|_| ())
        .map_err(|_| "Marcador local do dispositivo SaaS inválido.".to_string())
}

#[tauri::command]
pub async fn carregar_marcador_dispositivo_saas() -> Result<Option<SaasDeviceMarker>, String> {
    let path = marker_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let payload = fs::read_to_string(&path).map_err(|error| {
        error!("Falha ao ler marcador SaaS: {}", error);
        "Não foi possível ler o marcador local do dispositivo.".to_string()
    })?;
    let marker: SaasDeviceMarker = serde_json::from_str(&payload).map_err(|error| {
        error!("Marcador SaaS inválido: {}", error);
        "O marcador local do dispositivo está inválido.".to_string()
    })?;
    validate_marker(&marker)?;
    Ok(Some(marker))
}

#[tauri::command]
pub async fn criar_marcador_dispositivo_saas() -> Result<SaasDeviceMarker, String> {
    if let Some(marker) = carregar_marcador_dispositivo_saas().await? {
        return Ok(marker);
    }
    let marker = SaasDeviceMarker { device_id: Uuid::new_v4().to_string() };
    let payload = serde_json::to_vec(&marker).map_err(|_| "Não foi possível preparar o marcador local.".to_string())?;
    let path = marker_path()?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, payload).map_err(|error| {
        error!("Falha ao gravar marcador SaaS: {}", error);
        "Não foi possível criar o marcador local do dispositivo.".to_string()
    })?;
    fs::rename(&temporary, &path).map_err(|error| {
        error!("Falha ao finalizar marcador SaaS: {}", error);
        "Não foi possível finalizar o marcador local do dispositivo.".to_string()
    })?;
    info!("Marcador de dispositivo SaaS criado");
    Ok(marker)
}

#[tauri::command]
pub async fn remover_marcador_dispositivo_saas() -> Result<(), String> {
    let path = marker_path()?;
    match fs::remove_file(path) {
        Ok(()) => {
            info!("Marcador de dispositivo SaaS removido");
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            info!("Marcador de dispositivo SaaS já não existia");
            Ok(())
        }
        Err(error) => {
            error!("Falha ao remover marcador SaaS: {}", error);
            Err("Não foi possível remover o marcador local do dispositivo.".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{validate_marker, SaasDeviceMarker};

    #[test]
    fn only_accepts_uuid_device_markers() {
        assert!(validate_marker(&SaasDeviceMarker {
            device_id: "a0000000-0000-4000-8000-000000000001".into(),
        }).is_ok());
        assert!(validate_marker(&SaasDeviceMarker { device_id: "not-a-device".into() }).is_err());
    }
}
