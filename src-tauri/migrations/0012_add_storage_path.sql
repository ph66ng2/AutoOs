-- Migration 0012: Add storage_path column for Supabase Storage migration.
-- Makes bytes BYTEA nullable so migrated rows can have bytes = NULL.
-- This allows a gradual migration: new images go to Storage, old images remain as BYTEA until migrated.
ALTER TABLE equipamento_imagens ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE equipamento_imagens ALTER COLUMN bytes DROP NOT NULL;
