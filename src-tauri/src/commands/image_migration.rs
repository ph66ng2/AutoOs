use crate::commands::auth::{require_permission, PERMISSION_STOCK_CONTROL};
use crate::commands::equipamento_imagens::{
    build_storage_path, load_storage_config, upload_to_storage, SupabaseStorageConfig,
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
    mime_type: String,
    bytes: Vec<u8>,
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
        "SELECT id, equipamento_id, mime_type, bytes FROM equipamento_imagens WHERE bytes IS NOT NULL ORDER BY id",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Erro ao buscar imagens pendentes de migração: {}", e))?;

    info!("Encontradas {} imagens para migrar para o storage", rows.len());

    let mut migrated = 0usize;
    let mut skipped = 0usize;
    let mut errors = Vec::new();

    for row in &rows {
        let storage_path = build_storage_path(&config, row.equipamento_id, row.id, &row.mime_type);

        match upload_to_storage(&config, &storage_path, &row.bytes, &row.mime_type).await {
            Ok(public_url) => {
                match sqlx::query(
                    "UPDATE equipamento_imagens SET storage_path = $1, bytes = NULL WHERE id = $2",
                )
                .bind(&public_url)
                .bind(row.id)
                .execute(&pool)
                .await
                {
                    Ok(_) => {
                        migrated += 1;
                        debug!("Imagem {} migrada para {}", row.id, public_url);
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
