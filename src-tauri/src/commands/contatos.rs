//! CRUD de contatos vinculados a clientes.
//!
//! Contatos são inativados, nunca removidos pelos comandos públicos. Todas as
//! operações recebem empresa_id e validam também o vínculo com o cliente para
//! evitar associações entre tenants.

use crate::commands::auth::record_security_event;
use crate::commands::types::{CLIENTE_CONTATO_SELECT, ClienteContato, ClienteContatoInput};
use crate::db::get_pool;
use sqlx::PgPool;
use tracing::{debug, error, info, instrument};

fn required_positive_id(value: i32, field: &str) -> Result<i32, String> {
    if value <= 0 {
        return Err(format!("{} inválido", field));
    }
    Ok(value)
}

fn required_name(value: &str) -> Result<String, String> {
    let name = value.trim();
    if name.is_empty() {
        return Err("Nome do contato é obrigatório".to_string());
    }
    Ok(name.to_string())
}

fn optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

async fn ensure_cliente_belongs_to_empresa(
    pool: &PgPool,
    empresa_id: i32,
    cliente_id: i32,
) -> Result<(), String> {
    let exists: Option<i32> = sqlx::query_scalar(
        "SELECT id FROM clientes WHERE id = $1 AND empresa_id = $2 AND ativo = true",
    )
    .bind(cliente_id)
    .bind(empresa_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("Erro ao validar cliente do contato: {}", error))?;

    if exists.is_none() {
        return Err("Cliente não encontrado na empresa informada.".to_string());
    }

    Ok(())
}

async fn fetch_contact(pool: &PgPool, id: i32, empresa_id: i32) -> Result<ClienteContato, String> {
    let query = format!(
        "{} WHERE id = $1 AND empresa_id = $2",
        CLIENTE_CONTATO_SELECT
    );
    sqlx::query_as::<_, ClienteContato>(sqlx::AssertSqlSafe(query))
        .bind(id)
        .bind(empresa_id)
        .fetch_optional(pool)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Contato não encontrado na empresa informada.".to_string())
}

/// Lista apenas contatos ativos de um cliente dentro da empresa informada.
#[tauri::command]
#[instrument(skip_all, fields(empresa_id = empresa_id, cliente_id = cliente_id))]
pub async fn listar_cliente_contatos(
    cliente_id: i32,
    empresa_id: i32,
) -> Result<Vec<ClienteContato>, String> {
    let cliente_id = required_positive_id(cliente_id, "Cliente")?;
    let empresa_id = required_positive_id(empresa_id, "Empresa")?;
    let pool = get_pool().await.map_err(|error| error.to_string())?;

    let query = format!(
        "{} WHERE cliente_id = $1 AND empresa_id = $2 AND ativo = true ORDER BY nome ASC, id ASC",
        CLIENTE_CONTATO_SELECT
    );
    sqlx::query_as::<_, ClienteContato>(sqlx::AssertSqlSafe(query))
        .bind(cliente_id)
        .bind(empresa_id)
        .fetch_all(&pool)
        .await
        .map_err(|error| {
            error!(
                "Erro ao listar contatos do cliente {}: {}",
                cliente_id, error
            );
            error.to_string()
        })
}

/// Cria um contato sem inferir dados de cliente, empresa ou observações.
#[tauri::command]
#[instrument(skip_all, fields(empresa_id = input.empresa_id, cliente_id = input.cliente_id))]
pub async fn criar_cliente_contato(input: ClienteContatoInput) -> Result<ClienteContato, String> {
    let empresa_id = required_positive_id(input.empresa_id, "Empresa")?;
    let cliente_id = required_positive_id(input.cliente_id, "Cliente")?;
    let nome = required_name(&input.nome)?;
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    ensure_cliente_belongs_to_empresa(&pool, empresa_id, cliente_id).await?;

    let id: i32 = sqlx::query_scalar(
        "INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, email, telefone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id",
    )
    .bind(empresa_id)
    .bind(cliente_id)
    .bind(nome)
    .bind(optional_text(input.email.as_deref()))
    .bind(optional_text(input.telefone.as_deref()))
    .fetch_one(&pool)
    .await
    .map_err(|error| {
        error!("Erro ao criar contato do cliente {}: {}", cliente_id, error);
        error.to_string()
    })?;

    record_security_event(
        "CLIENT_CONTACT_CREATED",
        None,
        format!(
            "empresa_id={}; cliente_id={}; contato_id={}",
            empresa_id, cliente_id, id
        ),
        true,
    )
    .await;

    info!("Contato {} criado para o cliente {}", id, cliente_id);
    fetch_contact(&pool, id, empresa_id).await
}

