-- Porte SaaS (mínimo) do que 0043/0044 do desktop alteram:
--   * orcamento_aceite_config (0031): chave de ativação e janela de correção.
--     Nasce com o piso antigo (15); a migration seguinte baixa para 10, como a 0043.
--   * portal_contato_empresa (0035 + 0039): cartão de contato com endereço de retirada.
-- Não cria o restante do portal do cliente (versões, respostas, sessões, alertas).
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.orcamento_aceite_config (
    singleton boolean PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    online_enabled boolean NOT NULL DEFAULT FALSE,
    janela_correcao_minutos integer NOT NULL DEFAULT 15
        CHECK (janela_correcao_minutos BETWEEN 15 AND 1440),
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO public.orcamento_aceite_config (singleton, online_enabled)
VALUES (TRUE, FALSE)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.portal_contato_empresa (
    empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome_exibicao text NOT NULL DEFAULT 'Empresa',
    whatsapp text,
    email text,
    telefone text,
    horario text,
    endereco text,
    maps_url text,
    atualizado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_portal_contato_whatsapp CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]{10,15}$'),
    CONSTRAINT chk_portal_contato_textos CHECK (
        char_length(nome_exibicao) BETWEEN 1 AND 80
        AND char_length(COALESCE(email, '')) <= 120
        AND char_length(COALESCE(telefone, '')) <= 40
        AND char_length(COALESCE(horario, '')) <= 120
    ),
    CONSTRAINT chk_portal_contato_endereco CHECK (char_length(COALESCE(endereco, '')) <= 300),
    CONSTRAINT chk_portal_contato_maps_url
        CHECK (maps_url IS NULL OR (maps_url ~* '^https://[^[:space:]]+$' AND char_length(maps_url) <= 500))
);

ALTER TABLE public.orcamento_aceite_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_contato_empresa ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.orcamento_aceite_config, public.portal_contato_empresa
    FROM PUBLIC, anon, authenticated;

-- A empresa lê o próprio cartão. A escrita vem com a tela de configuração do portal (fora deste porte).
DROP POLICY IF EXISTS portal_contato_empresa_leitura ON public.portal_contato_empresa;
CREATE POLICY portal_contato_empresa_leitura ON public.portal_contato_empresa
    FOR SELECT TO authenticated
    USING (empresa_id = (SELECT public.current_company_id()));
GRANT SELECT ON TABLE public.portal_contato_empresa TO authenticated;

-- Como no desktop, portal_contato_empresa não é legível pelo service_role:
-- o endereço público só sai por status_publico_retirada (SECURITY DEFINER).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.portal_contato_empresa FROM service_role';
        EXECUTE 'REVOKE ALL ON TABLE public.orcamento_aceite_config FROM service_role';
        EXECUTE 'GRANT SELECT ON TABLE public.orcamento_aceite_config TO service_role';
    END IF;
END;
$$;
