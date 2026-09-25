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
use crate::commands::photo_tunnel;
use base64::Engine;

/// Tamanho máximo do arquivo que chega da câmera, antes do redimensionamento.
/// Fotos nativas de celular passam fácil de 3MB; o limite de armazenamento
/// continua sendo `MAX_IMAGE_BYTES` depois do encode.
const MAX_INCOMING_IMAGE_BYTES: usize = 12 * 1024 * 1024;

pub(crate) const HTML_UPLOAD_PAGE: &str = include_str!("photo_upload.html");

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
    app_handle: Option<tauri::AppHandle>,
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

pub(crate) fn photo_listen_addr(port: u16, loopback_only: bool) -> SocketAddr {
    if loopback_only {
        SocketAddr::from(([127, 0, 0, 1], port))
    } else {
        SocketAddr::from(([0, 0, 0, 0], port))
    }
}

/// Try to bind a TCP listener on the given address. Returns the bound listener or an error.
fn try_bind(addr: SocketAddr) -> Result<tokio::net::TcpListener, String> {
    let std_listener = TcpListener::bind(addr)
        .map_err(|e| format!("Porta {} em uso: {}", addr.port(), e))?;
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
                if len > MAX_INCOMING_IMAGE_BYTES * 3 {
                    return Json(json!({
                        "success": false,
                        "error": "Requisição muito grande. Máximo 36MB no total."
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
        if data.is_empty() {
            return Json(json!({
                "success": false,
                "error": "Foto vazia. Tire de novo ou use a galeria."
            }));
        }
        if is_heic_like(&data, mime) {
            return Json(json!({
                "success": false,
                "error": "A câmera enviou HEIC. Atualize a página no celular e tire a foto de novo."
            }));
        }
        let Some(is_jpeg) = sniff_image_kind(&data, mime) else {
            return Json(json!({
                "success": false,
                "error": "Tipo de arquivo não suportado. Use JPEG ou PNG."
            }));
        };

        if data.len() > MAX_INCOMING_IMAGE_BYTES {
            return Json(json!({
                "success": false,
                "error": "Arquivo muito grande. Máximo 12MB."
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
        let storage_path = format!(
            "data:{};base64,{}",
            final_mime,
            base64::engine::general_purpose::STANDARD.encode(&encoded)
        );
        let tamanho_bytes = i32::try_from(encoded.len()).unwrap_or(0);

        match adicionar_imagem_equipamento_raw(
            token_data.equipamento_id,
            token_data.categoria.clone(),
            filename,
            final_mime,
            storage_path,
            tamanho_bytes,
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
        if let Some(handle) = &state.app_handle {
            if let Err(e) = handle.emit("photo-received", payload) {
                error!("Falha ao emitir evento photo-received: {}", e);
            }
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

fn sniff_image_kind(data: &[u8], declared_mime: &str) -> Option<bool> {
    if data.len() >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
        return Some(true);
    }
    if data.len() >= 8
        && data[0] == 0x89
        && data[1] == b'P'
        && data[2] == b'N'
        && data[3] == b'G'
        && data[4] == 0x0D
        && data[5] == 0x0A
        && data[6] == 0x1A
        && data[7] == 0x0A
    {
        return Some(false);
    }
    let mime = declared_mime.to_ascii_lowercase();
    if mime == "image/jpeg" || mime == "image/jpg" {
        return Some(true);
    }
    if mime == "image/png" {
        return Some(false);
    }
    None
}

fn is_heic_like(data: &[u8], declared_mime: &str) -> bool {
    let mime = declared_mime.to_ascii_lowercase();
    if mime.contains("heic") || mime.contains("heif") {
        return true;
    }
    if data.len() >= 12 && &data[4..8] == b"ftyp" {
        let brand = &data[8..12];
        return brand == b"heic"
            || brand == b"heif"
            || brand == b"mif1"
            || brand == b"msf1"
            || brand == b"heix"
            || brand == b"hevc";
    }
    false
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
    let via_tunnel = photo_tunnel::should_use_tunnel();
    let (_bound_port, url) =
        start_photo_listener(Some(app_handle), port, via_tunnel, via_tunnel).await?;
    Ok(url)
}

/// Sobe o HTTP de fotos só em 127.0.0.1, sem túnel e sem AppHandle.
/// Usado pelo teste Windows/CI (`p1_photo_integration`).
pub async fn start_photo_http_loopback(port: u16) -> Result<u16, String> {
    let (bound_port, _url) = start_photo_listener(None, port, true, false).await?;
    Ok(bound_port)
}

async fn start_photo_listener(
    app_handle: Option<tauri::AppHandle>,
    port: u16,
    loopback_only: bool,
    enable_tunnel: bool,
) -> Result<(u16, String), String> {
    // ── 1. Check if already running ────────────────────────────
    let server_lock = SERVER.get_or_init(|| std::sync::Mutex::new(None));
    {
        let guard = server_lock.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("Servidor de fotos já está ativo".to_string());
        }
    }

    // ── 2. Bind. Túnel (rápido ou nomeado) escuta só em 127.0.0.1:porta.
    let named_tunnel = photo_tunnel::is_named_tunnel_configured();
    let bind_attempts = if loopback_only { 1 } else { 3 };
    let mut listener = None;
    let mut bound_port = port;
    for offset in 0..bind_attempts {
        let candidate = port + offset;
        let addr = photo_listen_addr(candidate, loopback_only);
        match try_bind(addr) {
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
        if named_tunnel && enable_tunnel {
            format!(
                "Porta {} ocupada. O túnel {} exige essa porta.",
                port,
                photo_tunnel::PHOTO_PUBLIC_HOST
            )
        } else {
            format!(
                "Nenhuma porta disponível (tentou {}, {}, {})",
                port,
                port + 1,
                port + 2
            )
        }
    })?;

    // ── 3. Build shared state ─────────────────────────────────
    let token_store = get_token_store();
    let last_activity = Arc::new(std::sync::Mutex::new(Instant::now()));
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let shutdown_trigger = Arc::new(std::sync::Mutex::new(Some(shutdown_tx)));

    let state = AppState {
        token_store,
        app_handle,
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

    if enable_tunnel {
        match photo_tunnel::start_tunnel(bound_port).await {
            Ok(public_url) => {
                info!(
                    "Servidor de fotos iniciado em {} (local 127.0.0.1:{})",
                    public_url, bound_port
                );
                return Ok((bound_port, public_url));
            }
            Err(e) => {
                let _ = stop_photo_server().await;
                return Err(e);
            }
        }
    }

    let lan_ip = if loopback_only {
        "127.0.0.1".to_string()
    } else {
        get_lan_ip().unwrap_or_else(|| "localhost".to_string())
    };
    let url = format!("http://{}:{}", lan_ip, bound_port);
    info!("Servidor de fotos iniciado em {}", url);
    Ok((bound_port, url))
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

    photo_tunnel::stop_tunnel().await;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tunnel_binds_loopback_only() {
        assert_eq!(
            photo_listen_addr(8765, true),
            SocketAddr::from(([127, 0, 0, 1], 8765))
        );
    }

    #[test]
    fn lan_binds_all_interfaces() {
        assert_eq!(
            photo_listen_addr(8765, false),
            SocketAddr::from(([0, 0, 0, 0], 8765))
        );
    }

    #[test]
    fn upload_page_has_single_picker_up_to_three() {
        assert!(HTML_UPLOAD_PAGE.contains(r#"id="pickerInput""#));
        assert!(HTML_UPLOAD_PAGE.contains(r#"accept="image/*" multiple"#));
        assert!(
            !HTML_UPLOAD_PAGE.contains("capture="),
            "sem capture o celular pergunta câmera ou galeria"
        );
        assert!(!HTML_UPLOAD_PAGE.contains("cameraInput"));
        assert!(!HTML_UPLOAD_PAGE.contains("galleryInput"));
        assert!(HTML_UPLOAD_PAGE.contains("var MAX_PHOTOS = 3"));
        assert!(HTML_UPLOAD_PAGE.contains("Adicionar fotos"));
        assert!(HTML_UPLOAD_PAGE.contains("AutoOS"));
        assert!(HTML_UPLOAD_PAGE.contains("BMITAG"));
        assert!(HTML_UPLOAD_PAGE.contains("--primary: hsl(220 70% 50%)"));
        assert!(HTML_UPLOAD_PAGE.contains("fileToJpeg"));
        assert!(HTML_UPLOAD_PAGE.contains("sendSelected"));
    }

    #[test]
    fn jpeg_magic_bytes_are_accepted_even_without_mime() {
        let jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
        assert_eq!(sniff_image_kind(&jpeg, ""), Some(true));
        assert_eq!(sniff_image_kind(&jpeg, "application/octet-stream"), Some(true));
    }

    #[test]
    fn png_magic_bytes_are_accepted() {
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(sniff_image_kind(&png, ""), Some(false));
    }

    #[test]
    fn heic_is_detected_from_mime_or_ftyp() {
        assert!(is_heic_like(&[0], "image/heic"));
        let mut ftyp = vec![0u8; 12];
        ftyp[4..8].copy_from_slice(b"ftyp");
        ftyp[8..12].copy_from_slice(b"heic");
        assert!(is_heic_like(&ftyp, ""));
        assert!(!is_heic_like(&[0xFF, 0xD8, 0xFF], "image/jpeg"));
    }
}
