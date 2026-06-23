use std::collections::HashMap;
use std::net::{SocketAddr, TcpListener, UdpSocket};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use axum::{
    extract::{multipart::Multipart, Path as AxumPath, Query, State},
    http::HeaderMap,
    response::Html,
    routing::{get, post},
    Json, Router,
};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::imageops::FilterType;
use image::{ImageEncoder, ExtendedColorType};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::Emitter;
use tokio::sync::{oneshot, Mutex as TokioMutex};
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info, warn};

use crate::commands::equipamento_imagens::{adicionar_imagem_equipamento_raw, MAX_IMAGE_BYTES};

const HTML_UPLOAD_PAGE: &str = r#"<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>AutoOS - Upload de Foto</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            padding: 16px;
            min-height: 100vh;
            min-height: 100dvh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .container {
            width: 100%;
            max-width: 480px;
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 {
            font-size: 1.5rem;
            color: #333;
            margin-bottom: 8px;
            text-align: center;
        }
        .subtitle {
            color: #666;
            font-size: 0.9rem;
            text-align: center;
            margin-bottom: 24px;
        }
        .btn-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 20px;
        }
        .btn-option {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            width: 100%;
            padding: 16px;
            border: 2px solid #e0e0e0;
            border-radius: 12px;
            background: white;
            font-size: 1.05rem;
            font-weight: 600;
            color: #333;
            cursor: pointer;
            min-height: 56px;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
            transition: border-color 0.15s, background 0.15s;
        }
        .btn-option:active {
            background: #f0f8ff;
            border-color: #007bff;
        }
        .btn-option.camera {
            border-color: #007bff;
            background: #f0f8ff;
            color: #007bff;
        }
        .btn-option.camera:active {
            background: #dbeaff;
        }
        .btn-option .icon {
            font-size: 1.4rem;
        }
        .btn-option .label-small {
            font-size: 0.78rem;
            font-weight: 400;
            color: #888;
            margin-top: 2px;
        }
        .btn-option .btn-text {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
        }
        input[type="file"] {
            display: none;
        }
        .preview-area {
            display: none;
            margin-bottom: 16px;
        }
        .preview-area.visible {
            display: block;
        }
        .preview-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 8px;
        }
        .preview-grid img {
            width: 100%;
            height: 80px;
            object-fit: cover;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
        }
        .file-count {
            font-size: 0.85rem;
            color: #666;
            text-align: center;
        }
        button.submit-btn {
            width: 100%;
            padding: 16px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            min-height: 44px;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
            display: none;
        }
        button.submit-btn.visible {
            display: block;
        }
        button.submit-btn:active {
            background: #0056b3;
        }
        button.submit-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        #status {
            margin-top: 16px;
            padding: 12px;
            border-radius: 8px;
            text-align: center;
            font-size: 0.95rem;
            display: none;
        }
        #status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
            display: block;
        }
        #status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
            display: block;
        }
        #status.info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
            display: block;
        }
        .success-overlay {
            display: none;
            text-align: center;
            padding: 24px 16px;
        }
        .success-overlay.visible {
            display: block;
        }
        .success-icon {
            font-size: 4rem;
            color: #28a745;
            margin-bottom: 16px;
        }
        .success-title {
            font-size: 1.3rem;
            font-weight: 700;
            color: #155724;
            margin-bottom: 8px;
        }
        .success-count {
            font-size: 1rem;
            color: #666;
            margin-bottom: 24px;
        }
        .success-btn {
            width: 100%;
            padding: 14px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
        }
        .success-btn:active {
            background: #0056b3;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>AutoOS</h1>
        <p class="subtitle">Upload de Foto</p>
        <form id="uploadForm" enctype="multipart/form-data" method="POST">
            <div class="btn-group" id="formContent">
                <button type="button" class="btn-option camera" id="cameraBtn">
                    <span class="icon">&#128247;</span>
                    <div class="btn-text">
                        <span>Tirar Foto</span>
                        <span class="label-small">Usar c&#226;mera do celular</span>
                    </div>
                </button>
                <button type="button" class="btn-option" id="galleryBtn">
                    <span class="icon">&#128444;&#65039;</span>
                    <div class="btn-text">
                        <span>Escolher da Galeria</span>
                        <span class="label-small">Selecionar at&#233; 3 fotos</span>
                    </div>
                </button>
            </div>
            <input type="file" id="cameraInput" name="photo" accept="image/*" capture="environment" multiple>
            <input type="file" id="galleryInput" name="photo" accept="image/*" multiple>
            <div class="preview-area" id="previewArea">
                <div class="preview-grid" id="previewGrid"></div>
                <div class="file-count" id="fileCount"></div>
            </div>
            <button type="submit" class="submit-btn" id="submitBtn">Enviar Foto</button>
        </form>
        <div id="status"></div>
        <div class="success-overlay" id="successOverlay">
            <div class="success-icon">&#9989;</div>
            <div class="success-title">Imagem(ns) Carregada(s) com Sucesso!</div>
            <div class="success-count" id="successCount"></div>
            <button type="button" class="success-btn" id="sendMoreBtn">Enviar mais fotos</button>
        </div>
    </div>
    <script>
        const form = document.getElementById('uploadForm');
        const statusEl = document.getElementById('status');
        const submitBtn = document.getElementById('submitBtn');
        const cameraBtn = document.getElementById('cameraBtn');
        const galleryBtn = document.getElementById('galleryBtn');
        const cameraInput = document.getElementById('cameraInput');
        const galleryInput = document.getElementById('galleryInput');
        const previewArea = document.getElementById('previewArea');
        const previewGrid = document.getElementById('previewGrid');
        const fileCountEl = document.getElementById('fileCount');
        const successOverlay = document.getElementById('successOverlay');
        const successCountEl = document.getElementById('successCount');
        const sendMoreBtn = document.getElementById('sendMoreBtn');
        const formContent = document.getElementById('formContent');
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        
        form.action = '/upload?token=' + encodeURIComponent(token || '');

        let selectedFiles = [];

        function updatePreview() {
            previewGrid.innerHTML = '';
            if (selectedFiles.length === 0) {
                previewArea.classList.remove('visible');
                submitBtn.classList.remove('visible');
                return;
            }
            selectedFiles.forEach(file => {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.alt = file.name;
                    previewGrid.appendChild(img);
                };
                reader.readAsDataURL(file);
            });
            previewArea.classList.add('visible');
            submitBtn.classList.add('visible');
            const count = selectedFiles.length;
            fileCountEl.textContent = count + ' foto' + (count > 1 ? 's' : '') + ' selecionada' + (count > 1 ? 's' : '');
            submitBtn.textContent = 'Enviar ' + count + ' Foto' + (count > 1 ? 's' : '');
        }

        function addFiles(files) {
            if (!files) return;
            const newFiles = Array.from(files);
            if (selectedFiles.length + newFiles.length > 3) {
                statusEl.className = 'error';
                statusEl.textContent = 'M\u00e1ximo de 3 fotos permitido.';
                return;
            }
            selectedFiles = selectedFiles.concat(newFiles);
            updatePreview();
        }

        cameraBtn.addEventListener('click', function() {
            cameraInput.value = '';
            cameraInput.click();
        });

        galleryBtn.addEventListener('click', function() {
            galleryInput.value = '';
            galleryInput.click();
        });

        cameraInput.addEventListener('change', function() {
            selectedFiles = [];
            addFiles(this.files);
        });

        galleryInput.addEventListener('change', function() {
            selectedFiles = [];
            addFiles(this.files);
        });
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (selectedFiles.length === 0) {
                statusEl.className = 'error';
                statusEl.textContent = 'Selecione uma foto primeiro.';
                return;
            }
            if (selectedFiles.length > 3) {
                statusEl.className = 'error';
                statusEl.textContent = 'M\u00e1ximo de 3 fotos permitido.';
                return;
            }
            submitBtn.disabled = true;
            statusEl.className = 'info';
            statusEl.textContent = 'Enviando...';
            
            const formData = new FormData();
            selectedFiles.forEach(file => {
                formData.append('photo[]', file);
            });

            try {
                const response = await fetch(form.action, {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                if (result.success) {
                    formContent.style.display = 'none';
                    form.style.display = 'none';
                    statusEl.style.display = 'none';
                    successOverlay.classList.add('visible');
                    const count = result.count || selectedFiles.length;
                    successCountEl.textContent = count + ' foto' + (count > 1 ? 's' : '') + ' enviada' + (count > 1 ? 's' : '');
                    selectedFiles = [];
                } else {
                    statusEl.className = 'error';
                    statusEl.textContent = result.error || result.message || 'Erro ao enviar foto';
                }
            } catch (err) {
                statusEl.className = 'error';
                statusEl.textContent = 'Erro de conex\u00e3o. Tente novamente.';
            } finally {
                submitBtn.disabled = false;
            }
        });

        sendMoreBtn.addEventListener('click', function() {
            formContent.style.display = 'flex';
            form.style.display = 'block';
            statusEl.style.display = 'none';
            successOverlay.classList.remove('visible');
            selectedFiles = [];
            cameraInput.value = '';
            galleryInput.value = '';
            previewArea.classList.remove('visible');
            submitBtn.classList.remove('visible');
            submitBtn.textContent = 'Enviar Foto';
            statusEl.className = '';
            statusEl.textContent = '';
        });
    </script>
