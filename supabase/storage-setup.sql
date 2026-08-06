-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase/storage-setup.sql — Configuração do Storage para imagens de equipamento
-- ═══════════════════════════════════════════════════════════════════════════════
-- Cria o bucket público (ou privado com políticas de acesso) para armazenar
-- imagens de equipamentos (entrada, saída, verificação).
--
-- Executar via SQL Editor do Supabase Dashboard ou via CLI:
--   supabase db push
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Criar bucket (idempotente via IF NOT EXISTS no Dashboard) ─────────────────
-- Nota: CREATE BUCKET não é SQL puro — execute via Storage API ou Dashboard.
-- O comando abaixo é referência para execução via Supabase Management API / CLI.

-- via Supabase CLI:
-- supabase storage bucket create equipamento-imagens --public

-- ─── Políticas de acesso ao bucket (via SQL ou Dashboard) ──────────────────────
-- Se o bucket for público, qualquer um com a URL pode ler.
-- Para controle por empresa, use políticas de RLS no bucket.

-- Política de leitura pública (se bucket for público):
-- policy name: "Allow public read"
-- definition: true

-- Política de upload restrito a authenticated users da empresa:
-- policy name: "Allow authenticated upload"
-- definition: auth.role() = 'authenticated'

-- Política de delete restrito ao dono do arquivo:
-- policy name: "Allow owner delete"
-- definition: auth.uid() = owner

-- ─── Estrutura de pastas sugerida no bucket ────────────────────────────────────
-- equipamento-imagens/
--   {empresa_id}/
--     {equipamento_id}/
--       entrada/
--       saida/
--       verificacao/
