-- Cada empresa passa a ter cópias próprias do catálogo legado. Ligações de
-- peças só são preservadas quando todos os produtos pertencem à cópia destino.
DROP INDEX IF EXISTS ux_servicos_catalogo_nome_ativo;

DO $$
DECLARE
    empresa RECORD;
BEGIN
    FOR empresa IN SELECT id FROM empresas ORDER BY id LOOP
        INSERT INTO servicos_catalogo (
            empresa_id,
            nome,
            descricao,
            preco_padrao,
            pecas_sugeridas,
            ativo,
            criado_em,
            atualizado_em
        )
        SELECT
            empresa.id,
            legado.nome,
            legado.descricao,
            legado.preco_padrao,
            CASE
                WHEN jsonb_typeof(legado.pecas_sugeridas) = 'array'
                 AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(legado.pecas_sugeridas) AS item(value)
                    LEFT JOIN produtos produto
                      ON produto.id::TEXT = (item.value ->> 'produto_id')
                    WHERE produto.id IS NULL
                       OR produto.empresa_id IS DISTINCT FROM empresa.id
                       OR produto.ativo IS DISTINCT FROM true
                 )
                THEN legado.pecas_sugeridas
                ELSE '[]'::jsonb
            END,
            legado.ativo,
            legado.criado_em,
            legado.atualizado_em
        FROM servicos_catalogo legado
        WHERE legado.empresa_id IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM servicos_catalogo existente
              WHERE existente.empresa_id = empresa.id
                AND existente.ativo IS NOT DISTINCT FROM legado.ativo
                AND LOWER(BTRIM(existente.nome)) = LOWER(BTRIM(legado.nome))
          )
        ON CONFLICT DO NOTHING;
    END LOOP;

    -- Com empresas cadastradas, as linhas globais viram cópias independentes.
    IF EXISTS (SELECT 1 FROM empresas) THEN
        DELETE FROM servicos_catalogo WHERE empresa_id IS NULL;
    END IF;
END $$;

CREATE UNIQUE INDEX ux_servicos_catalogo_nome_ativo
    ON servicos_catalogo (empresa_id, LOWER(BTRIM(nome)))
    WHERE ativo = true;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_servicos_catalogo_empresa_required_new'
          AND conrelid = 'servicos_catalogo'::regclass
    ) THEN
        -- Preserva possíveis legados se o banco ainda não tiver empresas.
        ALTER TABLE servicos_catalogo
            ADD CONSTRAINT chk_servicos_catalogo_empresa_required_new
            CHECK (empresa_id IS NOT NULL) NOT VALID;
    END IF;
END $$;

DROP POLICY IF EXISTS "servicos_isolamento" ON servicos_catalogo;
CREATE POLICY "servicos_isolamento" ON servicos_catalogo
    FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);
