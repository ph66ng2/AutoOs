-- 0045 e 0046 reservadas pelos PRs #184/#185; não copiar migrations da linha SaaS.
CREATE TABLE IF NOT EXISTS public.portal_documentos_oficiais (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL,
    equipamento_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('ORDEM_SERVICO', 'ORCAMENTO', 'ORCAMENTO_AJUSTADO')),
    versao_id BIGINT,
    versao_chave BIGINT GENERATED ALWAYS AS (COALESCE(versao_id, 0)) STORED,
    caminho TEXT NOT NULL,
    sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    tamanho_bytes INTEGER NOT NULL CHECK (tamanho_bytes BETWEEN 5 AND 15728640),
    revisao_em TIMESTAMPTZ NOT NULL,
    emitido_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, empresa_id),
    UNIQUE (empresa_id, equipamento_id, tipo, versao_chave),
    FOREIGN KEY (equipamento_id, empresa_id) REFERENCES public.equipamentos(id, empresa_id) ON DELETE CASCADE,
    FOREIGN KEY (versao_id, empresa_id) REFERENCES public.orcamento_versoes(id, empresa_id) ON DELETE CASCADE,
    CHECK ((tipo = 'ORDEM_SERVICO') = (versao_id IS NULL)),
    CHECK (caminho = empresa_id::TEXT || '/' || equipamento_id::TEXT || '/' || tipo || '/' ||
        COALESCE(versao_id, 0)::TEXT || '/' || sha256 || '.pdf')
);
ALTER TABLE public.portal_documentos_oficiais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_documentos_oficiais FROM PUBLIC;

-- O desktop usa PostgreSQL autenticado; nenhum cliente público registra referências.
CREATE OR REPLACE FUNCTION public.autoos_registrar_documento_oficial(
    p_empresa_id INTEGER, p_equipamento_id INTEGER, p_tipo TEXT, p_versao_id BIGINT,
    p_atualizado_em TIMESTAMPTZ, p_caminho TEXT, p_sha256 TEXT, p_tamanho INTEGER
) RETURNS TEXT LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_caminho TEXT;
BEGIN
    PERFORM 1 FROM public.equipamentos
    WHERE id = p_equipamento_id AND empresa_id = p_empresa_id AND atualizado_em = p_atualizado_em
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DOCUMENTO_DESATUALIZADO'; END IF;
    IF p_tipo <> 'ORDEM_SERVICO' AND NOT EXISTS (
        SELECT 1 FROM public.orcamento_versoes v WHERE v.id = p_versao_id
        AND v.empresa_id = p_empresa_id AND v.equipamento_id = p_equipamento_id
        AND v.id = (SELECT max(n.id) FROM public.orcamento_versoes n
                    WHERE n.empresa_id = p_empresa_id AND n.equipamento_id = p_equipamento_id)
    ) THEN RAISE EXCEPTION 'DOCUMENTO_DESATUALIZADO'; END IF;
    INSERT INTO public.portal_documentos_oficiais
        (empresa_id, equipamento_id, tipo, versao_id, caminho, sha256, tamanho_bytes, revisao_em)
    VALUES (p_empresa_id, p_equipamento_id, p_tipo, p_versao_id, p_caminho, p_sha256, p_tamanho, p_atualizado_em)
    ON CONFLICT (empresa_id, equipamento_id, tipo, versao_chave) DO UPDATE
    SET caminho = EXCLUDED.caminho, sha256 = EXCLUDED.sha256,
        tamanho_bytes = EXCLUDED.tamanho_bytes, emitido_em = CURRENT_TIMESTAMP, revisao_em = EXCLUDED.revisao_em
    WHERE portal_documentos_oficiais.tipo = 'ORCAMENTO_AJUSTADO'
        AND portal_documentos_oficiais.revisao_em < EXCLUDED.revisao_em;
    -- OS e orçamento original são canônicos: reenvios usam exatamente o primeiro arquivo publicado.
    SELECT caminho INTO v_caminho FROM public.portal_documentos_oficiais
    WHERE empresa_id=p_empresa_id AND equipamento_id=p_equipamento_id AND tipo=p_tipo
        AND versao_chave=COALESCE(p_versao_id,0);
    RETURN v_caminho;
END;
$$;
REVOKE ALL ON FUNCTION public.autoos_registrar_documento_oficial(INTEGER, INTEGER, TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, INTEGER) FROM PUBLIC;

-- SECURITY DEFINER necessário para as sessões próprias do portal (não são Supabase Auth).
-- Só a Edge Function, com service_role, pode chamar. Revalida sessão, pausa, empresa e cliente.
CREATE OR REPLACE FUNCTION public.portal_documentos_atendimento(p_sessao_hash TEXT, p_equipamento_id INTEGER)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_s RECORD; v_docs JSONB;
BEGIN
    SELECT * INTO v_s FROM public.autoos_portal_sessao(p_sessao_hash);
    PERFORM 1 FROM public.equipamentos WHERE id = p_equipamento_id
        AND empresa_id = v_s.s_empresa_id AND cliente_id = v_s.s_cliente_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATENDIMENTO_INDISPONIVEL'; END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id, 'tipo', d.tipo, 'versao', v.versao, 'caminho', d.caminho
    ) ORDER BY d.tipo, v.versao), '[]'::JSONB) INTO v_docs
    FROM public.portal_documentos_oficiais d
    LEFT JOIN public.orcamento_versoes v ON v.id = d.versao_id AND v.empresa_id = d.empresa_id
    WHERE d.empresa_id = v_s.s_empresa_id AND d.equipamento_id = p_equipamento_id;
    RETURN v_docs;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_documentos_atendimento(TEXT, INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON public.portal_documentos_oficiais FROM anon, authenticated;
        REVOKE ALL ON FUNCTION public.autoos_registrar_documento_oficial(INTEGER, INTEGER, TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, INTEGER) FROM anon, authenticated;
        REVOKE ALL ON FUNCTION public.portal_documentos_atendimento(TEXT, INTEGER) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.portal_documentos_atendimento(TEXT, INTEGER) TO service_role;
    END IF;
    -- Banco local sem extensão Storage pode validar as funções e a tabela normalmente.
    IF to_regclass('storage.buckets') IS NOT NULL THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES ('portal-documentos', 'portal-documentos', FALSE, 15728640, ARRAY['application/pdf'])
        ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit,
            allowed_mime_types = EXCLUDED.allowed_mime_types;
        -- A política restritiva bloqueia inclusive políticas permissivas genéricas preexistentes.
        DROP POLICY IF EXISTS portal_documentos_privados ON storage.objects;
        CREATE POLICY portal_documentos_privados ON storage.objects AS RESTRICTIVE FOR ALL
            TO anon, authenticated USING (bucket_id <> 'portal-documentos')
            WITH CHECK (bucket_id <> 'portal-documentos');
    END IF;
END;
$$;
