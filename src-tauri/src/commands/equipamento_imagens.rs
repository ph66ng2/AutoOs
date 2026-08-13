use crate::commands::auth::{require_permission, PERMISSION_STOCK_CONTROL};
use crate::commands::types::{
    EquipamentoImagemInput, EquipamentoImagemRow, EQUIPAMENTO_IMAGEM_SELECT,
};
use crate::db::get_pool;
use keyring::Entry;
use reqwest::Client;
use tracing::{debug, error, info, instrument};

// Re-export for image_migration.rs
pub use crate::commands::types::SupabaseStorageConfig;

const KEYRING_SERVICE: &str = "autoos";
const KEYRING_USER: &str = "storage_config";

// ═══════════════════════════════════════════════════════════
// Storage helpers (used by image_migration.rs and photo_server.rs)
// ═══════════════════════════════════════════════════════════

/// Loads SupabaseStorageConfig from keyring. Returns None if not configured.
pub fn load_storage_config() -> Result<Option<SupabaseStorageConfig>, String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| {
        error!("Erro ao acessar keyring de storage config: {}", e);
        e.to_string()
    })?;

    let json = match entry.get_password() {
        Ok(password) => password,
        Err(_) => return Ok(None),
    };

    let config: SupabaseStorageConfig = serde_json::from_str(&json).map_err(|e| {
        error!("Erro ao deserializar config de storage: {}", e);
        format!("Configuração do Supabase inválida: {}", e)
    })?;

    Ok(Some(config))
}

/// Builds the storage path for an equipment image.
/// Format: `equipamento-imagens/{empresa_id}/{equipamento_id}/{image_id}.{ext}`
pub fn build_storage_path(
    config: &SupabaseStorageConfig,
    equipamento_id: i32,
    image_id: i32,
    mime_type: &str,
) -> String {
    let empresa_id = config
        .empresa_id
        .as_deref()
        .unwrap_or("00000000-0000-0000-0000-000000000001");
    let ext = match mime_type {
        "image/png" => "png",
        _ => "jpg",
    };
    format!(
        "equipamento-imagens/{}/{}/{}.{}",
        empresa_id, equipamento_id, image_id, ext
    )
}

/// Uploads image bytes to Supabase Storage. Returns the public URL.
pub async fn upload_to_storage(
    config: &SupabaseStorageConfig,
    storage_path: &str,
    bytes: &[u8],
    mime_type: &str,
) -> Result<String, String> {
    let url = format!(
        "{}/storage/v1/object/{}",
        config.supabase_url.trim_end_matches('/'),
        storage_path
    );

    let client = Client::new();
    let response = client
        .post(&url)
        .header("apikey", &config.supabase_service_key)
        .header(
            "Authorization",
            format!("Bearer {}", config.supabase_service_key),
        )
        .header("Content-Type", mime_type)
        .header("x-upsert", "true")
        .body(bytes.to_vec())
        .send()
        .await
        .map_err(|e| {
            error!("Erro ao enviar imagem para Storage: {}", e);
            format!("Erro de conexão com Storage: {}", e)
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        error!("Storage retornou {}: {}", status, body);
        return Err(format!("Storage retornou {}: {}", status, body));
    }

    let public_url = format!(
        "{}/storage/v1/object/public/{}",
        config.supabase_url.trim_end_matches('/'),
        storage_path
    );

    Ok(public_url)
}

/// Deletes an object from Supabase Storage.
pub async fn delete_from_storage(
    config: &SupabaseStorageConfig,
    storage_path: &str,
) -> Result<(), String> {
    let url = format!(
        "{}/storage/v1/object/{}",
        config.supabase_url.trim_end_matches('/'),
        storage_path
    );

    let client = Client::new();
    let response = client
        .delete(&url)
        .header("apikey", &config.supabase_service_key)
        .header(
            "Authorization",
            format!("Bearer {}", config.supabase_service_key),
        )
        .send()
        .await
        .map_err(|e| {
            error!("Erro ao deletar objeto do Storage: {}", e);
            format!("Erro de conexão com Storage: {}", e)
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        error!("Storage DELETE retornou {}: {}", status, body);
        return Err(format!("Storage DELETE retornou {}: {}", status, body));
    }

    Ok(())
}

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

    sqlx::query_as::<_, EquipamentoImagemRow>(sqlx::AssertSqlSafe(&*query))
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
        if imagem.storage_path.is_empty() {
            return Err("Imagem sem storage_path informado".to_string());
        }

        let categoria = normalize_category(&imagem.categoria)?;
        let filename = sanitize_filename(&imagem.filename)?;
        let mime_type = normalize_mime_type(&imagem.mime_type)?;
        let largura = validate_dimension(imagem.largura, "Largura da imagem")?;
        let altura = validate_dimension(imagem.altura, "Altura da imagem")?;
        let observacao = normalize_optional_text(imagem.observacao.as_deref());
        let tamanho_bytes = imagem.tamanho_bytes.unwrap_or(0);
        let ordem = i32::try_from(index).map_err(|_| "Ordem de imagem inválida".to_string())?;

        sqlx::query(
            r#"
            INSERT INTO equipamento_imagens (
                equipamento_id, categoria, filename, mime_type,
                tamanho_bytes, largura, altura, ordem, observacao, storage_path
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
        .bind(imagem.storage_path)
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
    storage_path: String,
    tamanho_bytes: i32,
    observacao: Option<String>,
) -> Result<EquipamentoImagemRow, String> {
    if storage_path.is_empty() {
        return Err("Imagem sem storage_path informado".to_string());
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
    let ordem = i32::try_from(count.0).map_err(|_| "Ordem de imagem inválida".to_string())?;
    let observacao = normalize_optional_text(observacao.as_deref());

    let row: EquipamentoImagemRow = sqlx::query_as(
        r#"
        INSERT INTO equipamento_imagens (
            equipamento_id, categoria, filename, mime_type,
            tamanho_bytes, largura, altura, ordem, observacao, storage_path
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
        RETURNING
            id, equipamento_id, categoria, filename, mime_type,
            tamanho_bytes, largura, altura, ordem, observacao, storage_path,
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
    .bind(storage_path)
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

    if imagem.storage_path.is_empty() {
        return Err("Imagem sem storage_path informado".to_string());
    }

    let categoria = normalize_category(&imagem.categoria)?;
    let filename = sanitize_filename(&imagem.filename)?;
    let mime_type = normalize_mime_type(&imagem.mime_type)?;
    let largura = validate_dimension(imagem.largura, "Largura da imagem")?;
    let altura = validate_dimension(imagem.altura, "Altura da imagem")?;
    let observacao = normalize_optional_text(imagem.observacao.as_deref());
    let tamanho_bytes = imagem.tamanho_bytes.unwrap_or(0);
    let ordem = imagem
        .ordem
        .unwrap_or(count.0 as i32);

    let insert_query = format!(
        "INSERT INTO equipamento_imagens (
            equipamento_id, categoria, filename, mime_type,
            tamanho_bytes, largura, altura, ordem, observacao, storage_path
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        ) RETURNING id"
    );

    let inserted_id: (i32,) = sqlx::query_as(sqlx::AssertSqlSafe(&*insert_query))
        .bind(equipamento_id)
        .bind(&categoria)
        .bind(&filename)
        .bind(&mime_type)
        .bind(tamanho_bytes)
        .bind(largura)
        .bind(altura)
        .bind(ordem)
        .bind(observacao)
        .bind(&imagem.storage_path)
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

    sqlx::query_as::<_, EquipamentoImagemRow>(sqlx::AssertSqlSafe(&*select_query))
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