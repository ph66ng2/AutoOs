//! Keyring em memória compartilhado, exclusivo para binários de integração.
//!
//! O runner Linux do CI não possui um serviço gráfico `org.freedesktop.secrets`.
//! Este backend mantém o mesmo contrato de leitura/escrita durante o processo de
//! teste sem alterar o keyring utilizado pelo aplicativo em produção.

use keyring::credential::{CredentialApi, CredentialBuilderApi, CredentialPersistence};
use keyring::{Credential, Error, Result};
use std::any::Any;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

type CredentialKey = (Option<String>, String, String);
type CredentialStore = Arc<Mutex<HashMap<CredentialKey, String>>>;

#[derive(Debug)]
struct MemoryCredentialBuilder {
    store: CredentialStore,
}

#[derive(Debug)]
struct MemoryCredential {
    key: CredentialKey,
    store: CredentialStore,
}

impl CredentialApi for MemoryCredential {
    fn set_password(&self, password: &str) -> Result<()> {
        self.store
            .lock()
            .map_err(|_| Error::Invalid("memory_keyring".into(), "store poisoned".into()))?
            .insert(self.key.clone(), password.to_string());
        Ok(())
    }

    fn get_password(&self) -> Result<String> {
        self.store
            .lock()
            .map_err(|_| Error::Invalid("memory_keyring".into(), "store poisoned".into()))?
            .get(&self.key)
            .cloned()
            .ok_or(Error::NoEntry)
    }

    fn delete_password(&self) -> Result<()> {
        let removed = self
            .store
            .lock()
            .map_err(|_| Error::Invalid("memory_keyring".into(), "store poisoned".into()))?
            .remove(&self.key);
        removed.map(|_| ()).ok_or(Error::NoEntry)
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

impl CredentialBuilderApi for MemoryCredentialBuilder {
    fn build(&self, target: Option<&str>, service: &str, user: &str) -> Result<Box<Credential>> {
        Ok(Box::new(MemoryCredential {
            key: (
                target.map(str::to_string),
                service.to_string(),
                user.to_string(),
            ),
            store: Arc::clone(&self.store),
        }))
    }

    fn as_any(&self) -> &dyn Any {
        self
    }

    fn persistence(&self) -> CredentialPersistence {
        CredentialPersistence::ProcessOnly
    }
}

pub fn install() {
    keyring::set_default_credential_builder(Box::new(MemoryCredentialBuilder {
        store: Arc::new(Mutex::new(HashMap::new())),
    }));
}
