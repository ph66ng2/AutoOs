//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/clientes.rs — CRUD de Clientes (PF/PJ)             ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  - listar_clientes: Lista com paginação                      ║
//! ║  - buscar_cliente: Busca por ID                              ║
//! ║  - criar_cliente: INSERT novo cliente                        ║
//! ║  - atualizar_cliente: UPDATE por ID                          ║
//! ║  - deletar_cliente: DELETE por ID                            ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::types::{ClienteInput, ClienteRow, CLIENTE_SELECT};
use crate::commands::auth::{require_permission, PERMISSION_DELETE_RECORDS};
use crate::db::get_pool;
use sqlx::Row;
use tracing::{debug, error, info, instrument};

use super::equipamentos::PAGE_SIZE;

fn optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
}

fn digits_only(value: Option<&str>) -> String {
    value
        .unwrap_or_default()
        .chars()
        .filter(|character| character.is_ascii_digit())
        .collect()
}

fn normalize_tipo_pessoa(tipo_pessoa: Option<&str>, documento: Option<&str>, cpf_cnpj: Option<&str>) -> Result<String, String> {
    if let Some(tipo) = tipo_pessoa.map(str::trim).filter(|value| !value.is_empty()) {
        let normalized = tipo.to_uppercase();
        if normalized == "PF" || normalized == "PJ" {
            return Ok(normalized);
        }

        return Err("Tipo de pessoa deve ser PF ou PJ".to_string());
    }

    let document = documento.or(cpf_cnpj).unwrap_or_default();
    let digits = document.chars().filter(|character| character.is_ascii_digit()).count();
    if digits == 14 {
        Ok("PJ".to_string())
    } else {
        Ok("PF".to_string())
    }
}

fn validate_cliente_identity(
    tipo_pessoa: &str,
    nome: Option<&str>,
    razao_social: Option<&str>,
    documento: Option<&str>,
    cpf_cnpj: Option<&str>,
) -> Result<(String, String), String> {
    let mut document_digits = digits_only(documento);
    if document_digits.is_empty() {
        document_digits = digits_only(cpf_cnpj);
    }
    if document_digits.len() != 11 && document_digits.len() != 14 {
        return Err("CPF ou CNPJ válido é obrigatório".to_string());
    }

    if tipo_pessoa == "PF" {
        let nome = optional_text(nome).ok_or_else(|| "Nome completo é obrigatório para Pessoa Física".to_string())?;
        if document_digits.len() != 11 {
            return Err("Pessoa Física deve informar um CPF válido".to_string());
        }

        return Ok((nome, document_digits));
    }

    let razao_social = optional_text(razao_social).ok_or_else(|| "Razão Social é obrigatória para Pessoa Jurídica".to_string())?;
    if document_digits.len() != 14 {
        return Err("Pessoa Jurídica deve informar um CNPJ válido".to_string());
    }

    Ok((razao_social, document_digits))
}

/// Listar clientes com paginação.
#[tauri::command]
#[instrument(skip_all, fields(page = page))]
pub async fn listar_clientes(page: Option<i32>, busca: Option<String>) -> Result<Vec<ClienteRow>, String> {
    debug!("Listando clientes");
    let pool = get_pool().await.map_err(|e| {
        error!("Erro ao obter pool: {}", e);
        e.to_string()
    })?;

    let offset = page.unwrap_or(0) * PAGE_SIZE;
    let mut query_builder = sqlx::QueryBuilder::<sqlx::Postgres>::new(format!(
        "{} WHERE ativo = true",
        CLIENTE_SELECT,
    ));

    if let Some(busca) = busca.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        let pattern = format!("%{}%", busca);
        query_builder.push(
            " AND (COALESCE(nome, '') ILIKE ",
        );
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR COALESCE(razao_social, '') ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR COALESCE(nome_fantasia, '') ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR COALESCE(documento, '') ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR COALESCE(cpf_cnpj, '') ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR COALESCE(telefone, '') ILIKE ");
        query_builder.push_bind(pattern.clone());
        query_builder.push(" OR COALESCE(email, '') ILIKE ");
        query_builder.push_bind(pattern);
        query_builder.push(")");
    }

    query_builder.push(format!(" ORDER BY id DESC LIMIT {} OFFSET {}", PAGE_SIZE, offset));

    let rows = query_builder
        .build_query_as::<ClienteRow>()
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao listar clientes: {}", e);
            e.to_string()
        })?;

    info!("Clientes listados: {} itens (página {})", rows.len(), page.unwrap_or(0));
    Ok(rows)
}

