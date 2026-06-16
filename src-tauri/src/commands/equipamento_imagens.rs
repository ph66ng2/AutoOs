use crate::commands::auth::{require_permission, PERMISSION_STOCK_CONTROL};
use crate::commands::types::{
    EquipamentoImagemInput, EquipamentoImagemRow, EQUIPAMENTO_IMAGEM_SELECT,
};
use crate::db::get_pool;
use tracing::{debug, error, info, instrument};

const MAX_IMAGES_PER_EQUIPMENT: usize = 6;
pub const MAX_IMAGE_BYTES: usize = 3 * 1024 * 1024;

fn normalize_category(category: &str) -> Result<String, String> {
    match category.trim() {
        "" | "ENTRADA" => Ok("ENTRADA".to_string()),
        "SAIDA" => Ok("SAIDA".to_string()),
        "VERIFICACAO" => Ok("VERIFICACAO".to_string()),
        other => Err(format!("Categoria de imagem inválida: {}", other)),
    }
}

fn sanitize_filename(filename: &str) -> Result<String, String> {
    let trimmed = filename.trim();
    if trimmed.is_empty() {
        return Err("Nome da imagem é obrigatório".to_string());
    }

    let sanitized: String = trimmed
        .chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '-' | '_' => character,
            _ => '_',
        })
        .collect();

    if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
        return Err("Nome da imagem inválido".to_string());
    }

    Ok(sanitized)
}

fn normalize_mime_type(mime_type: &str) -> Result<String, String> {
    match mime_type.trim() {
        "image/jpeg" | "image/png" => Ok(mime_type.trim().to_string()),
        other => Err(format!("Tipo de imagem não suportado: {}", other)),
    }
}

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
}

fn validate_dimension(value: Option<i32>, field: &str) -> Result<Option<i32>, String> {
    if let Some(value) = value {
        if value <= 0 {
            return Err(format!("{} deve ser maior que zero", field));
        }
        return Ok(Some(value));
    }

    Ok(None)
}

async fn ensure_equipment_exists(equipamento_id: i32) -> Result<(), String> {
    let pool = get_pool().await?;
    let exists: Option<(i32,)> = sqlx::query_as("SELECT id FROM equipamentos WHERE id = $1")
        .bind(equipamento_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao validar equipamento {}: {}", equipamento_id, e);
            e.to_string()
        })?;

    if exists.is_none() {
        return Err("Equipamento não encontrado".to_string());
    }

    Ok(())
}

#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn listar_imagens_equipamento(
    equipamento_id: i32,
) -> Result<Vec<EquipamentoImagemRow>, String> {
    debug!("Listando imagens do equipamento {}", equipamento_id);
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let query = format!(
        "{} WHERE equipamento_id = $1 ORDER BY categoria ASC, ordem ASC, id ASC",
        EQUIPAMENTO_IMAGEM_SELECT
    );

    sqlx::query_as::<_, EquipamentoImagemRow>(&query)
        .bind(equipamento_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao listar imagens do equipamento {}: {}", equipamento_id, e);
            e.to_string()
        })
}

