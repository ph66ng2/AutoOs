//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/clientes.rs — CRUD de Clientes (PF/PJ)             ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  - listar_clientes: Lista com paginação                      ║
//! ║  - buscar_cliente: Busca por ID                              ║
//! ║  - criar_cliente: INSERT novo cliente                        ║
//! ║  - atualizar_cliente: UPDATE por ID                          ║
//! ║  - deletar_cliente: DELETE por ID                            ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::types::{
    ClienteInput, ClienteRow, ContatoInicialInput, PaginatedResult, CLIENTE_SELECT,
};
use crate::commands::auth::{
    record_security_event, require_active_session_company_id, require_permission,
    PERMISSION_DELETE_RECORDS,
};
use crate::db::get_pool;
use sqlx::{PgPool, Postgres, QueryBuilder, Row};
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

const MSG_CONTATO_OBRIGATORIO: &str =
    "Informe um contato com nome e celular com DDD e o 9 (11 dígitos) para receber orçamentos.";

pub(crate) const MSG_PJ_CONTATO: &str =
    "Cliente PJ precisa manter um contato com celular (DDD e o 9) para receber orçamentos.";

/// DDI 55 + DDD + número vira o nacional. Celular válido: 11 dígitos, DDD 11–99 e o 9 após o DDD.
pub(crate) fn celular_nacional(valor: &str) -> Option<String> {
    let mut digitos = digits_only(Some(valor));
    if (digitos.len() == 12 || digitos.len() == 13) && digitos.starts_with("55") {
        digitos = digitos[2..].to_string();
    }
    if digitos.len() == 11
        && digitos[..2].parse::<u8>().is_ok_and(|ddd| (11..=99).contains(&ddd))
        && digitos.as_bytes()[2] == b'9'
    {
        Some(digitos)
    } else {
        None
    }
}

/// Celular brasileiro: 11 dígitos, DDD entre 11 e 99 e o 9 logo após o DDD. Aceita prefixo +55.
fn celular_valido(valor: &str) -> bool {
    celular_nacional(valor).is_some()
}

pub(crate) fn pj_tem_contato_celular(telefones: &[String]) -> bool {
    telefones.iter().any(|telefone| celular_nacional(telefone).is_some())
}

/// Valida o contato inicial de cliente novo. Devolve (nome, telefone só com dígitos, e-mail).
fn validar_contato_inicial(
    contato: Option<&ContatoInicialInput>,
) -> Result<(String, String, Option<String>), String> {
    let contato = contato.ok_or_else(|| MSG_CONTATO_OBRIGATORIO.to_string())?;
    let nome = contato.nome.trim();
    let Some(telefone) = celular_nacional(&contato.telefone) else {
        return Err(MSG_CONTATO_OBRIGATORIO.to_string());
    };
    if nome.is_empty() {
        return Err(MSG_CONTATO_OBRIGATORIO.to_string());
    }
    Ok((
        nome.to_string(),
        telefone,
        optional_text(contato.email.as_deref()),
    ))
}

async fn telefones_contatos_ativos(
    executor: impl sqlx::Executor<'_, Database = sqlx::Postgres>,
    empresa_id: i32,
    cliente_id: i32,
) -> Result<Vec<String>, String> {
    sqlx::query_scalar(
        "SELECT COALESCE(telefone, '') FROM cliente_contatos
         WHERE cliente_id = $1 AND empresa_id = $2 AND ativo = true",
    )
    .bind(cliente_id)
    .bind(empresa_id)
    .fetch_all(executor)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)
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

fn required_concurrency_token(token: Option<&str>, entity_label: &str) -> Result<String, String> {
    token
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .ok_or_else(|| format!("Token de concorrência de {} é obrigatório para atualizar o cadastro.", entity_label))
}

fn concurrency_conflict_message(entity_label: &str) -> String {
    format!(
        "Conflito de concorrência: {} foi alterado por outro técnico. Recarregue os dados antes de salvar novamente.",
        entity_label
    )
}