/// Buscar cliente por ID.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn buscar_cliente(id: i32) -> Result<ClienteRow, String> {
    debug!("Buscando cliente {}", id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let query = format!("{} WHERE id = $1", CLIENTE_SELECT);
    let row = sqlx::query_as::<_, ClienteRow>(&query)
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            error!("Cliente {} não encontrado: {}", id, e);
            e.to_string()
        })?;

    info!("Cliente {} encontrado", id);
    Ok(row)
}

/// Criar novo cliente (PF ou PJ).
#[tauri::command]
#[instrument(skip_all, fields(telefone = %input.telefone))]
pub async fn criar_cliente(input: ClienteInput) -> Result<ClienteRow, String> {
    debug!("Criando cliente: {}", input.telefone);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let tipo_pessoa = normalize_tipo_pessoa(
        input.tipo_pessoa.as_deref(),
        input.documento.as_deref(),
        input.cpf_cnpj.as_deref(),
    )?;
    let (nome_base, document_digits) = validate_cliente_identity(
        &tipo_pessoa,
        input.nome.as_deref(),
        input.razao_social.as_deref(),
        input.documento.as_deref(),
        input.cpf_cnpj.as_deref(),
    )?;
    let nome_exibicao = if tipo_pessoa == "PJ" {
        optional_text(input.nome_fantasia.as_deref()).unwrap_or_else(|| nome_base.clone())
    } else {
        nome_base.clone()
    };
    let razao_social = if tipo_pessoa == "PJ" {
        Some(nome_base.clone())
    } else {
        None
    };
    let uf = optional_text(input.uf.as_deref()).map(|value| value.to_uppercase());
    if let Some(uf) = uf.as_ref() {
        if uf.len() > 2 {
            return Err("UF deve ter no máximo 2 caracteres".to_string());
        }
    }

    let row = sqlx::query(
        r#"
        INSERT INTO clientes (
            nome, tipo_pessoa, documento, razao_social, nome_fantasia,
            inscricao_estadual, cpf_cnpj, telefone, telefone_secundario, email,
            cep, endereco, numero, complemento, bairro, cidade, uf,
            receber_email, receber_whatsapp, observacoes
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        ) RETURNING id
        "#,
    )
    .bind(Some(nome_exibicao))
    .bind(tipo_pessoa)
    .bind(Some(document_digits.clone()))
    .bind(razao_social)
    .bind(optional_text(input.nome_fantasia.as_deref()))
    .bind(optional_text(input.inscricao_estadual.as_deref()))
    .bind(Some(document_digits))
    .bind(input.telefone.trim())
    .bind(optional_text(input.telefone_secundario.as_deref()))
    .bind(optional_text(input.email.as_deref()))
    .bind(optional_text(input.cep.as_deref()))
    .bind(optional_text(input.endereco.as_deref()))
    .bind(optional_text(input.numero.as_deref()))
    .bind(optional_text(input.complemento.as_deref()))
    .bind(optional_text(input.bairro.as_deref()))
    .bind(optional_text(input.cidade.as_deref()))
    .bind(uf)
    .bind(input.receber_email)
    .bind(input.receber_whatsapp)
    .bind(optional_text(input.observacoes.as_deref()))
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao criar cliente: {}", e);
        e.to_string()
    })?;

    let id: i32 = row.get("id");
    info!("Cliente criado: id={}", id);
    buscar_cliente(id).await
}

