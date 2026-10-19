-- Exporta só as linhas sintéticas de screenshot para o mock de IPC.
-- Uma única linha JSON na stdout. Não lê segredo nem host remoto.

SELECT json_build_object(
    'marker', 'CI-UI-SCREENSHOT',
    'empresa', (
        SELECT json_build_object('id', id, 'nome', nome)
        FROM empresas
        WHERE email = 'ci-ui-screenshot@example.invalid'
    ),
    'profiles', COALESCE((
        SELECT json_agg(json_build_object(
            'id', id,
            'nome', nome,
            'role', role,
            'permissions', permissions::jsonb,
            'pin_configured', true,
            'pin_required', pin_required,
            'is_default', nome = 'CI Admin Screenshot',
            'ativo', ativo
        ) ORDER BY id)
        FROM security_profiles
        WHERE nome IN ('CI Admin Screenshot', 'CI Tecnico Screenshot', 'CI Atendente Screenshot')
    ), '[]'::json),
    'clientes', COALESCE((
        SELECT json_agg(json_build_object(
            'id', id,
            'empresa_id', empresa_id,
            'tipo_pessoa', tipo_pessoa,
            'nome', nome,
            'razao_social', razao_social,
            'nome_fantasia', nome_fantasia,
            'documento', documento,
            'cpf_cnpj', cpf_cnpj,
            'telefone', telefone,
            'email', email,
            'cidade', cidade,
            'uf', uf,
            'ativo', ativo,
            'observacoes', observacoes,
            'criado_em', to_char(criado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'atualizado_em', to_char(atualizado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ) ORDER BY id)
        FROM clientes
        WHERE observacoes = 'CI-UI-SCREENSHOT'
    ), '[]'::json),
    'equipamentos', COALESCE((
        SELECT json_agg(json_build_object(
            'id', id,
            'empresa_id', empresa_id,
            'serial_number', serial_number,
            'patrimonio', patrimonio,
            'marca', marca,
            'modelo', modelo,
            'tipo', tipo,
            'status', status,
            'defeito_relatado', defeito_relatado,
            'data_entrada', data_entrada,
            'cliente_id', cliente_id,
            'cliente_nome', cliente_nome,
            'cliente_telefone', cliente_telefone,
            'cliente_email', cliente_email,
            'valor_orcamento', valor_orcamento,
            'criado_em', to_char(criado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'atualizado_em', to_char(atualizado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ) ORDER BY atualizado_em DESC, id DESC)
        FROM equipamentos
        WHERE serial_number LIKE 'CI-UI-%'
    ), '[]'::json),
    'produtos', COALESCE((
        SELECT json_agg(json_build_object(
            'id', id,
            'empresa_id', empresa_id,
            'codigo', codigo,
            'nome', nome,
            'descricao', descricao,
            'categoria', categoria,
            'quantidade_estoque', quantidade_estoque,
            'quantidade_minima', quantidade_minima,
            'quantidade_maxima', quantidade_maxima,
            'unidade_medida', unidade_medida,
            'preco_custo', preco_custo,
            'preco_venda', preco_venda,
            'ativo', ativo
        ) ORDER BY nome)
        FROM produtos
        WHERE codigo LIKE 'CI-UI-%'
    ), '[]'::json),
    'portal', (
        SELECT json_build_object(
            'portalAtivo', config.portal_enabled,
            'respostasAtivas', config.respostas_enabled,
            'respostasAtrasadas', 0,
            'contato', json_build_object(
                'nomeExibicao', contato.nome_exibicao,
                'whatsapp', contato.whatsapp,
                'email', contato.email,
                'telefone', contato.telefone,
                'horario', contato.horario
            )
        )
        FROM empresas AS empresa
        JOIN portal_config_empresa AS config ON config.empresa_id = empresa.id
        JOIN portal_contato_empresa AS contato ON contato.empresa_id = empresa.id
        WHERE empresa.email = 'ci-ui-screenshot@example.invalid'
    ),
    'database_name', current_database()
)::text;
