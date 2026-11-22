-- Evita perfis visualmente iguais na mesma empresa, inclusive sob concorrência.
CREATE UNIQUE INDEX IF NOT EXISTS ux_security_profiles_empresa_nome_ci
    ON public.security_profiles (empresa_id, lower(btrim(nome)));
