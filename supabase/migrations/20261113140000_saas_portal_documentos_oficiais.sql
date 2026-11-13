-- Porte SaaS de src-tauri/migrations/0047_portal_documentos_oficiais.sql.
-- Desktop usa INTEGER; aqui ids e empresa_id são UUID. RLS alinhado às tabelas
-- do portal SaaS (sem policy para anon/authenticated; Edge usa service_role + RPC).
-- Idempotente. Não aplica nada fora deste arquivo.

CREATE TABLE IF NOT EXISTS public.portal_documentos_oficiais (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    equipamento_id uuid NOT NULL,
    cliente_id uuid,
    cliente_chave uuid GENERATED ALWAYS AS (
        COALESCE(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) STORED,
    tipo text NOT NULL CHECK (tipo IN ('ORDEM_SERVICO', 'ORCAMENTO', 'ORCAMENTO_AJUSTADO')),
    versao_id uuid,
    versao_chave uuid GENERATED ALWAYS AS (
        COALESCE(versao_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) STORED,
    caminho text NOT NULL,
    sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    tamanho_bytes integer NOT NULL CHECK (tamanho_bytes BETWEEN 5 AND 15728640),
    revisao_em timestamptz NOT NULL,
    emitido_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, empresa_id),
    UNIQUE (empresa_id, equipamento_id, cliente_chave, tipo, versao_chave),
    CHECK ((tipo = 'ORDEM_SERVICO') = (versao_id IS NULL)),
    CHECK (
        caminho = empresa_id::text || '/' || equipamento_id::text || '/' || tipo || '/' ||
        COALESCE(versao_id::text, '0') || '/' || sha256 || '.pdf'
    )
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.portal_documentos_oficiais'::regclass
           AND conname = 'fk_portal_documentos_equipamento_empresa'
    ) THEN
        ALTER TABLE public.portal_documentos_oficiais
            ADD CONSTRAINT fk_portal_documentos_equipamento_empresa
            FOREIGN KEY (equipamento_id, empresa_id)
            REFERENCES public.equipamentos (id, empresa_id)
            ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN undefined_table OR invalid_foreign_key OR undefined_object THEN
    RAISE NOTICE 'FK equipamento/empresa do portal_documentos_oficiais adiada: %', SQLERRM;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.clientes') IS NOT NULL
       AND NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.portal_documentos_oficiais'::regclass
           AND conname = 'fk_portal_documentos_cliente_empresa'
    ) THEN
        ALTER TABLE public.portal_documentos_oficiais
            ADD CONSTRAINT fk_portal_documentos_cliente_empresa
            FOREIGN KEY (empresa_id, cliente_id)
            REFERENCES public.clientes (empresa_id, id)
            ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN undefined_table OR invalid_foreign_key OR undefined_object THEN
    RAISE NOTICE 'FK cliente/empresa do portal_documentos_oficiais adiada: %', SQLERRM;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.orcamento_versoes') IS NOT NULL
       AND NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.portal_documentos_oficiais'::regclass
           AND conname = 'fk_portal_documentos_versao_empresa'
    ) THEN
        ALTER TABLE public.portal_documentos_oficiais
            ADD CONSTRAINT fk_portal_documentos_versao_empresa
            FOREIGN KEY (versao_id, empresa_id)
            REFERENCES public.orcamento_versoes (id, empresa_id)
            ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN undefined_table OR invalid_foreign_key OR undefined_object THEN
    RAISE NOTICE 'FK versão/empresa do portal_documentos_oficiais adiada: %', SQLERRM;
END;
$$;

ALTER TABLE public.portal_documentos_oficiais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_documentos_oficiais FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.autoos_registrar_documento_oficial(
    p_empresa_id uuid,
    p_equipamento_id uuid,
    p_tipo text,
    p_versao_id uuid,
    p_atualizado_em timestamptz,
    p_caminho text,
    p_sha256 text,
    p_tamanho integer
) RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caminho text;
    v_cliente_id uuid;
