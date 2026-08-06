-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase/seed.sql — Dados iniciais para AutoOS no Supabase
-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Empresa padrão (BMITAG)
-- 2. Configurações de sistema (singleton)
-- 3. Perfil de segurança Administrador
-- 4. Categorias de referência para gastos_fixos
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Empresa padrão ─────────────────────────────────────────────────────────
INSERT INTO empresas (id, nome, cnpj, ativo)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'BMITAG',
    NULL,
    true
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Configurações de sistema (singleton — UUID fixo) ───────────────────────
INSERT INTO configuracoes_sistema (id, empresa_id, inactivity_lock_enabled)
VALUES (
    '00000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    false
)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. Perfil de segurança Administrador ─────────────────────────────────────
INSERT INTO security_profiles (
    id,
    empresa_id,
    nome,
    role,
    permissions,
    ativo,
    is_default
)
VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Administrador',
    'ADMIN',
    '["CONFIG_SMTP","CONFIG_WHATSAPP","DELETE_RECORDS","FINANCIAL_ACTIONS","STOCK_CONTROL","MANAGE_PROFILES","VIEW_EXPENSES"]',
    true,
    true
)
ON CONFLICT (nome) DO NOTHING;

-- ─── 4. Categorias de referência para gastos_fixos ─────────────────────────────
-- Categorias padrão como linhas inativas com valor zero,
-- servindo como referência para o campo categoria em ambas as tabelas de gastos.

INSERT INTO gastos_fixos (id, empresa_id, nome, valor, vencimento_dia, categoria, ativo)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001'::uuid, 'Aluguel', 0, NULL, 'Aluguel', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Aluguel' AND empresa_id = '00000000-0000-0000-0000-000000000001'::uuid);

INSERT INTO gastos_fixos (id, empresa_id, nome, valor, vencimento_dia, categoria, ativo)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001'::uuid, 'Energia', 0, NULL, 'Energia', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Energia' AND empresa_id = '00000000-0000-0000-0000-000000000001'::uuid);

INSERT INTO gastos_fixos (id, empresa_id, nome, valor, vencimento_dia, categoria, ativo)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001'::uuid, 'Internet', 0, NULL, 'Internet', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Internet' AND empresa_id = '00000000-0000-0000-0000-000000000001'::uuid);

INSERT INTO gastos_fixos (id, empresa_id, nome, valor, vencimento_dia, categoria, ativo)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001'::uuid, 'Fornecedores', 0, NULL, 'Fornecedores', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Fornecedores' AND empresa_id = '00000000-0000-0000-0000-000000000001'::uuid);

INSERT INTO gastos_fixos (id, empresa_id, nome, valor, vencimento_dia, categoria, ativo)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001'::uuid, 'Folha', 0, NULL, 'Folha', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Folha' AND empresa_id = '00000000-0000-0000-0000-000000000001'::uuid);

INSERT INTO gastos_fixos (id, empresa_id, nome, valor, vencimento_dia, categoria, ativo)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001'::uuid, 'Outros', 0, NULL, 'Outros', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Outros' AND empresa_id = '00000000-0000-0000-0000-000000000001'::uuid);
