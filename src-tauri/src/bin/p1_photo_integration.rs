#![allow(dead_code)]

//! Teste de fotos para o cliente Windows (e CI).
//! Sobe o HTTP de fotos em loopback, sem túnel Cloudflare e sem banco:
//! o modo rascunho (`equipamento_id = 0`) não grava no PostgreSQL.
//!
//! O túnel `cloudflared` continua improvisado; este binário valida a página,
//! o JPEG da câmera/galeria e o limite de 3 fotos.

#[path = "../db.rs"]
mod db;
#[path = "../commands/mod.rs"]
mod commands;

use anyhow::{anyhow, bail, Context, Result};
use commands::photo_server;
use commands::photo_tunnel;
use commands::qr_code;
use image::codecs::jpeg::JpegEncoder;
use image::{ExtendedColorType, ImageEncoder, RgbImage};
use reqwest::multipart::{Form, Part};
use serde_json::Value;
use std::time::Duration;

const PHOTO_TEST_PORT: u16 = 18765;

fn tauri_result<T>(result: std::result::Result<T, String>, context: &str) -> Result<T> {
    result.map_err(|error| anyhow!("{}: {}", context, error))
}

fn tiny_jpeg() -> Result<Vec<u8>> {
    let img = RgbImage::from_pixel(16, 16, image::Rgb([38, 99, 217]));
    let mut buf = Vec::new();
    let encoder = JpegEncoder::new_with_quality(&mut buf, 80);
    encoder
        .write_image(img.as_raw(), img.width(), img.height(), ExtendedColorType::Rgb8)
        .map_err(|e| anyhow!("falha ao gerar JPEG de teste: {e}"))?;
    Ok(buf)
}

fn heic_stub() -> Vec<u8> {
    let mut data = vec![0u8; 16];
    data[4..8].copy_from_slice(b"ftyp");
    data[8..12].copy_from_slice(b"heic");
    data
}

fn jpeg_part(bytes: Vec<u8>, name: &str) -> Result<Part> {
    Part::bytes(bytes)
        .file_name(name.to_string())
        .mime_str("image/jpeg")
        .map_err(|e| anyhow!("part jpeg: {e}"))
}

