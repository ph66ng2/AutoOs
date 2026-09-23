use crate::commands::auth::{require_permission, PERMISSION_STOCK_CONTROL};
use crate::commands::equipamento_imagens::{
    build_storage_object_path, decode_data_url, load_storage_config, storage_ref_for,
    upload_to_storage,
};
use crate::db::get_pool;
use sqlx::FromRow;
use tracing::{debug, error, info, instrument};

#[derive(Debug, serde::Serialize)]
pub struct ImageMigrationResult {
    pub migrated: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

#[derive(FromRow)]
struct ImageRow {
    id: i32,
    equipamento_id: i32,
    empresa_id: i32,
    mime_type: String,
    storage_path: String,
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn migrate_images_to_storage() -> Result<ImageMigrationResult, String> {
    require_permission(PERMISSION_STOCK_CONTROL)?;

    let config = match load_storage_config()? {
        Some(c) => c,
        None => return Err("Configuração de storage não encontrada. Configure o Supabase Storage primeiro.".to_string()),
    };

    let pool = get_pool().await.map_err(|e| e.to_string())?;

    let rows = sqlx::query_as::<_, ImageRow>(
        "SELECT i.id, i.equipamento_id, e.empresa_id, i.mime_type, i.storage_path
         FROM equipamento_imagens i
         JOIN equipamentos e ON e.id = i.equipamento_id
         WHERE i.storage_path LIKE 'data:%' AND e.empresa_id IS NOT NULL
         ORDER BY i.id",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Erro ao buscar imagens pendentes de migração: {}", e))?;

    info!("Encontradas {} imagens para migrar para o storage", rows.len());

    let mut migrated = 0usize;
    let mut skipped = 0usize;
    let mut errors = Vec::new();

    for row in &rows {
        let bytes = match decode_data_url(&row.storage_path) {
            Ok(bytes) => bytes,
            Err(error) => {
                let msg = format!("Imagem {}: {}", row.id, error);
                error!("{}", msg);
                errors.push(msg);
                skipped += 1;
                continue;
            }
        };
        let object_path =
            build_storage_object_path(row.empresa_id, row.equipamento_id, row.id, &row.mime_type);
        let stored = storage_ref_for(&object_path);

        match upload_to_storage(&config, &object_path, &bytes, &row.mime_type).await {
            Ok(_) => {
                match sqlx::query("UPDATE equipamento_imagens SET storage_path = $1 WHERE id = $2")
                    .bind(&stored)
                    .bind(row.id)
                    .execute(&pool)
                    .await
                {
                    Ok(_) => {
                        migrated += 1;
                        debug!("Imagem {} migrada para {}", row.id, stored);
                    }
                    Err(e) => {
                        let msg = format!("Imagem {}: upload ok mas falha ao atualizar DB: {}", row.id, e);
                        error!("{}", msg);
                        errors.push(msg);
                        skipped += 1;
                    }
                }
            }
            Err(e) => {
                let msg = format!("Imagem {}: {}", row.id, e);
                error!("{}", msg);
                errors.push(msg);
                skipped += 1;
            }
        }
    }

    info!(
        "Migração de imagens concluída: {} migradas, {} puladas, {} erros",
        migrated, skipped, errors.len()
    );

    Ok(ImageMigrationResult {
        migrated,
        skipped,
        errors,
    })
}