async fn duplicate_client_document_message(
    error: &sqlx::Error,
    pool: &PgPool,
    empresa_id: i32,
    document_digits: &str,
    current_id: Option<i32>,
) -> Option<String> {
    let database_error = error.as_database_error()?;
    if database_error.code().as_deref() != Some("23505") {
        return None;
    }

    if !matches!(
        database_error.constraint()?,
        "ux_clientes_documento_ativo"
            | "ux_clientes_cpf_cnpj_ativo"
            | "clientes_documento_key"
            | "clientes_cpf_cnpj_key"
    ) {
        return None;
    }

    let owner = sqlx::query_scalar::<_, bool>(
        "SELECT COALESCE(ativo, false) FROM clientes
         WHERE empresa_id = $1 AND (documento = $2 OR cpf_cnpj = $2)
           AND ($3::INTEGER IS NULL OR id <> $3)
         ORDER BY ativo DESC NULLS LAST LIMIT 1",
    )
    .bind(empresa_id)
    .bind(document_digits)
    .bind(current_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    Some(match owner {
        Some(true) => "Este CPF/CNPJ já está cadastrado em um cliente ativo. Pesquise pelo documento para localizar o registro.",
        Some(false) => "Este CPF/CNPJ já está cadastrado em um cliente inativo. Peça a um administrador para localizar ou reativar o cadastro.",
        None => "Este CPF/CNPJ já está cadastrado, mas o registro não está disponível nesta empresa. Peça a um administrador para verificar o cadastro.",
    }.to_string())
}

fn document_search_digits(busca: &str) -> Option<String> {
    let is_document_search = busca.chars().all(|character| {
        character.is_ascii_digit() || character.is_ascii_whitespace() || matches!(character, '.' | '-' | '/')
    });
    let digits = digits_only(Some(busca));
    (is_document_search && digits.len() >= 3).then_some(digits)
}

fn add_client_filters(query: &mut QueryBuilder<Postgres>, empresa_id: i32, busca: Option<&str>) {
    query.push(" WHERE ativo = true AND empresa_id = ").push_bind(empresa_id);

    if let Some(busca) = busca.map(str::trim).filter(|value| !value.is_empty()) {
        let pattern = format!("%{}%", busca);
        query.push(" AND (");
        for (index, column) in [
            "COALESCE(nome, '')",
            "COALESCE(razao_social, '')",
            "COALESCE(nome_fantasia, '')",
            "COALESCE(documento, '')",
            "COALESCE(cpf_cnpj, '')",
            "COALESCE(telefone, '')",
            "COALESCE(email, '')",
        ]
        .iter()
        .enumerate()
        {
            if index > 0 {
                query.push(" OR ");
            }
            query.push(*column).push(" ILIKE ").push_bind(pattern.clone());
        }

        if let Some(document_digits) = document_search_digits(busca) {
            let document_pattern = format!("%{}%", document_digits);
            query
                .push(" OR REGEXP_REPLACE(COALESCE(documento, ''), '[^0-9]', '', 'g') ILIKE ")
                .push_bind(document_pattern.clone())
                .push(" OR REGEXP_REPLACE(COALESCE(cpf_cnpj, ''), '[^0-9]', '', 'g') ILIKE ")
                .push_bind(document_pattern);
        }

        query.push(")");
    }
}

async fn query_client_page(
    pool: &PgPool,
    empresa_id: i32,
    page: Option<i32>,
    busca: Option<&str>,
    page_size: i32,
) -> Result<PaginatedResult<ClienteRow>, String> {
    let mut count_query = QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM clientes");
    add_client_filters(&mut count_query, empresa_id, busca);
    let total = count_query
        .build_query_scalar::<i64>()
        .fetch_one(pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;

    let safe_page = page.unwrap_or(0).max(0) as i64;
    let page_limit = i64::from(page_size);
    let mut items_query = QueryBuilder::<Postgres>::new(CLIENTE_SELECT);
    add_client_filters(&mut items_query, empresa_id, busca);
    items_query
        .push(" ORDER BY id DESC LIMIT ")
        .push_bind(page_limit)
        .push(" OFFSET ")
        .push_bind(safe_page * page_limit);

    let items = items_query
        .build_query_as::<ClienteRow>()
        .fetch_all(pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;

    Ok(PaginatedResult {
        items,
        total,
        below_minimum: None,
    })
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
    let empresa_id = require_active_session_company_id(&pool).await?;

    let safe_page = i64::from(page.unwrap_or(0).max(0));
    let page_limit = i64::from(PAGE_SIZE);
    let offset = safe_page * page_limit;
    let mut query_builder = sqlx::QueryBuilder::<sqlx::Postgres>::new(format!(
        "{} WHERE ativo = true AND empresa_id = ",
        CLIENTE_SELECT,
    ));
    query_builder.push_bind(empresa_id);

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

        if let Some(document_digits) = document_search_digits(busca) {
            let document_pattern = format!("%{}%", document_digits);
            query_builder
                .push(" OR REGEXP_REPLACE(COALESCE(documento, ''), '[^0-9]', '', 'g') ILIKE ")
                .push_bind(document_pattern.clone())
                .push(" OR REGEXP_REPLACE(COALESCE(cpf_cnpj, ''), '[^0-9]', '', 'g') ILIKE ")
                .push_bind(document_pattern);
        }

        query_builder.push(")");
    }

    query_builder.push(" ORDER BY id DESC LIMIT ");
    query_builder.push_bind(page_limit);
    query_builder.push(" OFFSET ");
    query_builder.push_bind(offset);

    let rows = query_builder
        .build_query_as::<ClienteRow>()
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao listar clientes: {}", e);
            super::operator_errors::mapear_erro_sql(e)
        })?;

    info!("Clientes listados: {} itens (página {})", rows.len(), page.unwrap_or(0));
    Ok(rows)
}

