use reqwest::{Client, StatusCode};
use serde_json::Value;
use std::time::Duration;
use tracing::{error, info, instrument, warn};

const BRASIL_API_CNPJ_URL: &str = "https://brasilapi.com.br/api/cnpj/v1";
const CNPJ_WS_CNPJ_URL: &str = "https://publica.cnpj.ws/cnpj";
const TIMEOUT_SECONDS: u64 = 8;

fn lookup_error(code: &str, message: impl AsRef<str>) -> String {
    format!("CNPJ_LOOKUP|{}|{}", code, message.as_ref())
}

fn map_status(status: StatusCode) -> String {
    match status {
        StatusCode::BAD_REQUEST => {
            lookup_error("invalid", "O CNPJ informado foi rejeitado pela consulta.")
        }
        StatusCode::NOT_FOUND => {
            lookup_error("not_found", "CNPJ não encontrado na base consultada.")
        }
        StatusCode::TOO_MANY_REQUESTS => lookup_error(
            "rate_limited",
            "O limite de consultas foi atingido. Tente novamente mais tarde.",
        ),
        StatusCode::REQUEST_TIMEOUT => {
            lookup_error("timeout", "A consulta demorou mais que o esperado.")
        }
        _ => lookup_error(
            "unavailable",
            format!(
                "O serviço de consulta está indisponível no momento (HTTP {}).",
                status.as_u16()
            ),
        ),
    }
}

fn lookup_error_detail(error: &str) -> &str {
    error
        .splitn(3, '|')
        .nth(2)
        .unwrap_or("falha sem detalhe do provedor")
}

fn should_try_fallback(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS
        || status == StatusCode::REQUEST_TIMEOUT
        || status.is_server_error()
}

async fn fallback_or_primary_error(
    client: &Client,
    digits: &str,
    primary_error: String,
) -> Result<Value, String> {
    match consultar_cnpj_ws(client, digits).await {
        Ok(payload) => {
            info!("Consulta de CNPJ concluída via fallback CNPJ.ws");
            Ok(payload)
        }
        Err(fallback_error) => {
            warn!(error = %fallback_error, "BrasilAPI e CNPJ.ws não concluíram a consulta");
            Err(lookup_error(
                "unavailable",
                format!(
                    "BrasilAPI: {}; CNPJ.ws: {}",
                    lookup_error_detail(&primary_error),
                    lookup_error_detail(&fallback_error),
                ),
            ))
        }
    }
}

async fn consultar_cnpj_ws(client: &Client, digits: &str) -> Result<Value, String> {
    let response = client
        .get(format!("{}/{}", CNPJ_WS_CNPJ_URL, digits))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                warn!(%error, "Fallback CNPJ.ws expirou");
                lookup_error(
                    "timeout",
                    "A consulta alternativa demorou mais que o esperado.",
                )
            } else {
                error!(%error, "Falha de rede no fallback CNPJ.ws");
                lookup_error(
                    "offline",
                    "Não foi possível conectar à consulta alternativa.",
                )
            }
        })?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        warn!(%status, body = %body.chars().take(300).collect::<String>(), "CNPJ.ws recusou consulta de CNPJ");
        return Err(map_status(status));
    }

    response.json::<Value>().await.map_err(|error| {
        error!(%error, "Resposta inválida do fallback CNPJ.ws");
        lookup_error(
            "unavailable",
            "A resposta da consulta alternativa não pôde ser interpretada.",
        )
    })
}

/// Consulta dados públicos de um CNPJ no processo nativo, fora das restrições CSP/CORS do WebView.
#[tauri::command]
#[instrument(skip_all, fields(cnpj_final = %cnpj.chars().rev().take(2).collect::<String>().chars().rev().collect::<String>()))]
pub async fn consultar_cnpj(cnpj: String) -> Result<Value, String> {
    let digits: String = cnpj.chars().filter(char::is_ascii_digit).collect();
    if digits.len() != 14 {
        return Err(lookup_error(
            "invalid",
            "Informe um CNPJ com 14 dígitos para consultar.",
        ));
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECONDS))
        .build()
        .map_err(|error| {
            error!(%error, "Não foi possível criar cliente HTTP para consulta de CNPJ");
            lookup_error(
                "unavailable",
                "Não foi possível preparar a consulta de CNPJ.",
            )
        })?;

    let response = match client
        .get(format!("{}/{}", BRASIL_API_CNPJ_URL, digits))
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            if error.is_timeout() {
                warn!(%error, "Consulta de CNPJ expirou");
                return fallback_or_primary_error(
                    &client,
                    &digits,
                    lookup_error("timeout", "A consulta demorou mais que o esperado."),
                )
                .await;
            } else {
                error!(%error, "Falha de rede ao consultar CNPJ");
                return fallback_or_primary_error(
                    &client,
                    &digits,
                    lookup_error("offline", "Não foi possível conectar à consulta."),
                )
                .await;
            }
        }
    };

    let status = response.status();
    if should_try_fallback(status) {
        warn!(%status, "BrasilAPI indisponível; tentando fallback CNPJ.ws");
        return fallback_or_primary_error(&client, &digits, map_status(status)).await;
    }

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        warn!(%status, body = %body.chars().take(300).collect::<String>(), "BrasilAPI recusou consulta de CNPJ");
        return Err(map_status(status));
    }

    let payload = response.json::<Value>().await.map_err(|error| {
        error!(%error, "Resposta inválida da BrasilAPI para CNPJ");
        lookup_error(
            "unavailable",
            "A resposta da consulta não pôde ser interpretada.",
        )
    })?;

    info!("Consulta de CNPJ concluída");
    Ok(payload)
}
