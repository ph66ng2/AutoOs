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
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            font-weight: 600;
            margin-bottom: 8px;
            color: #444;
            font-size: 1rem;
        }
        input[type="file"] {
            width: 100%;
            padding: 12px;
            border: 2px dashed #ccc;
            border-radius: 8px;
            font-size: 1rem;
            cursor: pointer;
            min-height: 44px;
        }
        input[type="file"]:active {
            border-color: #007bff;
            background: #f0f8ff;
        }
        button {
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
        }
        button:active {
            background: #0056b3;
        }
        button:disabled {
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
    </style>
</head>
<body>
    <div class="container">
        <h1>AutoOS</h1>
        <p class="subtitle">Upload de Foto</p>
        <form id="uploadForm" enctype="multipart/form-data" method="POST">
            <div class="form-group">
                <label for="photo">Selecione uma foto</label>
                <input type="file" id="photo" name="photo" accept="image/jpeg,image/png" capture="environment" required>
            </div>
            <button type="submit" id="submitBtn">Enviar Foto</button>
        </form>
        <div id="status"></div>
    </div>
    <script>
        const form = document.getElementById('uploadForm');
        const statusEl = document.getElementById('status');
        const submitBtn = document.getElementById('submitBtn');
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        
        form.action = '/upload?token=' + encodeURIComponent(token || '');
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            submitBtn.disabled = true;
            statusEl.className = 'info';
            statusEl.textContent = 'Enviando...';
            
            try {
                const response = await fetch(form.action, {
                    method: 'POST',
                    body: new FormData(form)
                });
                const result = await response.json();
                if (result.success) {
                    statusEl.className = 'success';
                    statusEl.textContent = result.message || 'Foto enviada com sucesso! \u2713';
                    form.reset();
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
struct StatusResponse {
    valid: bool,
    used: bool,
}

// ── Helpers ────────────────────────────────────────────────────

fn get_token_store() -> TokenStore {
    TOKEN_STORE
        .get_or_init(|| Arc::new(TokioMutex::new(HashMap::new())))
        .clone()
}

fn generate_token() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let counter = COUNTER.fetch_add(1, Ordering::SeqCst);
    let nanos = Instant::now().elapsed().as_nanos();
    format!("{:x}{:x}", nanos, counter)
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
                if len > MAX_IMAGE_BYTES * 2 {
                    return Json(json!({
                        "success": false,
                        "error": "Arquivo muito grande. Máximo 3MB."
                    }));
                }
            }
        }
    }

    while let Some(field) = multipart.next_field().await.ok().flatten() {
        if field.name() != Some("photo") {
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
                // ── Update last activity ──────────────────────
                {
                    let mut last = state.last_activity.lock().unwrap_or_else(|e| e.into_inner());
                    *last = Instant::now();
                }

                // ── Emit photo-received event to frontend ─────
                let payload = json!({
                    "equipamento_id": token_data.equipamento_id,
                    "imagem_id": row.id,
                });
                if let Err(e) = state.app_handle.emit("photo-received", payload) {
                    error!("Falha ao emitir evento photo-received: {}", e);
                }

                // ── Mark token as used ───────────────────────
                let mut store = state.token_store.lock().await;
                if let Some(t) = store.get_mut(&params.token) {
                    t.used = true;
                }

                info!(
                    "Foto recebida: equipamento={} imagem={}",
                    token_data.equipamento_id, row.id
                );

                return Json(json!({
                    "success": true,
                    "message": "Foto salva com sucesso!"
                }));
            }
            Err(e) => {
                return Json(json!({
                    "success": false,
                    "error": e
                }));
            }
        }
    }

    Json(json!({
        "success": false,
        "error": "Nenhuma foto enviada"
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
    Json(StatusResponse { valid, used })
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
        },
    );

    info!("Token de upload gerado para equipamento {}", equipamento_id);
    Ok(token)
}
