use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use tracing::{error, info};
use uuid::Uuid;

const KEYRING_SERVICE: &str = "autoos";
const KEYRING_USER: &str = "saas_auth_session_v1";

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaasIdentity {
    pub user_id: String,
    pub company_id: String,
    pub profile_id: String,
    pub email: String,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaasSession {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub identity: SaasIdentity,
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|error| {
        error!("Falha ao abrir o cofre da sessão SaaS: {}", error);
        "Não foi possível acessar o cofre seguro do sistema.".to_string()
    })
}

fn validate_uuid(value: &str, label: &str) -> Result<(), String> {
    Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| format!("{} inválido na sessão SaaS.", label))
}

fn validate_session(session: &SaasSession) -> Result<(), String> {
    if session.access_token.trim().is_empty() || session.refresh_token.trim().is_empty() {
        return Err("Tokens ausentes na sessão SaaS.".to_string());
    }
    if session.expires_at <= 0 {
        return Err("Expiração inválida na sessão SaaS.".to_string());
    }
    validate_uuid(&session.identity.user_id, "UUID do usuário")?;
    validate_uuid(&session.identity.company_id, "UUID da empresa")?;
    validate_uuid(&session.identity.profile_id, "UUID do perfil")?;
    let email = session.identity.email.trim();
    if email.is_empty() || !email.contains('@') || email.contains(char::is_whitespace) {
        return Err("Email inválido na sessão SaaS.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn salvar_sessao_saas(session: SaasSession) -> Result<(), String> {
    validate_session(&session)?;
    let serialized = serde_json::to_string(&session).map_err(|error| {
        error!("Falha ao serializar sessão SaaS: {}", error);
        "Não foi possível preparar a sessão segura.".to_string()
    })?;
    keyring_entry()?
        .set_password(&serialized)
        .map_err(|error| {
            error!("Falha ao salvar sessão SaaS no cofre: {}", error);
            "Não foi possível salvar a sessão no cofre seguro.".to_string()
        })?;
    info!("Sessão SaaS atualizada no cofre seguro");
    Ok(())
}

#[tauri::command]
pub async fn carregar_sessao_saas() -> Result<Option<SaasSession>, String> {
    let serialized = match keyring_entry()?.get_password() {
        Ok(value) => value,
        Err(KeyringError::NoEntry) => return Ok(None),
        Err(error) => {
            error!("Falha ao carregar sessão SaaS do cofre: {}", error);
            return Err("Não foi possível carregar a sessão do cofre seguro.".to_string());
        }
    };
    let session: SaasSession = serde_json::from_str(&serialized).map_err(|error| {
        error!("Sessão SaaS inválida no cofre: {}", error);
        "A sessão protegida está inválida.".to_string()
    })?;
    validate_session(&session)?;
    Ok(Some(session))
}

#[tauri::command]
pub async fn remover_sessao_saas() -> Result<(), String> {
    match keyring_entry()?.delete_password() {
        Ok(()) | Err(KeyringError::NoEntry) => {
            info!("Sessão SaaS removida do cofre seguro");
            Ok(())
        }
        Err(error) => {
            error!("Falha ao remover sessão SaaS do cofre: {}", error);
            Err("Não foi possível remover a sessão do cofre seguro.".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{validate_session, SaasIdentity, SaasSession};

    fn valid_session() -> SaasSession {
        SaasSession {
            access_token: "access".into(),
            refresh_token: "refresh".into(),
            expires_at: 1_900_000_000,
            identity: SaasIdentity {
                user_id: "a0000000-0000-4000-8000-000000000001".into(),
                company_id: "b0000000-0000-4000-8000-000000000001".into(),
                profile_id: "c0000000-0000-4000-8000-000000000001".into(),
                email: "admin@example.com".into(),
            },
        }
    }

    #[test]
    fn accepts_only_the_sanitized_session_contract() {
        assert!(validate_session(&valid_session()).is_ok());
    }

    #[test]
    fn rejects_missing_tokens_and_invalid_identifiers() {
        let mut session = valid_session();
        session.refresh_token.clear();
        assert!(validate_session(&session).is_err());

        let mut session = valid_session();
        session.identity.company_id = "not-a-uuid".into();
        assert!(validate_session(&session).is_err());
    }
}