/// Lista uma página de clientes e informa o total após aplicar a busca.
#[tauri::command]
#[instrument(skip_all, fields(page = page))]
pub async fn listar_clientes_paginados(
    page: Option<i32>,
    busca: Option<String>,
) -> Result<PaginatedResult<ClienteRow>, String> {
    let pool = get_pool().await.map_err(|error| error.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    query_client_page(
        &pool,
        empresa_id,
        page,
        busca.as_deref(),
        super::equipamentos::UI_PAGE_SIZE,
    )
    .await
}

/// Buscar cliente por ID.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn buscar_cliente(id: i32) -> Result<ClienteRow, String> {
    debug!("Buscando cliente {}", id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;

    let query = format!("{} WHERE id = $1 AND empresa_id = $2", CLIENTE_SELECT);
    let row = sqlx::query_as::<_, ClienteRow>(sqlx::AssertSqlSafe(&*query))
        .bind(id)
        .bind(empresa_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            error!("Cliente {} não encontrado: {}", id, e);
            super::operator_errors::mapear_erro_sql(e)
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
    let empresa_id = require_active_session_company_id(&pool).await?;
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

    let contato = if tipo_pessoa == "PJ" {
        Some(validar_contato_inicial(input.contato_inicial.as_ref())?)
    } else {
        let telefone = digits_only(Some(input.telefone.as_str()));
        if (10..=11).contains(&telefone.len()) {
            Some((
                nome_base.clone(),
                telefone,
                optional_text(input.email.as_deref()),
            ))
        } else {
            None
        }
    };

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let row = sqlx::query(
        r#"
        INSERT INTO clientes (
            empresa_id, nome, tipo_pessoa, documento, razao_social, nome_fantasia,
            inscricao_estadual, cpf_cnpj, telefone, telefone_secundario, email,
            cep, endereco, numero, complemento, bairro, cidade, uf,
            receber_email, receber_whatsapp, observacoes, exige_ordem_compra
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        ) RETURNING id
        "#,
    )
    .bind(empresa_id)
    .bind(Some(nome_exibicao))
    .bind(tipo_pessoa)
    .bind(Some(document_digits.clone()))
    .bind(razao_social)
    .bind(optional_text(input.nome_fantasia.as_deref()))
    .bind(optional_text(input.inscricao_estadual.as_deref()))
    .bind(Some(document_digits.clone()))
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
    .bind(input.receber_email.unwrap_or(true))
    .bind(input.receber_whatsapp.unwrap_or(true))
    .bind(optional_text(input.observacoes.as_deref()))
    .bind(input.exige_ordem_compra.unwrap_or(false))
    .fetch_one(&mut *tx)
    .await;
    let row = match row {
        Ok(row) => row,
        Err(e) => {
            error!("Erro ao criar cliente: {}", e);
            let _ = tx.rollback().await;
            return Err(duplicate_client_document_message(&e, &pool, empresa_id, &document_digits, None)
                .await
                .unwrap_or_else(|| super::operator_errors::erro_sql_para_operador(&e)));
        }
    };

    let id: i32 = row.get("id");
    if let Some((nome, telefone, email)) = contato {
        let inserido = sqlx::query(
            "INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, email, telefone)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(empresa_id)
        .bind(id)
        .bind(nome)
        .bind(email)
        .bind(telefone)
        .execute(&mut *tx)
        .await;
        if let Err(e) = inserido {
            error!("Erro ao criar contato inicial do cliente {}: {}", id, e);
            let _ = tx.rollback().await;
            return Err(super::operator_errors::erro_sql_para_operador(&e));
        }
    }
    tx.commit().await.map_err(|e| e.to_string())?;

    info!("Cliente criado: id={}", id);
    buscar_cliente(id).await
}

/// Atualizar cliente por ID.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn atualizar_cliente(id: i32, input: ClienteInput) -> Result<ClienteRow, String> {
    debug!("Atualizando cliente {}", id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let concurrency_token = required_concurrency_token(input.atualizado_em.as_deref(), "cliente")?;
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

    let contato_pj = if tipo_pessoa == "PJ" {
        let existentes = telefones_contatos_ativos(&pool, empresa_id, id).await?;
        if pj_tem_contato_celular(&existentes) {
            None
        } else {
            Some(validar_contato_inicial(input.contato_inicial.as_ref())?)
        }
    } else {
        None
    };

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let updated_rows = sqlx::query(
        r#"
        UPDATE clientes SET
            nome = $1, tipo_pessoa = $2, documento = $3, razao_social = $4,
            nome_fantasia = $5, inscricao_estadual = $6, cpf_cnpj = $7,
            telefone = $8, telefone_secundario = $9, email = $10,
            cep = $11, endereco = $12, numero = $13, complemento = $14,
            bairro = $15, cidade = $16, uf = $17,
            receber_email = COALESCE($18, receber_email),
            receber_whatsapp = COALESCE($19, receber_whatsapp),
            observacoes = $20,
            exige_ordem_compra = COALESCE($24, exige_ordem_compra),
            atualizado_em = NOW()
        WHERE id = $21 AND atualizado_em = $22::TIMESTAMPTZ
          AND empresa_id = $23
        "#,
    )
    .bind(Some(nome_exibicao))
    .bind(&tipo_pessoa)
    .bind(Some(document_digits.clone()))
    .bind(razao_social)
    .bind(optional_text(input.nome_fantasia.as_deref()))
    .bind(optional_text(input.inscricao_estadual.as_deref()))
    .bind(Some(document_digits.clone()))
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
    .bind(concurrency_token)
    .bind(empresa_id)
    .bind(input.exige_ordem_compra)
    .execute(&mut *tx)
    .await;
    let updated_rows = match updated_rows {
        Ok(result) => result.rows_affected(),
        Err(e) => {
            error!("Erro ao atualizar cliente {}: {}", id, e);
            let _ = tx.rollback().await;
            return Err(duplicate_client_document_message(&e, &pool, empresa_id, &document_digits, Some(id))
                .await
                .unwrap_or_else(|| super::operator_errors::erro_sql_para_operador(&e)));
        }
    };

    if updated_rows == 0 {
        let _ = tx.rollback().await;
        return Err(concurrency_conflict_message("o cliente"));
    }

    if let Some((nome, telefone, email)) = contato_pj {
        let inserido = sqlx::query(
            "INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, email, telefone)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(empresa_id)
        .bind(id)
        .bind(nome)
        .bind(email)
        .bind(telefone)
        .execute(&mut *tx)
        .await;
        if let Err(e) = inserido {
            error!("Erro ao criar contato do cliente {}: {}", id, e);
            let _ = tx.rollback().await;
            return Err(super::operator_errors::erro_sql_para_operador(&e));
        }
    }
    tx.commit().await.map_err(|e| e.to_string())?;

    info!("Cliente {} atualizado", id);
    buscar_cliente(id).await
}

/// Deletar cliente por ID (soft delete - marca como inativo).
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn deletar_cliente(id: i32) -> Result<bool, String> {
    let actor = require_permission(PERMISSION_DELETE_RECORDS)?;
    debug!("Deletando cliente {}", id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;

    // Soft delete: marca como inativo em vez de deletar
    let result = sqlx::query("UPDATE clientes SET ativo = false, atualizado_em = NOW() WHERE id = $1 AND empresa_id = $2")
        .bind(id)
        .bind(empresa_id)
        .execute(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao deletar cliente {}: {}", id, e);
            super::operator_errors::mapear_erro_sql(e)
        })?;

    let deleted = result.rows_affected() > 0;
    record_security_event(
        "CLIENT_DELETED",
        Some(&actor),
        format!("cliente_id={}; deleted={}", id, deleted),
        deleted,
    )
    .await;
    if deleted {
        info!("Cliente {} marcado como inativo", id);
    } else {
        error!("Cliente {} não encontrado para deleção", id);
    }
    Ok(deleted)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contato(nome: &str, telefone: &str) -> ContatoInicialInput {
        ContatoInicialInput {
            nome: nome.to_string(),
            telefone: telefone.to_string(),
            email: Some(" a@b.com ".to_string()),
        }
    }

    #[test]
    fn contato_inicial_ausente_e_rejeitado() {
        assert_eq!(validar_contato_inicial(None), Err(MSG_CONTATO_OBRIGATORIO.to_string()));
    }

    #[test]
    fn contato_inicial_sem_nome_ou_telefone_curto_e_rejeitado() {
        assert!(validar_contato_inicial(Some(&contato("  ", "11999999999"))).is_err());
        assert!(validar_contato_inicial(Some(&contato("Ana", "119999999"))).is_err());
        assert!(validar_contato_inicial(Some(&contato("Ana", "119999999999"))).is_err());
    }

    #[test]
    fn contato_inicial_valido_normaliza_campos() {
        let (nome, tel, email) =
            validar_contato_inicial(Some(&contato(" Ana ", "(11) 99999-9999"))).unwrap();
        assert_eq!(nome, "Ana");
        assert_eq!(tel, "11999999999");
        assert_eq!(email.as_deref(), Some("a@b.com"));
    }

    #[test]
    fn contato_inicial_fixo_de_10_digitos_e_rejeitado() {
        assert_eq!(
            validar_contato_inicial(Some(&contato("Ana", "1133334444"))),
            Err(MSG_CONTATO_OBRIGATORIO.to_string())
        );
    }

    #[test]
    fn celular_valido_aceita_so_celular_com_ddd_e_o_9() {
        assert!(celular_valido("(11) 99999-0000"));
        assert!(celular_valido("71988887777"));
        assert!(!celular_valido("(11) 3333-4444"));
        assert!(!celular_valido("(11) 83333-4444"));
        assert!(!celular_valido("(10) 99999-0000"));
        assert!(!celular_valido("(100) 99999-0000"));
        assert!(!celular_valido(""));
    }

    #[test]
    fn celular_nacional_aceita_prefixo_55() {
        assert_eq!(celular_nacional("+55 71 98888-7777").as_deref(), Some("71988887777"));
        assert_eq!(celular_nacional("5571988887777").as_deref(), Some("71988887777"));
        assert_eq!(celular_nacional("71988887777").as_deref(), Some("71988887777"));
        // DDD 55 (Santa Maria) sem DDI não é cortado.
        assert_eq!(celular_nacional("55988887777").as_deref(), Some("55988887777"));
    }

    #[test]
    fn pj_sem_contato_celular_exige_contato_inicial() {
        assert!(!pj_tem_contato_celular(&[]));
        assert!(!pj_tem_contato_celular(&["7133334444".into(), "".into()]));
        assert!(pj_tem_contato_celular(&["+55 71 98888-7777".into()]));
        assert_eq!(validar_contato_inicial(None), Err(MSG_CONTATO_OBRIGATORIO.to_string()));
    }
}
