-- Execute somente no projeto Supabase de staging aprovado.
-- O bucket é privado: o navegador recebe somente URLs assinadas da Edge Function.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('photo-upload-staging', 'photo-upload-staging', false, 10485760, ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
-- Não crie políticas para anon/authenticated. A chave de serviço fica somente na função.
