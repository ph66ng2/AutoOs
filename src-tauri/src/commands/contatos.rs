//! CRUD de contatos vinculados a clientes.
//!
//! Contatos são inativados, nunca removidos pelos comandos públicos. Todas as
//! operações recebem empresa_id e validam também o vínculo com o cliente para
//! evitar associações entre tenants.

use crate::commands::auth::record_security_event;
use crate::commands::clientes::{celular_nacional, pj_tem_contato_celular, MSG_PJ_CONTATO};
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

/// Só o diálogo "Quem recebe" pede isto: com portal, nome e e-mail ficam como estão.
pub(crate) fn identidade_contato_com_portal(
    preservar: bool,
    portal_acesso: &str,
    nome_atual: String,
    email_atual: Option<String>,
    nome_novo: String,
    email_novo: Option<String>,
) -> (String, Option<String>) {
    if preservar && portal_acesso != "NENHUM" {
        (nome_atual, email_atual)
    } else {
        (nome_novo, email_novo)
    }
}

fn telefone_contato_persistido(valor: Option<&str>) -> Option<String> {
    optional_text(valor).and_then(|texto| celular_nacional(&texto).or(Some(texto)))
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
    .map_err(super::operator_errors::mapear_erro_sql)?;

    if exists.is_none() {
        return Err("Cliente não encontrado na empresa informada.".to_string());
    }

    Ok(())
}

