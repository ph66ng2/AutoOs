-- Porte SaaS de src-tauri/migrations/0044_status_publico_endereco_retirada.sql.
-- A Edge Function public-status (supabase/functions/public-status/index.ts) chama
-- esta função com a chave de serviço. Valida o próprio link: hash conhecido, não
-- revogado, não expirado e equipamento em PRONTO; senão devolve NULL. Só nome de
-- exibição, endereço e URL do mapa saem. Idempotente.

CREATE OR REPLACE FUNCTION public.status_publico_retirada(p_token_hash text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT jsonb_build_object(
        'nome', pc.nome_exibicao,
        'endereco', left(btrim(pc.endereco), 300),
        'mapsUrl', pc.maps_url
    )
    FROM public.links_status_publico l
    JOIN public.equipamentos e
        ON e.id = l.equipamento_id AND e.empresa_id = l.empresa_id
    JOIN public.portal_contato_empresa pc
        ON pc.empresa_id = l.empresa_id
    WHERE l.token_hash = p_token_hash
      AND l.revogado_em IS NULL
      AND l.expira_em > statement_timestamp()
      AND e.status = 'PRONTO'
      AND NULLIF(btrim(pc.endereco), '') IS NOT NULL
    LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.status_publico_retirada(text) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.status_publico_retirada(text) FROM service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.status_publico_retirada(text) TO service_role';
    END IF;
END;
$$;
