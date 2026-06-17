use serde::Serialize;
use tracing::info;

use crate::commands::photo_server;

#[derive(Serialize)]
pub struct QrUploadResult {
    pub qr_svg: String,
    pub url: String,
    pub token: String,
}

/// Gera um QR code para upload de foto via dispositivo móvel.
///
/// 1. Gera um token de upload (delega para `photo_server::generate_upload_token`)
/// 2. Descobre o IP LAN da máquina (delega para `photo_server::get_lan_ip`)
/// 3. Monta a URL no formato `http://{IP}:{PORT}/?token={TOKEN}&eq={ID}&cat={CATEGORIA}`
/// 4. Gera um QR code em SVG apontando para essa URL
#[tauri::command]
pub async fn gerar_qr_upload(
    equipamento_id: i32,
    categoria: String,
    port: u16,
) -> Result<QrUploadResult, String> {
    info!(
        "Gerando QR code para equipamento {} / categoria {} / porta {}",
        equipamento_id, categoria, port
    );

    let token = photo_server::generate_upload_token(equipamento_id, categoria.clone()).await?;
    let ip = photo_server::get_lan_ip().unwrap_or_else(|| "localhost".to_string());
    let url = format!(
        "http://{}:{}/?token={}&eq={}&cat={}",
        ip, port, token, equipamento_id, categoria
    );

    let code = qrcode::QrCode::new(url.as_bytes())
        .map_err(|e| format!("Erro ao gerar QR code: {}", e))?;
    let qr_svg = code
        .render::<qrcode::render::svg::Color>()
        .build();

    info!("QR code gerado para equipamento {} em {}", equipamento_id, url);

    Ok(QrUploadResult {
        qr_svg,
        url,
        token,
    })
}