/// Atualiza um contato ativo. Se informado, atualizado_em funciona como token
/// otimista de concorrência; contatos inativos não são reabertos por este método.
#[tauri::command]
#[instrument(skip_all, fields(id = id, empresa_id = input.empresa_id, cliente_id = input.cliente_id))]
pub async fn atualizar_cliente_contato(
    id: i32,
    input: ClienteContatoInput,
) -> Result<ClienteContato, String> {
    let id = required_positive_id(id, "Contato")?;
    let empresa_id = required_positive_id(input.empresa_id, "Empresa")?;
    let cliente_id = required_positive_id(input.cliente_id, "Cliente")?;
    let nome = required_name(&input.nome)?;
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    ensure_cliente_belongs_to_empresa(&pool, empresa_id, cliente_id).await?;

    let email = optional_text(input.email.as_deref());
    let telefone = optional_text(input.telefone.as_deref());
    let updated_rows = if let Some(token) = input
        .atualizado_em
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        sqlx::query(
            "UPDATE cliente_contatos
             SET cliente_id = $1, nome = $2, email = $3, telefone = $4, atualizado_em = NOW()
             WHERE id = $5 AND empresa_id = $6 AND ativo = true
               AND atualizado_em = $7::TIMESTAMPTZ",
        )
        .bind(cliente_id)
        .bind(&nome)
        .bind(&email)
        .bind(&telefone)
        .bind(id)
        .bind(empresa_id)
        .bind(token)
        .execute(&pool)
        .await
    } else {
        sqlx::query(
            "UPDATE cliente_contatos
             SET cliente_id = $1, nome = $2, email = $3, telefone = $4, atualizado_em = NOW()
             WHERE id = $5 AND empresa_id = $6 AND ativo = true",
        )
        .bind(cliente_id)
        .bind(&nome)
        .bind(&email)
        .bind(&telefone)
        .bind(id)
        .bind(empresa_id)
        .execute(&pool)
        .await
    }
    .map_err(|error| {
        error!("Erro ao atualizar contato {}: {}", id, error);
        error.to_string()
    })?
    .rows_affected();

    if updated_rows == 0 {
        return Err("Contato não encontrado, inativo ou alterado por outro operador.".to_string());
    }

    record_security_event(
        "CLIENT_CONTACT_UPDATED",
        None,
        format!(
            "empresa_id={}; cliente_id={}; contato_id={}",
            empresa_id, cliente_id, id
        ),
        true,
    )
    .await;

    fetch_contact(&pool, id, empresa_id).await
}

/// Inativa o contato preservando o registro e seus vínculos históricos.
#[tauri::command]
#[instrument(skip_all, fields(id = id, empresa_id = empresa_id))]
pub async fn inativar_cliente_contato(id: i32, empresa_id: i32) -> Result<ClienteContato, String> {
    let id = required_positive_id(id, "Contato")?;
    let empresa_id = required_positive_id(empresa_id, "Empresa")?;
    let pool = get_pool().await.map_err(|error| error.to_string())?;

    let updated_rows = sqlx::query(
        "UPDATE cliente_contatos
         SET ativo = false, atualizado_em = NOW()
         WHERE id = $1 AND empresa_id = $2 AND ativo = true",
    )
    .bind(id)
    .bind(empresa_id)
    .execute(&pool)
    .await
    .map_err(|error| {
        error!("Erro ao inativar contato {}: {}", id, error);
        error.to_string()
    })?
    .rows_affected();

    if updated_rows == 0 {
        return Err(
            "Contato não encontrado, já inativo ou pertencente a outra empresa.".to_string(),
        );
    }

    record_security_event(
        "CLIENT_CONTACT_DEACTIVATED",
        None,
        format!("empresa_id={}; contato_id={}", empresa_id, id),
        true,
    )
    .await;

    debug!("Contato {} inativado", id);
    fetch_contact(&pool, id, empresa_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contact_name_rejects_blank_values() {
        assert!(required_name("  ").is_err());
        assert_eq!(required_name("  Maria  ").unwrap(), "Maria");
    }

    #[test]
    fn optional_contact_fields_are_trimmed_without_inference() {
        assert_eq!(
            optional_text(Some("  maria@test.local ")),
            Some("maria@test.local".to_string())
        );
        assert_eq!(optional_text(Some("  ")), None);
    }

    #[test]
    fn ids_must_be_positive() {
        assert!(required_positive_id(0, "Empresa").is_err());
        assert_eq!(required_positive_id(7, "Empresa").unwrap(), 7);
    }
}
