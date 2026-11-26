-- Preferências de aviso por perfil (Perfil › Notificações): tipos que a pessoa não quer
-- receber no sino. Vazio = recebe tudo. Vale em qualquer computador.
-- Tipos: 'portal' (alertas do portal) e os de avisos_internos (0053).
ALTER TABLE public.security_profiles
    ADD COLUMN IF NOT EXISTS avisos_desligados TEXT[] NOT NULL DEFAULT '{}';