</body>
</html>"#;

// ── Token types ────────────────────────────────────────────────

#[derive(Clone)]
struct TokenData {
    equipamento_id: i32,
    categoria: String,
    expires_at: Instant,
    used: bool,
    /// Stores resized image bytes when equipamento_id == 0 (draft mode)
    image_data: Option<Arc<Vec<ImageData>>>,
}

/// Image data returned via status endpoint for draft uploads (equipamento_id == 0)
#[derive(Clone)]
struct ImageData {
    bytes: Vec<u8>,
    filename: String,
    mime_type: String,
}

type TokenStore = Arc<TokioMutex<HashMap<String, TokenData>>>;

// ── AppState shared with axum handlers ─────────────────────────

#[derive(Clone)]
struct AppState {
    token_store: TokenStore,
    app_handle: tauri::AppHandle,
    last_activity: Arc<std::sync::Mutex<Instant>>,
}

// ── Shared server handle stored in static ──────────────────────

/// Holds the spawned server task and the shutdown signal sender.
/// Both the auto-shutdown monitor and `stop_photo_server` can trigger shutdown
/// via the shared `oneshot::Sender`.
struct ServerHandle {
    join_handle: tauri::async_runtime::JoinHandle<()>,
    shutdown_trigger: Arc<std::sync::Mutex<Option<oneshot::Sender<()>>>>,
}

