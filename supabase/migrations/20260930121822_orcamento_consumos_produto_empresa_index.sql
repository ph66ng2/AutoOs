CREATE INDEX IF NOT EXISTS idx_orcamento_consumos_produto_empresa
    ON public.orcamento_consumos (empresa_id, produto_id);
