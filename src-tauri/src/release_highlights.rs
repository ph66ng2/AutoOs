use serde::{Deserialize, Serialize};
use std::io::Write;
use tauri::Manager;

#[derive(Deserialize, Serialize)]
struct SeenRelease {
    last_seen_version: String,
}

fn storage_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("release-highlights.json"))
}

#[tauri::command]
pub fn get_seen_release_highlights(app: tauri::AppHandle) -> Result<Option<String>, String> {
    match std::fs::read(storage_path(&app)?) {
        Ok(bytes) => serde_json::from_slice::<SeenRelease>(&bytes)
            .map(|seen| Some(seen.last_seen_version))
            .map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn mark_release_highlights_seen(app: tauri::AppHandle) -> Result<(), String> {
    let path = storage_path(&app)?;
    let parent = path.parent().ok_or("Diretório de novidades inválido")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    // O frontend não escolhe caminho nem versão: só pode registrar o app instalado.
    let bytes = serde_json::to_vec(&SeenRelease {
        last_seen_version: app.package_info().version.to_string(),
    })
    .map_err(|e| e.to_string())?;
    let temporary = parent.join(format!("release-highlights-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temporary, &path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result.map_err(|e| e.to_string())
}