/// Atualizar cliente por ID.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn atualizar_cliente(id: i32, input: ClienteInput) -> Result<ClienteRow, String> {
    debug!("Atualizando cliente {}", id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let tipo_pessoa = normalize_tipo_pessoa(
        input.tipo_pessoa.as_deref(),
        input.documento.as_deref(),
        input.cpf_cnpj.as_deref(),
    )?;
    let (nome_base, document_digits) = validate_cliente_identity(
        &tipo_pessoa,
        input.nome.as_deref(),
        input.razao_social.as_deref(),
        input.documento.as_deref(),
        input.cpf_cnpj.as_deref(),
    )?;
    let nome_exibicao = if tipo_pessoa == "PJ" {
        optional_text(input.nome_fantasia.as_deref()).unwrap_or_else(|| nome_base.clone())
    } else {
        nome_base.clone()
    };
    let razao_social = if tipo_pessoa == "PJ" {
        Some(nome_base.clone())
    } else {
        None
    };
    let uf = optional_text(input.uf.as_deref()).map(|value| value.to_uppercase());
    if let Some(uf) = uf.as_ref() {
        if uf.len() > 2 {
            return Err("UF deve ter no máximo 2 caracteres".to_string());
        }
    }

    sqlx::query(
        r#"
        UPDATE clientes SET
            nome = $1, tipo_pessoa = $2, documento = $3, razao_social = $4,
            nome_fantasia = $5, inscricao_estadual = $6, cpf_cnpj = $7,
            telefone = $8, telefone_secundario = $9, email = $10,
            cep = $11, endereco = $12, numero = $13, complemento = $14,
            bairro = $15, cidade = $16, uf = $17,
            receber_email = $18, receber_whatsapp = $19, observacoes = $20,
            atualizado_em = NOW()
        WHERE id = $21
        "#,
    )
    .bind(Some(nome_exibicao))
    .bind(tipo_pessoa)
    .bind(Some(document_digits.clone()))
    .bind(razao_social)
    .bind(optional_text(input.nome_fantasia.as_deref()))
    .bind(optional_text(input.inscricao_estadual.as_deref()))
    .bind(Some(document_digits))
    .bind(input.telefone.trim())
    .bind(optional_text(input.telefone_secundario.as_deref()))
    .bind(optional_text(input.email.as_deref()))
    .bind(optional_text(input.cep.as_deref()))
    .bind(optional_text(input.endereco.as_deref()))
    .bind(optional_text(input.numero.as_deref()))
    .bind(optional_text(input.complemento.as_deref()))
    .bind(optional_text(input.bairro.as_deref()))
    .bind(optional_text(input.cidade.as_deref()))
    .bind(uf)
    .bind(input.receber_email)
    .bind(input.receber_whatsapp)
    .bind(optional_text(input.observacoes.as_deref()))
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao atualizar cliente {}: {}", id, e);
        e.to_string()
    })?;

    info!("Cliente {} atualizado", id);
    buscar_cliente(id).await
}

/// Deletar cliente por ID (soft delete - marca como inativo).
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn deletar_cliente(id: i32) -> Result<bool, String> {
    require_permission(PERMISSION_DELETE_RECORDS)?;
    debug!("Deletando cliente {}", id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    // Soft delete: marca como inativo em vez de deletar
    let result = sqlx::query("UPDATE clientes SET ativo = false, atualizado_em = NOW() WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao deletar cliente {}: {}", id, e);
            e.to_string()
        })?;

    let deleted = result.rows_affected() > 0;
    if deleted {
        info!("Cliente {} marcado como inativo", id);
    } else {
        error!("Cliente {} não encontrado para deleção", id);
    }
    Ok(deleted)
}