static SERVER: OnceLock<std::sync::Mutex<Option<ServerHandle>>> = OnceLock::new();
static TOKEN_STORE: OnceLock<TokenStore> = OnceLock::new();

// ── Request payload types ──────────────────────────────────────

#[derive(Deserialize)]
struct UploadParams {
    token: String,
}

#[derive(Serialize)]
struct ImageDataResponse {
    bytes: Vec<u8>,
    filename: String,
    mime_type: String,
}

#[derive(Serialize)]
struct StatusResponse {
    valid: bool,
    used: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    image_data: Option<Vec<ImageDataResponse>>,
}

// ── Helpers ────────────────────────────────────────────────────

fn get_token_store() -> TokenStore {
    TOKEN_STORE
        .get_or_init(|| Arc::new(TokioMutex::new(HashMap::new())))
        .clone()
}

fn generate_token() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub(crate) fn get_lan_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let local_addr = socket.local_addr().ok()?;
    let ip = local_addr.ip().to_string();
    if ip == "127.0.0.1" || ip == "::1" {
        return None;
    }
    Some(ip)
}

/// Try to bind a TCP listener on the given port. Returns the bound listener or an error.
fn try_bind(port: u16) -> Result<tokio::net::TcpListener, String> {
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let std_listener = TcpListener::bind(addr)
        .map_err(|e| format!("Porta {} em uso: {}", port, e))?;
    std_listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    tokio::net::TcpListener::from_std(std_listener).map_err(|e| e.to_string())
}

// ── Axum route handlers ────────────────────────────────────────

async fn index_handler() -> Html<&'static str> {
    Html(HTML_UPLOAD_PAGE)
}

