use crate::commands::saas_auth;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use reqwest::{Client, Url};
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;
use tracing::{error, warn};

#[derive(Debug, Deserialize)]
struct AccessTokenClaims {
    iss: String,
}

#[derive(Debug, Deserialize)]
struct OperationalProfile {
    profile_id: String,
    empresa_id: String,
    nome: String,
    role: String,
    permissions: Value,
}

fn normalize_supabase_url(value: &str) -> Result<String, String> {
    let parsed =
        Url::parse(value.trim()).map_err(|_| "A configuração Online é inválida.".to_string())?;
    if parsed.scheme() != "https"
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || !matches!(parsed.path(), "" | "/")
    {
        return Err("A configuração Online precisa usar um endereço HTTPS válido.".to_string());
    }
    Ok(value.trim().trim_end_matches('/').to_string())
}

fn token_issuer(access_token: &str) -> Result<String, String> {
    let payload = access_token
        .split('.')
        .nth(1)
        .ok_or_else(|| "A sessão Online não é válida. Entre novamente.".to_string())?;
    let bytes = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| "A sessão Online não é válida. Entre novamente.".to_string())?;
    let claims: AccessTokenClaims = serde_json::from_slice(&bytes)
        .map_err(|_| "A sessão Online não é válida. Entre novamente.".to_string())?;
    Ok(claims.iss.trim_end_matches('/').to_string())
}

fn validate_publishable_key(value: &str) -> Result<(), String> {
    let key = value.trim();
    let normalized = key.to_ascii_lowercase();
    if key.is_empty()
        || normalized.contains("service_role")
        || normalized.contains("service-role")
        || normalized.contains("secret")
    {
        return Err(
            "A configuração Online contém uma credencial administrativa inválida.".to_string(),
        );
    }
    if let Some(payload) = key.split('.').nth(1) {
        if let Ok(bytes) = URL_SAFE_NO_PAD.decode(payload) {
            if serde_json::from_slice::<Value>(&bytes)
                .ok()
                .and_then(|claims| {
                    claims
                        .get("role")
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                })
                .is_some_and(|role| role.eq_ignore_ascii_case("service_role"))
            {
                return Err(
                    "A configuração Online contém uma credencial administrativa inválida."
                        .to_string(),
                );
            }
        }
    }
    Ok(())
}

/// Validates the stored SaaS session with Supabase and checks its current
/// operational profile before allowing a customer communication to be sent.
/// The database remains the authority for tenant, identity and permissions.
pub async fn authorize_communication(
    supabase_url: &str,
    publishable_key: &str,
    required_permission: &str,
) -> Result<String, String> {
    let supabase_url = normalize_supabase_url(supabase_url)?;
    let key = publishable_key.trim();
    validate_publishable_key(key)?;

    let session = saas_auth::carregar_sessao_saas()
        .await?
        .ok_or_else(|| "Sua sessão SaaS expirou. Entre novamente para continuar.".to_string())?;
    let expected_issuer = format!("{}/auth/v1", supabase_url);
    if token_issuer(&session.access_token)? != expected_issuer {
        return Err("A sessão SaaS não corresponde à configuração Online atual.".to_string());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|_| "Não foi possível iniciar a validação da sessão SaaS.".to_string())?;
    let response = client
        .post(format!(
            "{}/rest/v1/rpc/get_current_saas_operational_profile",
            supabase_url
        ))
        .header("apikey", key)
        .bearer_auth(&session.access_token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|error| {
            error!("Falha ao validar perfil SaaS antes do envio: {}", error);
            "Não foi possível validar a sessão SaaS. Tente novamente.".to_string()
        })?;

    if !response.status().is_success() {
        warn!(
            "Validação de perfil SaaS recusada antes de envio (status={})",
            response.status()
        );
        return Err("Sua sessão expirou ou não tem acesso para enviar comunicações.".to_string());
    }

    let profiles: Vec<OperationalProfile> = response.json().await.map_err(|_| {
        "O serviço Online retornou uma resposta inválida ao validar seu acesso.".to_string()
    })?;
    let profile = profiles.into_iter().find(|profile| {
        profile
            .profile_id
            .eq_ignore_ascii_case(&session.identity.profile_id)
            && profile
                .empresa_id
                .eq_ignore_ascii_case(&session.identity.company_id)
    });
    let Some(profile) = profile else {
        return Err("O perfil operacional SaaS não está mais ativo para esta empresa.".to_string());
    };
    let has_permission = profile.role.eq_ignore_ascii_case("ADMIN")
        || profile.permissions.as_array().is_some_and(|permissions| {
            permissions
                .iter()
                .any(|permission| permission.as_str() == Some(required_permission))
        });
    if !has_permission {
        return Err("O perfil não tem permissão para usar este canal de comunicação.".to_string());
    }

    Ok(profile.nome)
}
