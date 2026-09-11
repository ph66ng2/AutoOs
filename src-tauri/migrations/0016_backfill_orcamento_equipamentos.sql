-- Migration 0016: sincroniza orçamentos antigos gravados apenas na verificação.
-- O valor principal do equipamento é usado na listagem, aprovações e PDFs.
-- Não sobrescreve valores já definidos manualmente no equipamento.

UPDATE equipamentos AS e
SET valor_orcamento = latest.custo_total
FROM (
    SELECT DISTINCT ON (equipamento_id)
        equipamento_id,
        custo_total
    FROM verificacoes
    WHERE custo_total IS NOT NULL
      AND custo_total > 0
    ORDER BY equipamento_id, id DESC
) AS latest
WHERE e.id = latest.equipamento_id
  AND e.valor_orcamento IS NULL;