async fn upload_handler(
    State(state): State<AppState>,
    Query(params): Query<UploadParams>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Json<serde_json::Value> {
    let token_data = {
        let store = state.token_store.lock().await;
        match store.get(&params.token) {
            Some(t) if t.expires_at > Instant::now() && !t.used => t.clone(),
            _ => {
                return Json(json!({
                    "success": false,
                    "error": "Token inválido, expirado ou já utilizado"
                }));
            }
        }
    };

    if let Some(content_length) = headers.get("content-length") {
        if let Ok(len_str) = content_length.to_str() {
            if let Ok(len) = len_str.parse::<usize>() {
                if len > MAX_IMAGE_BYTES * 3 {
                    return Json(json!({
                        "success": false,
                        "error": "Requisição muito grande. Máximo 9MB no total."
                    }));
                }
            }
        }
    }

    let mut images = Vec::new();

    while let Some(field) = multipart.next_field().await.ok().flatten() {
        let name = field.name();
        if name != Some("photo") && name != Some("photo[]") {
            continue;
        }

        let content_type = field.content_type().map(|s| s.to_string());
        let filename = field
            .file_name()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "upload.jpg".to_string());

        let data = match field.bytes().await {
            Ok(d) => d,
            Err(_) => {
                return Json(json!({
                    "success": false,
                    "error": "Erro ao ler arquivo"
                }));
            }
        };

        let mime = content_type.as_deref().unwrap_or("");
        let is_jpeg = mime == "image/jpeg";
        let is_png = mime == "image/png";
        if !is_jpeg && !is_png {
            return Json(json!({
                "success": false,
                "error": "Tipo de arquivo não suportado. Use JPEG ou PNG."
            }));
        }

        if data.len() > MAX_IMAGE_BYTES {
            return Json(json!({
                "success": false,
                "error": "Arquivo muito grande. Máximo 3MB."
            }));
        }

        let (encoded, final_mime) = match resize_image(&data, is_jpeg) {
            Ok(result) => result,
            Err(e) => {
                return Json(json!({
                    "success": false,
                    "error": e
                }));
            }
        };

        if encoded.len() > MAX_IMAGE_BYTES {
            return Json(json!({
                "success": false,
                "error": "Imagem redimensionada ainda excede 3MB. Tente uma foto menor."
            }));
        }

        images.push((encoded, final_mime, filename));
    }

    if images.is_empty() {
        return Json(json!({
            "success": false,
            "error": "Nenhuma foto enviada"
        }));
    }

    if images.len() > 3 {
        return Json(json!({
            "success": false,
            "error": "Máximo de 3 fotos permitido."
        }));
    }

    // Draft mode: equipamento_id == 0 means don't save to DB
    if token_data.equipamento_id == 0 {
        let count = images.len();
        let image_vec: Vec<ImageData> = images
            .into_iter()
            .map(|(bytes, mime_type, filename)| ImageData {
                bytes,
                filename,
                mime_type,
            })
            .collect();

        let mut store = state.token_store.lock().await;
        if let Some(t) = store.get_mut(&params.token) {
            t.used = true;
            t.image_data = Some(Arc::new(image_vec));
        }

        info!("Fotos recebidas (modo rascunho): count={}", count);

        return Json(json!({
            "success": true,
            "message": format!("{} foto(s) enviada(s) com sucesso!", count),
            "count": count
        }));
    }

    let mut imagem_ids = Vec::new();

    for (encoded, final_mime, filename) in images {
        match adicionar_imagem_equipamento_raw(
            token_data.equipamento_id,
            token_data.categoria.clone(),
            filename,
            final_mime,
            encoded,
            None,
        )
        .await
        {
            Ok(row) => {
                imagem_ids.push(row.id);
            }
            Err(e) => {
                return Json(json!({
                    "success": false,
                    "error": e
                }));
            }
        }
    }

    // ── Update last activity ──────────────────────
    {
        let mut last = state.last_activity.lock().unwrap_or_else(|e| e.into_inner());
        *last = Instant::now();
    }

    // ── Emit photo-received events to frontend ─────
    for imagem_id in &imagem_ids {
        let payload = json!({
            "equipamento_id": token_data.equipamento_id,
            "imagem_id": imagem_id,
        });
        if let Err(e) = state.app_handle.emit("photo-received", payload) {
            error!("Falha ao emitir evento photo-received: {}", e);
        }
    }

    // ── Mark token as used ───────────────────────
    let mut store = state.token_store.lock().await;
    if let Some(t) = store.get_mut(&params.token) {
        t.used = true;
    }

    let count = imagem_ids.len();
    info!(
        "Fotos recebidas: equipamento={} count={}",
        token_data.equipamento_id, count
    );

    Json(json!({
        "success": true,
        "message": format!("{} foto(s) salva(s) com sucesso!", count),
        "count": count
    }))
}

