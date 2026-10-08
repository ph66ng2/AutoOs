use serde::Serialize;
use tracing::info;

use crate::commands::photo_server;
use crate::commands::photo_tunnel;

#[derive(Serialize)]
pub struct QrUploadResult {
    pub qr_svg: String,
    pub url: String,
    pub token: String,
    pub via_tunnel: bool,
}

pub(crate) fn build_upload_url(
    public_base: Option<&str>,
    lan_host: &str,
    port: u16,
    token: &str,
    equipamento_id: i32,
    categoria: &str,
) -> String {
    if let Some(base) = public_base.filter(|value| !value.is_empty()) {
        format!(
            "{}/?token={}&eq={}&cat={}",
            base.trim_end_matches('/'),
            token,
            equipamento_id,
            categoria
        )
    } else {
        format!(
            "http://{}:{}/?token={}&eq={}&cat={}",
            lan_host, port, token, equipamento_id, categoria
        )
    }
}

/// Gera um QR code para upload de foto via dispositivo móvel.
///
/// Com túnel ativo o QR aponta para a URL pública (trycloudflare ou
/// fotos.bmitag.com.br). Sem túnel, permanece o endereço LAN.
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
    let public_base = photo_tunnel::active_public_base_url();
    let via_tunnel = public_base.is_some();
    let lan_host = photo_server::get_lan_ip().unwrap_or_else(|| "localhost".to_string());
    let url = build_upload_url(
        public_base.as_deref(),
        &lan_host,
        port,
        &token,
        equipamento_id,
        &categoria,
    );

    let qr_svg = render_qr_svg(&url)?;

    info!("QR code gerado para equipamento {} em {}", equipamento_id, url);

    Ok(QrUploadResult {
        qr_svg,
        url,
        token,
        via_tunnel,
    })
}

/// QR compacto o bastante para caber no diálogo sem estourar a tela.
const QR_SVG_PX: u32 = 220;

pub(crate) fn render_qr_svg(url: &str) -> Result<String, String> {
    let code = qrcode::QrCode::new(url.as_bytes())
        .map_err(|e| format!("Erro ao gerar QR code: {}", e))?;
    Ok(code
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(QR_SVG_PX, QR_SVG_PX)
        .max_dimensions(QR_SVG_PX, QR_SVG_PX)
        .build())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tunnel_url_uses_public_base() {
        assert_eq!(
            build_upload_url(
                Some("https://foo-bar.trycloudflare.com"),
                "192.168.0.10",
                8765,
                "tok",
                7,
                "ENTRADA"
            ),
            "https://foo-bar.trycloudflare.com/?token=tok&eq=7&cat=ENTRADA"
        );
        assert_eq!(
            build_upload_url(
                Some("https://fotos.bmitag.com.br/"),
                "192.168.0.10",
                8765,
                "tok",
                7,
                "ENTRADA"
            ),
            "https://fotos.bmitag.com.br/?token=tok&eq=7&cat=ENTRADA"
        );
    }

    #[test]
    fn lan_url_keeps_http_ip_and_port() {
        assert_eq!(
            build_upload_url(None, "192.168.0.10", 8765, "tok", 7, "SAIDA"),
            "http://192.168.0.10:8765/?token=tok&eq=7&cat=SAIDA"
        );
    }

    #[test]
    fn qr_svg_stays_within_dialog_size() {
        let url = "https://throwing-necklace-sets-guidelines.trycloudflare.com/?token=83ca637d-864f-47bb-a47f-320587ac4a38&eq=488&cat=SAIDA";
        let svg = render_qr_svg(url).expect("svg");
        let width = svg
            .split("width=\"")
            .nth(1)
            .and_then(|rest| rest.split('"').next())
            .and_then(|raw| raw.parse::<u32>().ok())
            .expect("svg width");
        let height = svg
            .split("height=\"")
            .nth(1)
            .and_then(|rest| rest.split('"').next())
            .and_then(|raw| raw.parse::<u32>().ok())
            .expect("svg height");
        assert!(
            (160..=220).contains(&width),
            "QR width should fit the dialog, got {width} from {}",
            &svg[..svg.len().min(180)]
        );
        assert!(
            (160..=220).contains(&height),
            "QR height should fit the dialog, got {height}"
        );
    }
}