#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id, quantidade = imagens.len()))]
pub async fn substituir_imagens_equipamento(
    equipamento_id: i32,
    imagens: Vec<EquipamentoImagemInput>,
) -> Result<Vec<EquipamentoImagemRow>, String> {
    if imagens.len() > MAX_IMAGES_PER_EQUIPMENT {
        return Err(format!(
            "Limite de {} imagens por equipamento excedido",
            MAX_IMAGES_PER_EQUIPMENT
        ));
    }

    ensure_equipment_exists(equipamento_id).await?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let mut tx = pool.begin().await.map_err(|e| {
        error!("Erro ao iniciar transação de imagens: {}", e);
        e.to_string()
    })?;

    sqlx::query("DELETE FROM equipamento_imagens WHERE equipamento_id = $1")
        .bind(equipamento_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            error!(
                "Erro ao limpar imagens existentes do equipamento {}: {}",
                equipamento_id, e
            );
            e.to_string()
        })?;

    for (index, imagem) in imagens.into_iter().enumerate() {
        if imagem.bytes.is_empty() {
            return Err("Imagem sem conteúdo informado".to_string());
        }

        if imagem.bytes.len() > MAX_IMAGE_BYTES {
            return Err(format!(
                "Uma das imagens excede o limite de {} MB após compressão",
                MAX_IMAGE_BYTES / 1024 / 1024
            ));
        }

        let categoria = normalize_category(&imagem.categoria)?;
        let filename = sanitize_filename(&imagem.filename)?;
        let mime_type = normalize_mime_type(&imagem.mime_type)?;
        let largura = validate_dimension(imagem.largura, "Largura da imagem")?;
        let altura = validate_dimension(imagem.altura, "Altura da imagem")?;
        let observacao = normalize_optional_text(imagem.observacao.as_deref());
        let tamanho_bytes = i32::try_from(imagem.bytes.len())
            .map_err(|_| "Tamanho da imagem excede o limite suportado".to_string())?;
        let ordem = i32::try_from(index).map_err(|_| "Ordem de imagem inválida".to_string())?;

        sqlx::query(
            r#"
            INSERT INTO equipamento_imagens (
                equipamento_id, categoria, filename, mime_type,
                tamanho_bytes, largura, altura, ordem, observacao, bytes
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            )
            "#,
        )
        .bind(equipamento_id)
        .bind(categoria)
        .bind(filename)
        .bind(mime_type)
        .bind(tamanho_bytes)
        .bind(largura)
        .bind(altura)
        .bind(ordem)
        .bind(observacao)
        .bind(imagem.bytes)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            error!(
                "Erro ao inserir imagem {} do equipamento {}: {}",
                index, equipamento_id, e
            );
            e.to_string()
        })?;
    }

    tx.commit().await.map_err(|e| {
        error!("Erro ao concluir transação de imagens: {}", e);
        e.to_string()
    })?;

    info!("Imagens do equipamento {} atualizadas", equipamento_id);
    listar_imagens_equipamento(equipamento_id).await
}

pub async fn adicionar_imagem_equipamento_raw(
    equipamento_id: i32,
    categoria: String,
    filename: String,
    mime_type: String,
    bytes: Vec<u8>,
    observacao: Option<String>,
) -> Result<EquipamentoImagemRow, String> {
    if bytes.is_empty() {
        return Err("Imagem sem conteúdo informado".to_string());
    }

    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(format!(
            "Imagem excede o limite de {} MB",
            MAX_IMAGE_BYTES / 1024 / 1024
        ));
    }

    ensure_equipment_exists(equipamento_id).await?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM equipamento_imagens WHERE equipamento_id = $1"
    )
    .bind(equipamento_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao contar imagens do equipamento {}: {}", equipamento_id, e);
        e.to_string()
    })?;

    if count.0 >= MAX_IMAGES_PER_EQUIPMENT as i64 {
        return Err(format!(
            "Limite de {} imagens por equipamento atingido",
            MAX_IMAGES_PER_EQUIPMENT
        ));
    }

    let categoria = normalize_category(&categoria)?;
    let filename = sanitize_filename(&filename)?;
    let mime_type = normalize_mime_type(&mime_type)?;
    let tamanho_bytes = i32::try_from(bytes.len())
        .map_err(|_| "Tamanho da imagem excede o limite suportado".to_string())?;
    let ordem = i32::try_from(count.0).map_err(|_| "Ordem de imagem inválida".to_string())?;
    let observacao = normalize_optional_text(observacao.as_deref());

    let row: EquipamentoImagemRow = sqlx::query_as(
        r#"
        INSERT INTO equipamento_imagens (
            equipamento_id, categoria, filename, mime_type,
            tamanho_bytes, largura, altura, ordem, observacao, bytes
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
        RETURNING
            id, equipamento_id, categoria, filename, mime_type,
            tamanho_bytes, largura, altura, ordem, observacao, bytes,
            criado_em::TEXT as criado_em, atualizado_em::TEXT as atualizado_em
        "#,
    )
    .bind(equipamento_id)
    .bind(categoria)
    .bind(filename)
    .bind(mime_type)
    .bind(tamanho_bytes)
    .bind(None::<i32>)
    .bind(None::<i32>)
    .bind(ordem)
    .bind(observacao)
    .bind(bytes)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!("Erro ao inserir imagem do equipamento {}: {}", equipamento_id, e);
        e.to_string()
    })?;

    info!("Imagem adicionada ao equipamento {}", equipamento_id);
    Ok(row)
}