fn resize_image(data: &[u8], is_jpeg: bool) -> Result<(Vec<u8>, String), String> {
    const MAX_DIM: u32 = 1600;

    let img = image::load_from_memory(data)
        .map_err(|_| {
            "Não foi possível processar a imagem. Arquivo corrompido ou inválido.".to_string()
        })?;

    let (width, height) = (img.width(), img.height());
    let max_dim = width.max(height);

    let resized = if max_dim > MAX_DIM {
        let scale = MAX_DIM as f64 / max_dim as f64;
        let new_w = (width as f64 * scale).round() as u32;
        let new_h = (height as f64 * scale).round() as u32;
        img.resize(new_w, new_h, FilterType::Lanczos3)
    } else {
        img
    };

    if is_jpeg {
        let mut buf = Vec::new();
        let encoder = JpegEncoder::new_with_quality(&mut buf, 82);
        let rgb = resized.to_rgb8();
        encoder
            .write_image(rgb.as_raw(), rgb.width(), rgb.height(), ExtendedColorType::Rgb8)
            .map_err(|_| "Erro ao codificar imagem JPEG".to_string())?;
        Ok((buf, "image/jpeg".to_string()))
    } else {
        let mut buf = Vec::new();
        let encoder = PngEncoder::new(&mut buf);
        let rgba = resized.to_rgba8();
        encoder
            .write_image(rgba.as_raw(), rgba.width(), rgba.height(), ExtendedColorType::Rgba8)
            .map_err(|_| "Erro ao codificar imagem PNG".to_string())?;
        Ok((buf, "image/png".to_string()))
    }
}

async fn status_handler(
    State(state): State<AppState>,
    AxumPath(token): AxumPath<String>,
) -> Json<StatusResponse> {
    let store = state.token_store.lock().await;
    let token_data = store.get(&token);
    let valid = match token_data {
        Some(t) => t.expires_at > Instant::now() && !t.used,
        None => false,
    };
    let used = token_data.map(|t| t.used).unwrap_or(false);
    let image_data = token_data
        .and_then(|t| t.image_data.clone())
        .map(|vec| {
            vec.iter()
                .map(|data| ImageDataResponse {
                    bytes: data.bytes.clone(),
                    filename: data.filename.clone(),
                    mime_type: data.mime_type.clone(),
                })
                .collect::<Vec<_>>()
        });
    Json(StatusResponse { valid, used, image_data })
}

// ── Auto-shutdown monitor ──────────────────────────────────────

const INACTIVITY_TIMEOUT: Duration = Duration::from_secs(15 * 60); // 15 minutes
const MONITOR_CHECK_INTERVAL: Duration = Duration::from_secs(30); // check every 30 seconds

/// Spawns a background task that sends the shutdown signal after `INACTIVITY_TIMEOUT`
/// of no activity. Resets the timer on each photo upload via `last_activity`.
fn spawn_auto_shutdown_monitor(
    last_activity: Arc<std::sync::Mutex<Instant>>,
    shutdown_trigger: Arc<std::sync::Mutex<Option<oneshot::Sender<()>>>>,
) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(MONITOR_CHECK_INTERVAL).await;

            let idle_duration = {
                let last = last_activity.lock().unwrap_or_else(|e| e.into_inner());
                last.elapsed()
            };

            if idle_duration >= INACTIVITY_TIMEOUT {
                info!(
                    "Servidor de fotos inativo por {:?} — desligamento automático",
                    idle_duration
                );
                let tx = shutdown_trigger
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .take();
                if let Some(tx) = tx {
                    let _ = tx.send(());
                }
                break;
            }
        }
    });
}

// ── Tauri IPC commands ─────────────────────────────────────────