BEGIN
    SELECT cliente_id INTO v_cliente_id
      FROM public.equipamentos
     WHERE id = p_equipamento_id
       AND empresa_id = p_empresa_id
       AND atualizado_em = p_atualizado_em
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DOCUMENTO_DESATUALIZADO';
    END IF;
    IF p_tipo <> 'ORDEM_SERVICO' AND to_regclass('public.orcamento_versoes') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
              FROM public.orcamento_versoes v
             WHERE v.id = p_versao_id
               AND v.empresa_id = p_empresa_id
               AND v.equipamento_id = p_equipamento_id
               AND v.id = (
                   SELECT n.id
                     FROM public.orcamento_versoes n
                    WHERE n.empresa_id = p_empresa_id
                      AND n.equipamento_id = p_equipamento_id
                    ORDER BY n.versao DESC NULLS LAST
                    LIMIT 1
               )
        ) THEN
            RAISE EXCEPTION 'DOCUMENTO_DESATUALIZADO';
        END IF;
    END IF;
    INSERT INTO public.portal_documentos_oficiais
        (empresa_id, equipamento_id, cliente_id, tipo, versao_id, caminho, sha256, tamanho_bytes, revisao_em)
    VALUES (
        p_empresa_id, p_equipamento_id, v_cliente_id, p_tipo, p_versao_id,
        p_caminho, p_sha256, p_tamanho, p_atualizado_em
    )
    ON CONFLICT (empresa_id, equipamento_id, cliente_chave, tipo, versao_chave) DO UPDATE
    SET caminho = EXCLUDED.caminho,
        sha256 = EXCLUDED.sha256,
        tamanho_bytes = EXCLUDED.tamanho_bytes,
        emitido_em = CURRENT_TIMESTAMP,
        revisao_em = EXCLUDED.revisao_em
    WHERE portal_documentos_oficiais.tipo = 'ORCAMENTO_AJUSTADO'
      AND portal_documentos_oficiais.revisao_em < EXCLUDED.revisao_em;
    SELECT caminho INTO v_caminho
      FROM public.portal_documentos_oficiais
     WHERE empresa_id = p_empresa_id
       AND equipamento_id = p_equipamento_id
       AND tipo = p_tipo
       AND cliente_chave = COALESCE(v_cliente_id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND versao_chave = COALESCE(p_versao_id, '00000000-0000-0000-0000-000000000000'::uuid);
    RETURN v_caminho;
END;
$$;

REVOKE ALL ON FUNCTION public.autoos_registrar_documento_oficial(uuid, uuid, text, uuid, timestamptz, text, text, integer)
    FROM PUBLIC, anon, authenticated;

-- Mesma regra do desktop: só a Edge Function (service_role) lê referências.
-- Sem portal_sessoes (porte do portal completo ainda pendente) a RPC recusa a sessão.
CREATE OR REPLACE FUNCTION public.portal_documentos_atendimento(p_sessao_hash text, p_equipamento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid;
    v_cliente_id uuid;
    v_docs jsonb;
BEGIN
    IF to_regclass('public.portal_sessoes') IS NULL THEN
        RAISE EXCEPTION 'SESSAO_INVALIDA';
    END IF;
    SELECT s.empresa_id, s.cliente_id
      INTO v_empresa_id, v_cliente_id
      FROM public.portal_sessoes s
     WHERE s.token_hash = p_sessao_hash
       AND s.encerrada_em IS NULL
       AND s.verificada_em IS NOT NULL
       AND s.expira_em > statement_timestamp();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'SESSAO_INVALIDA';
    END IF;
    IF to_regclass('public.portal_config_empresa') IS NOT NULL
       AND EXISTS (
            SELECT 1
              FROM public.portal_config_empresa c
             WHERE c.empresa_id = v_empresa_id
               AND COALESCE(c.portal_enabled, TRUE) IS FALSE
       ) THEN
        RAISE EXCEPTION 'PORTAL_PAUSADO';
    END IF;
    PERFORM 1
       FROM public.equipamentos
      WHERE id = p_equipamento_id
        AND empresa_id = v_empresa_id
        AND cliente_id = v_cliente_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ATENDIMENTO_INDISPONIVEL';
    END IF;
    IF to_regclass('public.orcamento_versoes') IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', d.id, 'tipo', d.tipo, 'versao', v.versao, 'caminho', d.caminho
        ) ORDER BY d.tipo, v.versao), '[]'::jsonb)
          INTO v_docs
          FROM public.portal_documentos_oficiais d
          LEFT JOIN public.orcamento_versoes v
            ON v.id = d.versao_id AND v.empresa_id = d.empresa_id
         WHERE d.empresa_id = v_empresa_id
           AND d.equipamento_id = p_equipamento_id
           AND d.cliente_id = v_cliente_id;
    ELSE
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', d.id, 'tipo', d.tipo, 'versao', NULL, 'caminho', d.caminho
        ) ORDER BY d.tipo), '[]'::jsonb)
          INTO v_docs
          FROM public.portal_documentos_oficiais d
         WHERE d.empresa_id = v_empresa_id
           AND d.equipamento_id = p_equipamento_id
           AND d.cliente_id = v_cliente_id;
    END IF;
    RETURN v_docs;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_documentos_atendimento(text, uuid)
    FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        REVOKE ALL ON public.portal_documentos_oficiais FROM service_role;
        GRANT EXECUTE ON FUNCTION public.portal_documentos_atendimento(text, uuid) TO service_role;
    END IF;
    IF to_regclass('storage.buckets') IS NOT NULL THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES ('portal-documentos', 'portal-documentos', FALSE, 15728640, ARRAY['application/pdf'])
        ON CONFLICT (id) DO UPDATE
        SET public = FALSE,
            file_size_limit = EXCLUDED.file_size_limit,
            allowed_mime_types = EXCLUDED.allowed_mime_types;
        DROP POLICY IF EXISTS portal_documentos_privados ON storage.objects;
        CREATE POLICY portal_documentos_privados ON storage.objects AS RESTRICTIVE FOR ALL
            TO anon, authenticated
            USING (bucket_id <> 'portal-documentos')
            WITH CHECK (bucket_id <> 'portal-documentos');
    END IF;
END;
$$;