async fn tipo_e_telefones_ativos_exceto(
    pool: &PgPool,
    empresa_id: i32,
    cliente_id: i32,
    excluir_id: i32,
) -> Result<(String, Vec<String>), String> {
    let tipo: Option<String> = sqlx::query_scalar(
        "SELECT tipo_pessoa FROM clientes WHERE id = $1 AND empresa_id = $2",
    )
    .bind(cliente_id)
    .bind(empresa_id)
    .fetch_optional(pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    let tipo = tipo.ok_or_else(|| "Cliente não encontrado na empresa informada.".to_string())?;
    let telefones: Vec<String> = sqlx::query_scalar(
        "SELECT COALESCE(telefone, '') FROM cliente_contatos
         WHERE cliente_id = $1 AND empresa_id = $2 AND ativo = true AND id <> $3",
    )
    .bind(cliente_id)
    .bind(empresa_id)
    .bind(excluir_id)
    .fetch_all(pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    Ok((tipo, telefones))
}

fn recusar_se_pj_ficar_sem_celular(tipo_pessoa: &str, outros: &[String], telefone_deste: Option<&str>) -> Result<(), String> {
    if tipo_pessoa != "PJ" {
        return Ok(());
    }
    if pj_tem_contato_celular(outros) {
        return Ok(());
    }
    if telefone_deste.and_then(celular_nacional).is_some() {
        return Ok(());
    }
    Err(MSG_PJ_CONTATO.to_string())
}

/// Editar ou inativar não pode tirar o último celular de um PJ. PJ antigo que nunca teve
/// celular fica como está: mexer num contato fixo dele não perde nada e não é recusado.
fn recusar_se_pj_perder_ultimo_celular(
    tipo_pessoa: &str,
    outros: &[String],
    telefone_antes: Option<&str>,
    telefone_depois: Option<&str>,
) -> Result<(), String> {
    if telefone_antes.and_then(celular_nacional).is_none() {
        return Ok(());
    }
    recusar_se_pj_ficar_sem_celular(tipo_pessoa, outros, telefone_depois)
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
        .map_err(super::operator_errors::mapear_erro_sql)?
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
            super::operator_errors::mapear_erro_sql(error)
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
    let telefone = telefone_contato_persistido(input.telefone.as_deref());
    let (tipo_pessoa, outros) =
        tipo_e_telefones_ativos_exceto(&pool, empresa_id, cliente_id, 0).await?;
    recusar_se_pj_ficar_sem_celular(&tipo_pessoa, &outros, telefone.as_deref())?;

    let id: i32 = sqlx::query_scalar(
        "INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, email, telefone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id",
    )
    .bind(empresa_id)
    .bind(cliente_id)
    .bind(nome)
    .bind(optional_text(input.email.as_deref()))
    .bind(&telefone)
    .fetch_one(&pool)
    .await
    .map_err(|error| {
        error!("Erro ao criar contato do cliente {}: {}", cliente_id, error);
        super::operator_errors::mapear_erro_sql(error)
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
    let telefone = telefone_contato_persistido(input.telefone.as_deref());
    let atual = fetch_contact(&pool, id, empresa_id).await?;
    let (nome, email) = if input.preservar_identidade_portal {
        identidade_contato_com_portal(
            true,
            &atual.portal_acesso,
            atual.nome.clone(),
            atual.email.clone(),
            nome,
            email,
        )
    } else {
        (nome, email)
    };
    let (tipo_pessoa, outros) =
        tipo_e_telefones_ativos_exceto(&pool, empresa_id, cliente_id, id).await?;
    recusar_se_pj_perder_ultimo_celular(
        &tipo_pessoa,
        &outros,
        atual.telefone.as_deref(),
        telefone.as_deref(),
    )?;
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
        super::operator_errors::mapear_erro_sql(error)
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
    let atual = fetch_contact(&pool, id, empresa_id).await?;
    let (tipo_pessoa, outros) =
        tipo_e_telefones_ativos_exceto(&pool, empresa_id, atual.cliente_id, id).await?;
    recusar_se_pj_perder_ultimo_celular(&tipo_pessoa, &outros, atual.telefone.as_deref(), None)?;

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
        super::operator_errors::mapear_erro_sql(error)
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

    #[test]
    fn portal_contact_keeps_name_and_email_only_when_asked() {
        let (nome, email) = identidade_contato_com_portal(
            true,
            "DECIDIR",
            "Ana Portal".to_string(),
            Some("ana@portal.test".to_string()),
            "Nome Novo".to_string(),
            Some("novo@test".to_string()),
        );
        assert_eq!(nome, "Ana Portal");
        assert_eq!(email.as_deref(), Some("ana@portal.test"));
    }

    #[test]
    fn clients_edit_writes_name_and_email_even_with_portal() {
        let (nome, email) = identidade_contato_com_portal(
            false,
            "DECIDIR",
            "Ana Portal".to_string(),
            Some("ana@portal.test".to_string()),
            "Nome Novo".to_string(),
            Some("novo@test".to_string()),
        );
        assert_eq!(nome, "Nome Novo");
        assert_eq!(email.as_deref(), Some("novo@test"));
    }

    #[test]
    fn contact_without_portal_accepts_name_and_email() {
        let (nome, email) = identidade_contato_com_portal(
            true,
            "NENHUM",
            "Ana".to_string(),
            Some("ana@test".to_string()),
            "Nome Novo".to_string(),
            Some("novo@test".to_string()),
        );
        assert_eq!(nome, "Nome Novo");
        assert_eq!(email.as_deref(), Some("novo@test"));
    }

    #[test]
    fn criar_contato_grava_celular_nacional_sem_ddi() {
        assert_eq!(
            telefone_contato_persistido(Some("+55 71 98888-7777")).as_deref(),
            Some("71988887777")
        );
        assert_eq!(
            telefone_contato_persistido(Some("5571988887777")).as_deref(),
            Some("71988887777")
        );
        assert_eq!(telefone_contato_persistido(Some("  ")), None);
    }

    #[test]
    fn pj_nao_fica_sem_contato_com_celular() {
        let outros_vazios: Vec<String> = vec![];
        assert_eq!(
            recusar_se_pj_ficar_sem_celular("PJ", &outros_vazios, None).unwrap_err(),
            MSG_PJ_CONTATO
        );
        assert_eq!(
            recusar_se_pj_ficar_sem_celular("PJ", &outros_vazios, Some("7133334444")).unwrap_err(),
            MSG_PJ_CONTATO
        );
        assert!(recusar_se_pj_ficar_sem_celular("PJ", &outros_vazios, Some("+55 71 98888-7777")).is_ok());
        assert!(recusar_se_pj_ficar_sem_celular("PJ", &["71988880000".into()], None).is_ok());
        assert!(recusar_se_pj_ficar_sem_celular("PF", &outros_vazios, None).is_ok());
    }

    #[test]
    fn pj_antigo_sem_celular_edita_e_inativa_contato_fixo() {
        let outros_vazios: Vec<String> = vec![];
        let fixo = Some("7133334444");
        assert!(recusar_se_pj_perder_ultimo_celular("PJ", &outros_vazios, fixo, Some("7133335555")).is_ok());
        assert!(recusar_se_pj_perder_ultimo_celular("PJ", &outros_vazios, fixo, None).is_ok());
        assert!(recusar_se_pj_perder_ultimo_celular("PJ", &outros_vazios, None, None).is_ok());
        let celular = Some("71988887777");
        assert_eq!(
            recusar_se_pj_perder_ultimo_celular("PJ", &outros_vazios, celular, fixo).unwrap_err(),
            MSG_PJ_CONTATO
        );
        assert_eq!(
            recusar_se_pj_perder_ultimo_celular("PJ", &outros_vazios, celular, None).unwrap_err(),
            MSG_PJ_CONTATO
        );
        assert!(recusar_se_pj_perder_ultimo_celular("PJ", &["71977776666".into()], celular, None).is_ok());
    }

    #[test]
    fn criar_contato_usa_a_mesma_trava_de_pj_com_excluir_id_zero() {
        let outros_vazios: Vec<String> = vec![];
        assert!(recusar_se_pj_ficar_sem_celular("PJ", &outros_vazios, Some("7133334444")).is_err());
        assert!(recusar_se_pj_ficar_sem_celular("PJ", &outros_vazios, Some("71988887777")).is_ok());
    }
}
