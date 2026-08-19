-- Sessões efêmeras para o upload de fotos pelo celular.
--
-- O token nunca é persistido em texto puro: apenas o SHA-256 é armazenado.
-- A futura Edge Function valida o hash e grava objetos em staging privado; esta
-- migration não concede acesso direto via Data API.

CREATE TABLE IF NOT EXISTS photo_upload_sessions (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    profile_id INTEGER NOT NULL REFERENCES security_profiles(id) ON DELETE RESTRICT,
    equipamento_id INTEGER REFERENCES equipamentos(id) ON DELETE CASCADE,
    categoria TEXT NOT NULL DEFAULT 'ENTRADA',
    token_hash CHAR(64) NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMP NOT NULL,
    cancelled_at TIMESTAMP,
    consumed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_photo_upload_sessions_categoria
        CHECK (categoria IN ('ENTRADA', 'SAIDA', 'VERIFICACAO')) NOT VALID,
    CONSTRAINT chk_photo_upload_sessions_status
        CHECK (status IN ('PENDING', 'CANCELLED', 'EXPIRED', 'CONSUMED')) NOT VALID,
    CONSTRAINT chk_photo_upload_sessions_token_hash
        CHECK (token_hash ~ '^[0-9a-f]{64}$') NOT VALID,
    CONSTRAINT chk_photo_upload_sessions_expiry
        CHECK (expires_at > created_at) NOT VALID
);

-- Itens são preparados aqui para que a Edge Function do próximo ticket possa
-- registrar staging privado sem alterar o contrato de sessão.
CREATE TABLE IF NOT EXISTS photo_upload_session_items (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES photo_upload_sessions(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL,
    storage_path TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    tamanho_bytes INTEGER,
    status TEXT NOT NULL DEFAULT 'UPLOADED',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_photo_upload_session_items_position UNIQUE (session_id, position),
    CONSTRAINT chk_photo_upload_session_items_position CHECK (position BETWEEN 0 AND 5) NOT VALID,
    CONSTRAINT chk_photo_upload_session_items_filename CHECK (BTRIM(filename) <> '') NOT VALID,
    CONSTRAINT chk_photo_upload_session_items_storage_path CHECK (BTRIM(storage_path) <> '') NOT VALID,
    CONSTRAINT chk_photo_upload_session_items_storage_object_path
        CHECK (BTRIM(storage_path) !~* '^data:') NOT VALID,
    CONSTRAINT chk_photo_upload_session_items_mime_type
        CHECK (mime_type IN ('image/jpeg', 'image/png')) NOT VALID,
    CONSTRAINT chk_photo_upload_session_items_size CHECK (tamanho_bytes IS NULL OR tamanho_bytes > 0) NOT VALID,
    CONSTRAINT chk_photo_upload_session_items_status
        CHECK (status IN ('UPLOADED', 'REJECTED', 'CONSUMED')) NOT VALID
);

CREATE INDEX IF NOT EXISTS idx_photo_upload_sessions_active_token
    ON photo_upload_sessions (token_hash)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_photo_upload_sessions_owner_expiry
    ON photo_upload_sessions (empresa_id, profile_id, expires_at)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_photo_upload_session_items_session
    ON photo_upload_session_items (session_id, position);

-- As tabelas pertencem ao backend desktop/Edge Function. RLS e ausência de
-- políticas impedem leitura/escrita pela Data API pública; as permissões são
-- explicitamente revogadas quando esses papéis existem no ambiente Supabase.
ALTER TABLE photo_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_upload_session_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE photo_upload_sessions, photo_upload_session_items FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE photo_upload_sessions, photo_upload_session_items FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE photo_upload_sessions, photo_upload_session_items FROM authenticated;
    END IF;
END $$;