#[tokio::main]
async fn main() -> Result<()> {
    println!("P1_PHOTO_OS={}", std::env::consts::OS);

    if cfg!(windows) {
        if photo_tunnel::cloudflared_binary_name() != "cloudflared.exe" {
            bail!("no Windows o binário do túnel tem de se chamar cloudflared.exe");
        }
        println!("P1_PHOTO_WINDOWS_CLOUDFLARED_NAME_OK");
    } else {
        println!("P1_PHOTO_WINDOWS_CLOUDFLARED_NAME_SKIP");
    }

    let html = commands::photo_server::HTML_UPLOAD_PAGE;
    if !html.contains(r#"id="pickerInput""#) || html.contains("capture=") {
        bail!("página de upload deve ter um seletor só, sem capture");
    }
    if !html.contains("var MAX_PHOTOS = 3") || !html.contains("AutoOS") {
        bail!("página de upload fora da identidade AutoOS / limite 3");
    }
    println!("P1_PHOTO_HTML_OK");

    let qr_url = "https://windows-foto-test.trycloudflare.com/?token=tok&eq=1&cat=SAIDA";
    let svg = qr_code::render_qr_svg(qr_url).map_err(anyhow::Error::msg)?;
    if !(svg.contains("width=\"") && svg.contains("height=\"")) {
        bail!("QR SVG sem dimensões");
    }
    println!("P1_PHOTO_QR_OK");

    let _ = photo_server::stop_photo_server().await;
    let bound = tauri_result(
        photo_server::start_photo_http_loopback(PHOTO_TEST_PORT).await,
        "start_photo_http_loopback",
    )?;
    tokio::time::sleep(Duration::from_millis(200)).await;
    let base = format!("http://127.0.0.1:{bound}");
    println!("P1_PHOTO_SERVER={base}");

    let run_result: Result<()> = async {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .context("reqwest client")?;

        let page = client
            .get(format!("{base}/?cat=SAIDA"))
            .send()
            .await
            .context("GET /")?
            .text()
            .await
            .context("GET / body")?;
        if !page.contains("Adicionar fotos") {
            bail!("GET / não devolveu a página AutoOS");
        }
        println!("P1_PHOTO_PAGE_GET_OK");

        let jpeg = tiny_jpeg()?;
        let token = tauri_result(
            photo_server::generate_upload_token(0, "ENTRADA".to_string()).await,
            "generate_upload_token",
        )?;

        let form = Form::new().part("photo[]", jpeg_part(jpeg.clone(), "cam.jpg")?);
        let uploaded: Value = client
            .post(format!("{base}/upload?token={token}"))
            .multipart(form)
            .send()
            .await
            .context("POST jpeg")?
            .json()
            .await
            .context("POST jpeg json")?;
        if uploaded["success"] != true {
            bail!("upload JPEG falhou: {uploaded}");
        }
        println!("P1_PHOTO_UPLOAD_DRAFT_OK");

        let status: Value = client
            .get(format!("{base}/status/{token}"))
            .send()
            .await
            .context("GET status")?
            .json()
            .await
            .context("GET status json")?;
        if status["used"] != true {
            bail!("token não ficou used depois do upload: {status}");
        }
        if status["count"] != 1 {
            bail!("status HTTP deveria ter count=1: {status}");
        }
        let ipc_status = tauri_result(
            photo_server::consultar_status_foto(token.clone()).await,
            "consultar_status_foto",
        )?;
        if !ipc_status.used || ipc_status.count != 1 {
            bail!("IPC status deveria marcar used com count=1");
        }
        println!("P1_PHOTO_STATUS_USED_OK");

        let token_heic = tauri_result(
            photo_server::generate_upload_token(0, "SAIDA".to_string()).await,
            "token heic",
        )?;
        let heic_part = Part::bytes(heic_stub())
            .file_name("cam.heic")
            .mime_str("image/heic")
            .map_err(|e| anyhow!("part heic: {e}"))?;
        let heic_resp: Value = client
            .post(format!("{base}/upload?token={token_heic}"))
            .multipart(Form::new().part("photo[]", heic_part))
            .send()
            .await
            .context("POST heic")?
            .json()
            .await
            .context("POST heic json")?;
        if heic_resp["success"] != false {
            bail!("HEIC deveria ser recusado: {heic_resp}");
        }
        println!("P1_PHOTO_REJECT_HEIC_OK");

        let token_many = tauri_result(
            photo_server::generate_upload_token(0, "ENTRADA".to_string()).await,
            "token many",
        )?;
        let mut many = Form::new();
        for i in 0..4 {
            many = many.part(
                "photo[]",
                jpeg_part(jpeg.clone(), &format!("foto{i}.jpg"))?,
            );
        }
        let many_resp: Value = client
            .post(format!("{base}/upload?token={token_many}"))
            .multipart(many)
            .send()
            .await
            .context("POST 4 fotos")?
            .json()
            .await
            .context("POST 4 fotos json")?;
        if many_resp["success"] != false {
            bail!("mais de 3 fotos deveria falhar: {many_resp}");
        }
        println!("P1_PHOTO_MAX3_OK");

        let token_three = tauri_result(
            photo_server::generate_upload_token(0, "SAIDA".to_string()).await,
            "token three",
        )?;
        let mut three = Form::new();
        for i in 0..3 {
            three = three.part(
                "photo[]",
                jpeg_part(jpeg.clone(), &format!("ok{i}.jpg"))?,
            );
        }
        let three_resp: Value = client
            .post(format!("{base}/upload?token={token_three}"))
            .multipart(three)
            .send()
            .await
            .context("POST 3 fotos")?
            .json()
            .await
            .context("POST 3 fotos json")?;
        if three_resp["success"] != true || three_resp["count"] != 3 {
            bail!("3 JPEGs deveriam passar: {three_resp}");
        }
        println!("P1_PHOTO_THREE_OK");
        Ok(())
    }
    .await;

    let _ = photo_server::stop_photo_server().await;
    run_result?;
    println!("P1_PHOTO_OK");
    Ok(())
}
