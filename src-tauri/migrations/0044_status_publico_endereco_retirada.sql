-- 0044: endereço de retirada no link público de status (#/c/).
--
-- A Edge Function public-status lê links_status_publico e equipamentos pelo REST
-- com GRANT por coluna. portal_contato_empresa não é legível pelo service_role
-- (0035), então o endereço só chega por esta função, que valida o próprio link:
-- hash conhecido, não revogado, não expirado e equipamento em PRONTO.
-- Em qualquer outro caso o resultado é NULL. Só nome de exibição, endereço e
-- URL do mapa são devolvidos (sem horário, WhatsApp ou e-mail).
-- Somente função: nenhuma tabela ou coluna nova. Idempotente.

CREATE OR REPLACE FUNCTION public.status_publico_retirada(p_token_hash TEXT)
RETURNS JSONB
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

REVOKE ALL ON FUNCTION public.status_publico_retirada(TEXT) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.status_publico_retirada(TEXT) FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.status_publico_retirada(TEXT) FROM authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.status_publico_retirada(TEXT) FROM service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.status_publico_retirada(TEXT) TO service_role';
    END IF;
END;
$$;
