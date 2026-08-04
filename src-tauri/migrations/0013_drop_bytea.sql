-- Migration 0013: Drop bytes BYTEA column after verifying all images have been migrated to Storage.
-- WARNING: Only apply this after running migrate_images_to_storage successfully and
-- verifying that all storage_path values are set and images are accessible via the URLs.
-- Once applied, this CANNOT be rolled back — the BYTEA data is gone permanently.
ALTER TABLE equipamento_imagens DROP COLUMN IF EXISTS bytes;
