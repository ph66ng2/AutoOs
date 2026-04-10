CREATE TABLE IF NOT EXISTS equipamento_imagens (
    id SERIAL PRIMARY KEY,
    equipamento_id INTEGER NOT NULL,
    categoria TEXT NOT NULL DEFAULT 'ENTRADA',
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    tamanho_bytes INTEGER NOT NULL,
    largura INTEGER,
    altura INTEGER,
    ordem INTEGER NOT NULL DEFAULT 0,
    observacao TEXT,
    bytes BYTEA NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_equipamento_imagens_equipamento
        FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE,
    CONSTRAINT chk_equipamento_imagens_categoria
        CHECK (categoria IN ('ENTRADA', 'SAIDA')),
    CONSTRAINT chk_equipamento_imagens_filename_not_blank
        CHECK (BTRIM(filename) <> ''),
    CONSTRAINT chk_equipamento_imagens_mime_type_allowed
        CHECK (mime_type IN ('image/jpeg', 'image/png')),
    CONSTRAINT chk_equipamento_imagens_tamanho_positivo
        CHECK (tamanho_bytes > 0),
    CONSTRAINT chk_equipamento_imagens_largura_positiva
        CHECK (largura IS NULL OR largura > 0),
    CONSTRAINT chk_equipamento_imagens_altura_positiva
        CHECK (altura IS NULL OR altura > 0),
    CONSTRAINT chk_equipamento_imagens_ordem_valida
        CHECK (ordem >= 0)
);

CREATE INDEX IF NOT EXISTS idx_equipamento_imagens_equipamento
    ON equipamento_imagens (equipamento_id, categoria, ordem, id);