#[tauri::command]
#[instrument(skip_all, fields(imagem_id = imagem_id))]
pub async fn remover_imagem_equipamento(imagem_id: i32) -> Result<(), String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let result = sqlx::query("DELETE FROM equipamento_imagens WHERE id = $1")
        .bind(imagem_id)
        .execute(&pool)
        .await
        .map_err(|e| {
            error!("Erro ao remover imagem {}: {}", imagem_id, e);
            e.to_string()
        })?;

    if result.rows_affected() == 0 {
        return Err("Imagem não encontrada".to_string());
    }

    info!("Imagem {} removida com sucesso", imagem_id);
    Ok(())
}

#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn adicionar_imagem_equipamento(
    equipamento_id: i32,
    imagem: EquipamentoImagemInput,
) -> Result<EquipamentoImagemRow, String> {
    require_permission(PERMISSION_STOCK_CONTROL)?;

    ensure_equipment_exists(equipamento_id).await?;

    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM equipamento_imagens WHERE equipamento_id = $1",
    )
    .bind(equipamento_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        error!(
            "Erro ao contar imagens do equipamento {}: {}",
            equipamento_id, e
        );
        e.to_string()
    })?;

    if count.0 as usize >= MAX_IMAGES_PER_EQUIPMENT {
        return Err(format!(
            "Limite de {} imagens atingido para este equipamento",
            MAX_IMAGES_PER_EQUIPMENT
        ));
    }

    if imagem.bytes.is_empty() {
        return Err("Imagem sem conteúdo informado".to_string());
    }

    if imagem.bytes.len() > MAX_IMAGE_BYTES {
        return Err(format!(
            "Imagem excede o limite de {} MB",
            MAX_IMAGE_BYTES / 1024 / 1024
        ));
    }

    let categoria = normalize_category(&imagem.categoria)?;
    let filename = sanitize_filename(&imagem.filename)?;
    let mime_type = normalize_mime_type(&imagem.mime_type)?;
    let largura = validate_dimension(imagem.largura, "Largura da imagem")?;
    let altura = validate_dimension(imagem.altura, "Altura da imagem")?;
    let observacao = normalize_optional_text(imagem.observacao.as_deref());
    let tamanho_bytes = i32::try_from(imagem.bytes.len())
        .map_err(|_| "Tamanho da imagem excede o limite suportado".to_string())?;
    let ordem = imagem
        .ordem
        .unwrap_or(count.0 as i32);

    let insert_query = format!(
        "INSERT INTO equipamento_imagens (
            equipamento_id, categoria, filename, mime_type,
            tamanho_bytes, largura, altura, ordem, observacao, bytes
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        ) RETURNING id"
    );

    let inserted_id: (i32,) = sqlx::query_as(&insert_query)
        .bind(equipamento_id)
        .bind(&categoria)
        .bind(&filename)
        .bind(&mime_type)
        .bind(tamanho_bytes)
        .bind(largura)
        .bind(altura)
        .bind(ordem)
        .bind(observacao)
        .bind(&imagem.bytes)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            error!(
                "Erro ao inserir imagem no equipamento {}: {}",
                equipamento_id, e
            );
            e.to_string()
        })?;

    let select_query = format!(
        "{} WHERE id = $1",
        EQUIPAMENTO_IMAGEM_SELECT
    );

    sqlx::query_as::<_, EquipamentoImagemRow>(&select_query)
        .bind(inserted_id.0)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            error!(
                "Erro ao buscar imagem inserida no equipamento {}: {}",
                equipamento_id, e
            );
            e.to_string()
        })
}