/// Start the photo server. Accepts `app_handle` injected by Tauri for event emission.
/// Tries up to 3 ports starting from `port` (default: 8765).
#[tauri::command]
pub async fn start_photo_server(
    app_handle: tauri::AppHandle,
    port: u16,
) -> Result<String, String> {
    // ── 1. Check if already running ────────────────────────────
    let server_lock = SERVER.get_or_init(|| std::sync::Mutex::new(None));
    {
        let guard = server_lock.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("Servidor de fotos já está ativo".to_string());
        }
    }

    // ── 2. Try ports with fallback (3 attempts) ───────────────
    let mut listener = None;
    let mut bound_port = port;
    for offset in 0..3 {
        let candidate = port + offset;
        match try_bind(candidate) {
            Ok(l) => {
                listener = Some(l);
                bound_port = candidate;
                break;
            }
            Err(e) => {
                warn!("Porta {} não disponível: {}", candidate, e);
            }
        }
    }

    let listener = listener.ok_or_else(|| {
        format!(
            "Nenhuma porta disponível (tentou {}, {}, {})",
            port,
            port + 1,
            port + 2
        )
    })?;

    // ── 3. Build shared state ─────────────────────────────────
    let token_store = get_token_store();
    let last_activity = Arc::new(std::sync::Mutex::new(Instant::now()));
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let shutdown_trigger = Arc::new(std::sync::Mutex::new(Some(shutdown_tx)));

    let state = AppState {
        token_store,
        app_handle: app_handle.clone(),
        last_activity: last_activity.clone(),
    };

    let app = Router::new()
        .route("/", get(index_handler))
        .route("/upload", post(upload_handler))
        .route("/status/:token", get(status_handler))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(state);

    // ── 4. Serve with graceful shutdown ───────────────────────
    let serve_future = axum::serve(listener, app).with_graceful_shutdown(async move {
        let _ = shutdown_rx.await;
    });

    let join_handle = tauri::async_runtime::spawn(async move {
        if let Err(e) = serve_future.await {
            error!("Erro no servidor de fotos: {}", e);
        }
    });

    // ── 5. Spawn auto-shutdown monitor ────────────────────────
    spawn_auto_shutdown_monitor(last_activity, shutdown_trigger.clone());

    // ── 6. Store server handle ────────────────────────────────
    {
        let mut guard = server_lock.lock().map_err(|e| e.to_string())?;
        *guard = Some(ServerHandle {
            join_handle,
            shutdown_trigger,
        });
    }

    let lan_ip = get_lan_ip().unwrap_or_else(|| "localhost".to_string());
    info!(
        "Servidor de fotos iniciado em http://{}:{}",
        lan_ip, bound_port
    );

    Ok(format!("http://{}:{}", lan_ip, bound_port))
}

/// Stop the photo server gracefully. Sends shutdown signal, waits up to 5 seconds
/// for in-flight requests to complete, then aborts as fallback.
#[tauri::command]
pub async fn stop_photo_server() -> Result<(), String> {
    let server_lock = SERVER.get_or_init(|| std::sync::Mutex::new(None));

    let server = {
        let mut guard = server_lock.lock().map_err(|e| e.to_string())?;
        guard.take()
    };

    let Some(server) = server else {
        return Err("Servidor de fotos não está em execução".to_string());
    };

    let tx = server
        .shutdown_trigger
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take();
    if let Some(tx) = tx {
        let _ = tx.send(());
    }

    match tokio::time::timeout(Duration::from_secs(5), server.join_handle).await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            error!("Servidor de fotos finalizou com erro: {}", e);
        }
        Err(_elapsed) => {
            warn!("Servidor de fotos não parou em 5s — shutdown signal já enviado, tarefa será finalizada em breve");
        }
    }

    info!("Servidor de fotos parado");
    Ok(())
}

/// Generate a single-use upload token for a given equipment.
/// Valid for 10 minutes. Token is only usable while the server is running.
#[tauri::command]
pub async fn generate_upload_token(
    equipamento_id: i32,
    categoria: String,
) -> Result<String, String> {
    let token = generate_token();
    let token_store = get_token_store();

    let mut store = token_store.lock().await;
    store.insert(
        token.clone(),
        TokenData {
            equipamento_id,
            categoria,
            expires_at: Instant::now() + Duration::from_secs(600),
            used: false,
            image_data: None,
        },
    );

    info!("Token de upload gerado para equipamento {}", equipamento_id);
    Ok(token)
}
