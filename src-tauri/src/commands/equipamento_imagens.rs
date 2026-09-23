use crate::commands::auth::{require_permission, PERMISSION_STOCK_CONTROL};
use crate::commands::types::{
    EquipamentoImagemInput, EquipamentoImagemRow, EQUIPAMENTO_IMAGEM_SELECT,
};
use crate::db::get_pool;
use base64::Engine;
use keyring::Entry;
use reqwest::Client;
use tracing::{debug, error, info, instrument};

// Re-export for image_migration.rs
pub use crate::commands::types::SupabaseStorageConfig;

const KEYRING_SERVICE: &str = "autoos";
const KEYRING_USER: &str = "storage_config";
pub const STORAGE_BUCKET: &str = "equipamento-imagens";
const STORAGE_REF_PREFIX: &str = "storage:";

// ═══════════════════════════════════════════════════════════
// Storage helpers (used by image_migration.rs and photo_server.rs)
// ═══════════════════════════════════════════════════════════

/// Loads Supabase Storage config. Environment overrides the keyring so the
/// release de produção pode injetar o endpoint sem gravar a chave no banco.
/// Returns None if not configured.
pub fn load_storage_config() -> Result<Option<SupabaseStorageConfig>, String> {
    if let Some(config) = storage_config_from_env()? {
        return Ok(Some(config));
    }

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

fn storage_config_from_env() -> Result<Option<SupabaseStorageConfig>, String> {
    let url = std::env::var("AUTOOS_SUPABASE_URL").unwrap_or_default();
    let key = std::env::var("AUTOOS_SUPABASE_SERVICE_KEY").unwrap_or_default();
    let url = url.trim();
    let key = key.trim();
    if url.is_empty() && key.is_empty() {
        return Ok(None);
    }
    if url.is_empty() || key.is_empty() || !url.starts_with("https://") {
        return Err(
            "AUTOOS_SUPABASE_URL e AUTOOS_SUPABASE_SERVICE_KEY precisam ser informados juntos, com URL HTTPS."
                .to_string(),
        );
    }

    Ok(Some(SupabaseStorageConfig {
        supabase_url: url.to_string(),
        supabase_service_key: key.to_string(),
        empresa_id: None,
    }))
}

/// Object path inside the private bucket.
/// Format: `equipamento-imagens/{empresa_id}/{equipamento_id}/{image_id}.{ext}`
/// `empresa_id` is the integer tenant from `equipamentos`, never an invented UUID.
pub fn build_storage_object_path(
    empresa_id: i32,
    equipamento_id: i32,
    image_id: i32,
    mime_type: &str,
) -> String {
    let ext = match mime_type {
        "image/png" => "png",
        _ => "jpg",
    };
    format!(
        "{}/{}/{}/{}.{}",
        STORAGE_BUCKET, empresa_id, equipamento_id, image_id, ext
    )
}

pub fn storage_ref_for(object_path: &str) -> String {
    format!("{STORAGE_REF_PREFIX}{object_path}")
}

pub fn storage_object_path(storage_path: &str) -> Option<String> {
    let trimmed = storage_path.trim();
    if let Some(path) = trimmed.strip_prefix(STORAGE_REF_PREFIX) {
        let path = path.trim();
        if path.starts_with(&format!("{STORAGE_BUCKET}/")) {
            return Some(path.to_string());
        }
        return None;
    }

    let marker = format!("/{STORAGE_BUCKET}/");
    trimmed
        .find(&marker)
        .map(|index| trimmed[index + 1..].to_string())
}

pub fn storage_ref_belongs_to(storage_path: &str, empresa_id: i32, equipamento_id: i32) -> bool {
    let Some(object_path) = storage_object_path(storage_path) else {
        return false;
    };
    let prefix = format!("{STORAGE_BUCKET}/{empresa_id}/{equipamento_id}/");
    let Some(file_name) = object_path.strip_prefix(&prefix) else {
        return false;
    };
    !file_name.is_empty()
        && !file_name.contains('/')
        && (file_name.ends_with(".jpg") || file_name.ends_with(".png"))
}

pub fn decode_data_url(storage_path: &str) -> Result<Vec<u8>, String> {
    let base64_part = storage_path
        .split_once(',')
        .map(|(_, payload)| payload)
        .ok_or_else(|| "Data URL inválido: sem conteúdo base64".to_string())?;
    base64::engine::general_purpose::STANDARD
        .decode(base64_part.trim())
        .map_err(|e| format!("Erro ao decodificar base64: {}", e))
}

fn data_url_from_bytes(mime_type: &str, bytes: &[u8]) -> String {
    format!(
        "data:{};base64,{}",
        mime_type,
        base64::engine::general_purpose::STANDARD.encode(bytes)
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

/// Downloads an object with the service key kept in the desktop. The bucket stays private.
pub async fn download_from_storage(
    config: &SupabaseStorageConfig,
    object_path: &str,
) -> Result<Vec<u8>, String> {
    let url = format!(
        "{}/storage/v1/object/{}",
        config.supabase_url.trim_end_matches('/'),
        object_path
    );

    let client = Client::new();
    let response = client
        .get(&url)
        .header("apikey", &config.supabase_service_key)
        .header(
            "Authorization",
            format!("Bearer {}", config.supabase_service_key),
        )
        .send()
        .await
        .map_err(|e| {
            error!("Erro ao baixar imagem do Storage: {}", e);
            format!("Erro de conexão com Storage: {}", e)
        })?;

    if !response.status().is_success() {
        let status = response.status();
        error!("Storage GET retornou {}", status);
        return Err(format!("Storage GET retornou {}", status));
    }

    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|e| {
            error!("Erro ao ler bytes da imagem: {}", e);
            format!("Erro ao ler imagem do Storage: {}", e)
        })
}

pub async fn bytes_from_storage_path(storage_path: &str) -> Result<Vec<u8>, String> {
    if storage_path.starts_with("data:") {
        return decode_data_url(storage_path);
    }

    let object_path = storage_object_path(storage_path)
        .ok_or_else(|| "Formato de storage_path não suportado para exportação".to_string())?;
    let config = load_storage_config()?
        .ok_or_else(|| "Configuração de storage não encontrada".to_string())?;
    download_from_storage(&config, &object_path).await
}

async fn anexar_conteudo_transitorio(rows: &mut [EquipamentoImagemRow]) {
    let config = match load_storage_config() {
        Ok(Some(config)) => config,
        Ok(None) => return,
        Err(error) => {
            error!(
                "Configuração de storage indisponível ao ler fotos: {}",
                error
            );
            return;
        }
    };

    for row in rows.iter_mut() {
        if row.storage_path.starts_with("data:") {
            continue;
        }
        let Some(object_path) = storage_object_path(&row.storage_path) else {
            continue;
        };
        match download_from_storage(&config, &object_path).await {
            Ok(bytes) => {
                let mime = if object_path.ends_with(".png") {
                    "image/png"
                } else {
                    row.mime_type.as_str()
                };
                row.conteudo_data_url = Some(data_url_from_bytes(mime, &bytes));
            }
            Err(error) => {
                error!("Falha ao ler foto {} do storage: {}", row.id, error);
            }
        }
    }
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

async fn equipment_empresa_id(equipamento_id: i32) -> Result<Option<i32>, String> {
    let pool = get_pool().await?;
    let row: Option<(Option<i32>,)> =
        sqlx::query_as("SELECT empresa_id FROM equipamentos WHERE id = $1")
            .bind(equipamento_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| {
                error!("Erro ao validar equipamento {}: {}", equipamento_id, e);
                e.to_string()
            })?;

    row.map(|(empresa_id,)| empresa_id)
        .ok_or_else(|| "Equipamento não encontrado".to_string())
}

async fn insert_image_row(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    equipamento_id: i32,
    categoria: &str,
    filename: &str,
    mime_type: &str,
    tamanho_bytes: i32,
    largura: Option<i32>,
    altura: Option<i32>,
    ordem: i32,
    observacao: Option<String>,
    storage_path: &str,
) -> Result<i32, String> {
    let inserted: (i32,) = sqlx::query_as(
        r#"
        INSERT INTO equipamento_imagens (
            equipamento_id, categoria, filename, mime_type,
            tamanho_bytes, largura, altura, ordem, observacao, storage_path
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
        RETURNING id
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
    .bind(storage_path)
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| {
        error!(
            "Erro ao inserir imagem do equipamento {}: {}",
            equipamento_id, e
        );
        e.to_string()
    })?;

    Ok(inserted.0)
}

async fn insert_image_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    equipamento_id: i32,
    empresa_id: Option<i32>,
    config: Option<&SupabaseStorageConfig>,
    categoria: &str,
    filename: &str,
    mime_type: &str,
    tamanho_bytes: i32,
    largura: Option<i32>,
    altura: Option<i32>,
    ordem: i32,
    observacao: Option<String>,
    storage_path: &str,
) -> Result<i32, String> {
    let incoming = storage_path.trim();
    if incoming.is_empty() {
        return Err("Imagem sem storage_path informado".to_string());
    }

    if let Some(empresa_id) = empresa_id {
        if storage_ref_belongs_to(incoming, empresa_id, equipamento_id) {
            let stored = storage_object_path(incoming)
                .map(|path| storage_ref_for(&path))
                .unwrap_or_else(|| incoming.to_string());
            return insert_image_row(
                tx,
                equipamento_id,
                categoria,
                filename,
                mime_type,
                tamanho_bytes,
                largura,
                altura,
                ordem,
                observacao,
                &stored,
            )
            .await;
        }
    }

    if incoming.starts_with("data:") {
        let bytes = decode_data_url(incoming)?;
        if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
            return Err(format!(
                "Imagem excede o limite de {} bytes ou está vazia",
                MAX_IMAGE_BYTES
            ));
        }
        let size = i32::try_from(bytes.len()).unwrap_or(i32::MAX);
        let Some(empresa_id) = empresa_id else {
            if config.is_some() {
                return Err(
                    "Equipamento sem empresa. Não é possível gravar a foto no storage de produção."
                        .to_string(),
                );
            }
            return insert_image_row(
                tx,
                equipamento_id,
                categoria,
                filename,
                mime_type,
                size,
                largura,
                altura,
                ordem,
                observacao,
                incoming,
            )
            .await;
        };
        let Some(config) = config else {
            return insert_image_row(
                tx,
                equipamento_id,
                categoria,
                filename,
                mime_type,
                size,
                largura,
                altura,
                ordem,
                observacao,
                incoming,
            )
            .await;
        };

        let image_id = insert_image_row(
            tx,
            equipamento_id,
            categoria,
            filename,
            mime_type,
            size,
            largura,
            altura,
            ordem,
            observacao,
            "storage:pending",
        )
        .await?;
        let object_path =
            build_storage_object_path(empresa_id, equipamento_id, image_id, mime_type);
        upload_to_storage(config, &object_path, &bytes, mime_type).await?;
        sqlx::query(
            "UPDATE equipamento_imagens SET storage_path = $1, tamanho_bytes = $2 WHERE id = $3",
        )
        .bind(storage_ref_for(&object_path))
        .bind(size)
        .bind(image_id)
        .execute(&mut **tx)
        .await
        .map_err(|e| {
            error!("Erro ao gravar caminho da foto {}: {}", image_id, e);
            e.to_string()
        })?;
        return Ok(image_id);
    }

    Err("Foto não pertence a este equipamento".to_string())
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

    let mut rows = sqlx::query_as::<_, EquipamentoImagemRow>(sqlx::AssertSqlSafe(&*query))
        .bind(equipamento_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            error!(
                "Erro ao listar imagens do equipamento {}: {}",
                equipamento_id, e
            );
            e.to_string()
        })?;
    anexar_conteudo_transitorio(&mut rows).await;
    Ok(rows)
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

    let empresa_id = equipment_empresa_id(equipamento_id).await?;
    let config = load_storage_config()?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let old_paths: Vec<(String,)> =
        sqlx::query_as("SELECT storage_path FROM equipamento_imagens WHERE equipamento_id = $1")
            .bind(equipamento_id)
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?;

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
        let categoria = normalize_category(&imagem.categoria)?;
        let filename = sanitize_filename(&imagem.filename)?;
        let mime_type = normalize_mime_type(&imagem.mime_type)?;
        let largura = validate_dimension(imagem.largura, "Largura da imagem")?;
        let altura = validate_dimension(imagem.altura, "Altura da imagem")?;
        let observacao = normalize_optional_text(imagem.observacao.as_deref());
        let tamanho_bytes = imagem.tamanho_bytes.unwrap_or(0);
        let ordem = i32::try_from(index).map_err(|_| "Ordem de imagem inválida".to_string())?;

        insert_image_tx(
            &mut tx,
            equipamento_id,
            empresa_id,
            config.as_ref(),
            &categoria,
            &filename,
            &mime_type,
            tamanho_bytes,
            largura,
            altura,
            ordem,
            observacao,
            &imagem.storage_path,
        )
        .await?;
    }

    tx.commit().await.map_err(|e| {
        error!("Erro ao concluir transação de imagens: {}", e);
        e.to_string()
    })?;

    if let Some(config) = config.as_ref() {
        let kept: Vec<(String,)> = sqlx::query_as(
            "SELECT storage_path FROM equipamento_imagens WHERE equipamento_id = $1",
        )
        .bind(equipamento_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
        for (old_path,) in old_paths {
            let old_object = storage_object_path(&old_path);
            if kept.iter().any(|(path,)| {
                path == &old_path
                    || (old_object.is_some() && storage_object_path(path) == old_object)
            }) {
                continue;
            }
            if let Some(object_path) = storage_object_path(&old_path) {
                if let Err(error) = delete_from_storage(config, &object_path).await {
                    error!("Falha ao remover foto antiga do storage: {}", error);
                }
            }
        }
    }

    info!("Imagens do equipamento {} atualizadas", equipamento_id);
    listar_imagens_equipamento(equipamento_id).await
}

pub async fn adicionar_imagem_de_bytes(
    equipamento_id: i32,
    categoria: String,
    filename: String,
    mime_type: String,
    bytes: Vec<u8>,
    observacao: Option<String>,
) -> Result<EquipamentoImagemRow, String> {
    let tamanho_bytes = i32::try_from(bytes.len()).unwrap_or(i32::MAX);
    let storage_path = data_url_from_bytes(&mime_type, &bytes);
    adicionar_imagem_equipamento_raw(
        equipamento_id,
        categoria,
        filename,
        mime_type,
        storage_path,
        tamanho_bytes,
        observacao,
    )
    .await
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

    let empresa_id = equipment_empresa_id(equipamento_id).await?;
    let config = load_storage_config()?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM equipamento_imagens WHERE equipamento_id = $1")
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

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let image_id = insert_image_tx(
        &mut tx,
        equipamento_id,
        empresa_id,
        config.as_ref(),
        &categoria,
        &filename,
        &mime_type,
        tamanho_bytes,
        None,
        None,
        ordem,
        observacao,
        &storage_path,
    )
    .await?;
    tx.commit().await.map_err(|e| e.to_string())?;

    let query = format!("{} WHERE id = $1", EQUIPAMENTO_IMAGEM_SELECT);
    let mut row = sqlx::query_as::<_, EquipamentoImagemRow>(sqlx::AssertSqlSafe(&*query))
        .bind(image_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    anexar_conteudo_transitorio(std::slice::from_mut(&mut row)).await;
    info!("Imagem adicionada ao equipamento {}", equipamento_id);
    Ok(row)
}

#[tauri::command]
#[instrument(skip_all, fields(imagem_id = imagem_id))]
pub async fn remover_imagem_equipamento(imagem_id: i32) -> Result<(), String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let existing: Option<(String,)> =
        sqlx::query_as("SELECT storage_path FROM equipamento_imagens WHERE id = $1")
            .bind(imagem_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;
    let Some((storage_path,)) = existing else {
        return Err("Imagem não encontrada".to_string());
    };

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

    if let (Some(config), Some(object_path)) =
        (load_storage_config()?, storage_object_path(&storage_path))
    {
        if let Err(error) = delete_from_storage(&config, &object_path).await {
            error!("Falha ao remover foto {} do storage: {}", imagem_id, error);
        }
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

    let empresa_id = equipment_empresa_id(equipamento_id).await?;
    let config = load_storage_config()?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM equipamento_imagens WHERE equipamento_id = $1")
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

    let categoria = normalize_category(&imagem.categoria)?;
    let filename = sanitize_filename(&imagem.filename)?;
    let mime_type = normalize_mime_type(&imagem.mime_type)?;
    let largura = validate_dimension(imagem.largura, "Largura da imagem")?;
    let altura = validate_dimension(imagem.altura, "Altura da imagem")?;
    let observacao = normalize_optional_text(imagem.observacao.as_deref());
    let tamanho_bytes = imagem.tamanho_bytes.unwrap_or(0);
    let ordem = imagem.ordem.unwrap_or(count.0 as i32);

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let image_id = insert_image_tx(
        &mut tx,
        equipamento_id,
        empresa_id,
        config.as_ref(),
        &categoria,
        &filename,
        &mime_type,
        tamanho_bytes,
        largura,
        altura,
        ordem,
        observacao,
        &imagem.storage_path,
    )
    .await?;
    tx.commit().await.map_err(|e| e.to_string())?;

    let select_query = format!("{} WHERE id = $1", EQUIPAMENTO_IMAGEM_SELECT);
    let mut row = sqlx::query_as::<_, EquipamentoImagemRow>(sqlx::AssertSqlSafe(&*select_query))
        .bind(image_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            error!(
                "Erro ao buscar imagem inserida no equipamento {}: {}",
                equipamento_id, e
            );
            e.to_string()
        })?;
    anexar_conteudo_transitorio(std::slice::from_mut(&mut row)).await;
    Ok(row)
}

#[cfg(test)]
mod tests {
    use super::{
        build_storage_object_path, decode_data_url, storage_object_path, storage_ref_belongs_to,
        storage_ref_for, STORAGE_BUCKET,
    };

    #[test]
    fn caminho_usa_empresa_inteira_do_equipamento() {
        let path = build_storage_object_path(7, 42, 9, "image/png");
        assert_eq!(path, "equipamento-imagens/7/42/9.png");
        assert!(!path.contains("00000000-0000-0000-0000-000000000001"));
        assert!(path.starts_with(STORAGE_BUCKET));
    }

    #[test]
    fn referencia_so_pertence_ao_equipamento_da_empresa() {
        let object_path = build_storage_object_path(7, 42, 9, "image/jpeg");
        let reference = storage_ref_for(&object_path);
        assert_eq!(
            storage_object_path(&reference).as_deref(),
            Some(object_path.as_str())
        );
        assert!(storage_ref_belongs_to(&reference, 7, 42));
        assert!(!storage_ref_belongs_to(&reference, 8, 42));
        assert!(!storage_ref_belongs_to(&reference, 7, 43));
        assert!(!storage_ref_belongs_to(
            "storage:equipamento-imagens/7/42/../9.jpg",
            7,
            42
        ));
        assert!(!storage_ref_belongs_to("storage:pending", 7, 42));
    }

    #[test]
    fn url_legada_do_mesmo_equipamento_continua_reconhecida() {
        let url =
            "https://projeto.supabase.co/storage/v1/object/public/equipamento-imagens/7/42/9.jpg";
        assert!(storage_ref_belongs_to(url, 7, 42));
        assert_eq!(
            storage_object_path(url).as_deref(),
            Some("equipamento-imagens/7/42/9.jpg")
        );
    }

    #[test]
    fn data_url_decodifica_os_bytes() {
        let bytes = decode_data_url("data:image/jpeg;base64,aGVsbG8=").unwrap();
        assert_eq!(bytes, b"hello");
    }
}
