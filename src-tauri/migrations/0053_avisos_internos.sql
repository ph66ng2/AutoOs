-- Avisos internos do sino, calculados a partir dos dados (sem tabela de alertas): cada
-- linha tem uma `chave` estável; "lido" vem de notificacao_leituras (0052), por perfil.
-- Quem recebe cada tipo (decidido com o responsável do produto):
--   os-nova        técnico da OS (nome do perfil = "Técnico inicial" da entrada), nos 3 primeiros dias
--   vence-amanha   quem elabora orçamentos (p_orcamento), OS aguardando aprovação com prazo amanhã
--   pronto-parado  todos, OS pronta há 7 dias ou mais sem retirada
--   peca-chegou    estoque (p_estoque) e técnico da OS, OS aguardando peça cujas peças pendentes já têm estoque
--   estoque-baixo  estoque (p_estoque), um aviso só com os itens abaixo do mínimo
--   venda-aprovada financeiro (p_financeiro), venda de insumos aprovada nos últimos 7 dias
-- Função pura sobre as tabelas da empresa; o Rust só resolve empresa, perfil e permissões.
CREATE OR REPLACE FUNCTION public.avisos_internos(
    p_empresa_id INTEGER,
    p_profile_id INTEGER,
    p_nome_perfil TEXT,
    p_orcamento BOOLEAN,
    p_estoque BOOLEAN,
    p_financeiro BOOLEAN
)
RETURNS TABLE (
    chave TEXT,
    tipo TEXT,
    titulo TEXT,
    detalhe TEXT,
    equipamento_id INTEGER,
    venda_id INTEGER,
    quando TIMESTAMPTZ,
    lido BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
WITH perfil AS (
    -- Nome escapado para uso em expressão regular.
    SELECT regexp_replace(btrim(COALESCE(p_nome_perfil, '')), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') AS nome_re,
           lower(btrim(COALESCE(p_nome_perfil, ''))) AS nome
),
tecnico_os AS (
    SELECT e.id,
           (SELECT lower(btrim(v.tecnico_nome)) FROM verificacoes v
             WHERE v.equipamento_id = e.id AND v.empresa_id = e.empresa_id
             ORDER BY v.id DESC LIMIT 1) AS tecnico_verificacao
    FROM equipamentos e
    WHERE e.empresa_id = p_empresa_id AND e.status IN ('RECEBIDO', 'EM_VERIFICACAO', 'AGUARDANDO_PECA')
),
avisos AS (
    -- Nova OS sua
    SELECT 'os-nova:' || e.id AS chave, 'os-nova' AS tipo,
           'Nova OS para você: ' || btrim(e.marca || ' ' || COALESCE(e.modelo, '')) AS titulo,
           COALESCE(NULLIF(btrim(e.cliente_nome), ''), 'Sem cliente') || ' · ' || COALESCE(NULLIF(btrim(e.defeito_relatado), ''), 'sem defeito informado') AS detalhe,
           e.id AS equipamento_id, NULL::INTEGER AS venda_id, e.criado_em::TIMESTAMPTZ AS quando
    FROM equipamentos e, perfil p
    WHERE e.empresa_id = p_empresa_id
      AND e.status IN ('RECEBIDO', 'EM_VERIFICACAO')
      AND e.criado_em >= NOW() - INTERVAL '3 days'
      AND p.nome <> ''
      AND e.observacoes ~* ('(^|\n)Técnico inicial:[ \t]*' || p.nome_re || '[ \t]*(\(|\n|$)')

    UNION ALL
    -- Orçamento vence amanhã
    SELECT 'vence-amanha:' || e.id || ':' || substring(e.prazo_aprovacao FROM 1 FOR 10), 'vence-amanha',
           'Orçamento vence amanhã: ' || btrim(e.marca || ' ' || COALESCE(e.modelo, '')),
           COALESCE(NULLIF(btrim(e.cliente_nome), ''), 'Sem cliente') || ' ainda não respondeu',
           e.id, NULL, (CURRENT_DATE)::TIMESTAMPTZ
    FROM equipamentos e
    WHERE p_orcamento
      AND e.empresa_id = p_empresa_id
      AND e.status = 'AGUARDANDO_APROVACAO'
      AND e.prazo_aprovacao ~ '^\d{4}-\d{2}-\d{2}'
      AND substring(e.prazo_aprovacao FROM 1 FOR 10)::DATE = CURRENT_DATE + 1

    UNION ALL
    -- Pronto e não retirado há 7 dias
    SELECT 'pronto-parado:' || e.id || ':' || to_char(COALESCE(e.status_alterado_em, e.atualizado_em::TIMESTAMPTZ), 'YYYY-MM-DD'), 'pronto-parado',
           'Pronto há ' || (CURRENT_DATE - COALESCE(e.status_alterado_em, e.atualizado_em::TIMESTAMPTZ)::DATE) || ' dias sem retirada: ' || btrim(e.marca || ' ' || COALESCE(e.modelo, '')),
           COALESCE(NULLIF(btrim(e.cliente_nome), ''), 'Sem cliente'),
           e.id, NULL, COALESCE(e.status_alterado_em, e.atualizado_em::TIMESTAMPTZ) + INTERVAL '7 days'
    FROM equipamentos e
    WHERE e.empresa_id = p_empresa_id
      AND e.status = 'PRONTO'
      AND COALESCE(e.status_alterado_em, e.atualizado_em::TIMESTAMPTZ) <= NOW() - INTERVAL '7 days'

    UNION ALL
    -- Peça chegou: todas as peças pendentes da OS já têm estoque
    SELECT 'peca-chegou:' || e.id || ':' || to_char(CURRENT_DATE, 'YYYY-MM-DD'), 'peca-chegou',
           'Peça disponível: ' || btrim(e.marca || ' ' || COALESCE(e.modelo, '')),
           'As peças que faltavam já estão no estoque',
           e.id, NULL, NOW()
    FROM equipamentos e
    JOIN tecnico_os t ON t.id = e.id, perfil p
    WHERE e.empresa_id = p_empresa_id
      AND e.status = 'AGUARDANDO_PECA'
      AND (p_estoque OR (p.nome <> '' AND t.tecnico_verificacao = p.nome))
      AND EXISTS (
          SELECT 1 FROM orcamento_consumos c
          JOIN verificacoes v ON v.id = c.verificacao_id AND v.empresa_id = c.empresa_id
          WHERE v.equipamento_id = e.id AND c.empresa_id = e.empresa_id AND c.quantidade_baixada < c.quantidade_aprovada)
      AND NOT EXISTS (
          SELECT 1
          FROM orcamento_consumos c
          JOIN verificacoes v ON v.id = c.verificacao_id AND v.empresa_id = c.empresa_id
          JOIN produtos pr ON pr.id = c.produto_id AND pr.empresa_id = c.empresa_id
          WHERE v.equipamento_id = e.id AND c.empresa_id = e.empresa_id AND c.quantidade_baixada < c.quantidade_aprovada
          GROUP BY pr.id, pr.quantidade_estoque
          HAVING pr.quantidade_estoque < SUM(c.quantidade_aprovada - c.quantidade_baixada))

    UNION ALL
    -- Estoque baixo (um aviso para todos os itens; muda de chave quando a lista muda)
    SELECT 'estoque-baixo:' || md5(string_agg(pr.id || '=' || pr.quantidade_estoque, ',' ORDER BY pr.id)),
           'estoque-baixo',
           CASE WHEN COUNT(*) = 1 THEN '1 item com estoque baixo' ELSE COUNT(*) || ' itens com estoque baixo' END,
           string_agg(pr.nome, ', ' ORDER BY pr.quantidade_estoque, pr.nome),
           NULL, NULL, MAX(pr.atualizado_em)::TIMESTAMPTZ
    FROM produtos pr
    WHERE p_estoque
      AND pr.empresa_id = p_empresa_id
      AND pr.ativo
      AND pr.quantidade_minima > 0
      AND pr.quantidade_estoque <= pr.quantidade_minima
    HAVING COUNT(*) > 0

    UNION ALL
    -- Venda de insumos aprovada
    SELECT 'venda-aprovada:' || o.id, 'venda-aprovada',
           'Venda aprovada: OI-' || o.numero,
           'R$ ' || to_char(o.valor_total, 'FM999G999G990D00'),
           NULL, o.id, o.decidido_em
    FROM orcamentos_insumos o
    WHERE p_financeiro
      AND o.empresa_id = p_empresa_id
      AND o.status = 'APROVADO'
      AND o.decidido_em >= NOW() - INTERVAL '7 days'
)
SELECT a.chave, a.tipo, left(a.titulo, 200), left(a.detalhe, 600), a.equipamento_id, a.venda_id, a.quando,
       EXISTS (SELECT 1 FROM notificacao_leituras l
               WHERE l.empresa_id = p_empresa_id AND l.profile_id = p_profile_id AND l.chave = a.chave) AS lido
FROM avisos a
ORDER BY a.quando DESC NULLS LAST;
$$;
