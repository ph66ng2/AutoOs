-- Dados sintéticos para screenshots de UI.
-- Só pode rodar no banco local descartável test_autoos, depois das migrations.
-- Não contém segredo, cliente real nem URL de produção.
-- O marcador CI-UI-SCREENSHOT / prefixo CI-UI- identifica as linhas exportadas para o mock.

INSERT INTO empresas (nome, email, cnpj, status)
VALUES (
    'Oficina Sintética CI',
    'ci-ui-screenshot@example.invalid',
    '00000000000191',
    'ativo'
);

INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, empresa_id, pin_required)
SELECT
    perfil.nome,
    perfil.role,
    perfil.permissions,
    true,
    false,
    empresa.id,
    true
FROM empresas AS empresa
CROSS JOIN (
    VALUES
        (
            'CI Admin Screenshot',
            'ADMIN',
            '["CONFIG_SMTP","CONFIG_WHATSAPP","DELETE_RECORDS","FINANCIAL_ACTIONS","STOCK_CONTROL","MANAGE_PROFILES","MANAGE_STATUS_LINKS","VIEW_EXPENSES"]'
        ),
        (
            'CI Tecnico Screenshot',
            'TECNICO',
            '["STOCK_CONTROL"]'
        ),
        (
            'CI Atendente Screenshot',
            'ATENDENTE',
            '[]'
        )
) AS perfil(nome, role, permissions)
WHERE empresa.email = 'ci-ui-screenshot@example.invalid';

INSERT INTO clientes (
    nome,
    tipo_pessoa,
    documento,
    razao_social,
    nome_fantasia,
    cpf_cnpj,
    telefone,
    email,
    cidade,
    uf,
    observacoes,
    ativo,
    empresa_id,
    criado_em,
    atualizado_em
)
SELECT
    cliente.nome,
    cliente.tipo_pessoa,
    cliente.documento,
    cliente.razao_social,
    cliente.nome_fantasia,
    cliente.documento,
    cliente.telefone,
    cliente.email,
    'Salvador',
    'BA',
    'CI-UI-SCREENSHOT',
    true,
    empresa.id,
    TIMESTAMP '2026-09-01 12:00:00',
    TIMESTAMP '2026-09-17 15:00:00'
FROM empresas AS empresa
CROSS JOIN (
    VALUES
        (
            'Oficina do Porto Sintética',
            'PJ',
            '11222333000181',
            'Oficina do Porto Sintética Ltda',
            'Oficina do Porto Sintética',
            '7130001111',
            'porto.ci@example.invalid'
        ),
        (
            'Marina Screenshot',
            'PF',
            '39053344705',
            NULL,
            NULL,
            '7190002222',
            'marina.ci@example.invalid'
        )
) AS cliente(nome, tipo_pessoa, documento, razao_social, nome_fantasia, telefone, email)
WHERE empresa.email = 'ci-ui-screenshot@example.invalid';

INSERT INTO equipamentos (
    serial_number,
    patrimonio,
    marca,
    modelo,
    tipo,
    status,
    defeito_relatado,
    data_entrada,
    cliente_id,
    cliente_nome,
    cliente_telefone,
    cliente_email,
    valor_orcamento,
    empresa_id,
    criado_em,
    atualizado_em
)
SELECT
    equipamento.serial_number,
    equipamento.patrimonio,
    equipamento.marca,
    equipamento.modelo,
    'Impressora de etiquetas',
    equipamento.status,
    equipamento.defeito_relatado,
    '2026-09-10',
    cliente.id,
    cliente.nome_fantasia,
    cliente.telefone,
    cliente.email,
    equipamento.valor_orcamento,
    empresa.id,
    TIMESTAMP '2026-09-10 09:00:00',
    equipamento.atualizado_em
FROM empresas AS empresa
JOIN clientes AS cliente
  ON cliente.empresa_id = empresa.id
 AND cliente.documento = '11222333000181'
CROSS JOIN (
    VALUES
        (
            'CI-UI-ZD620',
            'CI-PAT-620',
            'Zebra',
            'ZD620',
            'EM_MANUTENCAO',
            'Não imprime etiquetas após a troca do ribbon.',
            180.00,
            TIMESTAMP '2026-09-17 15:00:00'
        ),
        (
            'CI-UI-GC420',
            'CI-PAT-420',
            'Zebra',
            'GC420t',
            'AGUARDANDO_APROVACAO',
            'Sensor de gap descalibrado.',
            240.00,
            TIMESTAMP '2026-09-16 11:00:00'
        ),
        (
            'CI-UI-ZT411',
            'CI-PAT-411',
            'Zebra',
            'ZT411',
            'RECEBIDO',
            'Chegou sem imprimir o teste de entrada.',
            NULL,
            TIMESTAMP '2026-09-15 08:30:00'
        )
) AS equipamento(serial_number, patrimonio, marca, modelo, status, defeito_relatado, valor_orcamento, atualizado_em)
WHERE empresa.email = 'ci-ui-screenshot@example.invalid';

INSERT INTO produtos (
    codigo,
    nome,
    descricao,
    categoria,
    quantidade_estoque,
    quantidade_minima,
    quantidade_maxima,
    unidade_medida,
    preco_custo,
    preco_venda,
    ativo,
    empresa_id,
    criado_em,
    atualizado_em
)
SELECT
    produto.codigo,
    produto.nome,
    'Item sintético para screenshot de estoque. CI-UI-SCREENSHOT',
    produto.categoria,
    produto.quantidade_estoque,
    produto.quantidade_minima,
    50,
    'UN',
    produto.preco,
    produto.preco,
    true,
    empresa.id,
    TIMESTAMP '2026-09-01 12:00:00',
    TIMESTAMP '2026-09-17 15:00:00'
FROM empresas AS empresa
CROSS JOIN (
    VALUES
        ('CI-UI-RIBBON', 'Ribbon sintético CI', 'RIBBON', 1, 5, 45.00),
        ('CI-UI-ETQ', 'Etiqueta sintética CI', 'ETIQUETA', 20, 5, 12.50)
) AS produto(codigo, nome, categoria, quantidade_estoque, quantidade_minima, preco)
WHERE empresa.email = 'ci-ui-screenshot@example.invalid';

INSERT INTO portal_config_empresa (empresa_id, portal_enabled, respostas_enabled)
SELECT id, true, true
FROM empresas
WHERE email = 'ci-ui-screenshot@example.invalid';

INSERT INTO portal_contato_empresa (empresa_id, nome_exibicao, whatsapp, email, telefone, horario)
SELECT id, 'Recepção Sintética CI', '71988887777', 'recepcao.ci@example.invalid', '7133330000', 'Seg a sex, 8h às 18h'
FROM empresas
WHERE email = 'ci-ui-screenshot@example.invalid';
