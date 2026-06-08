-- Migration 0007: Adiciona categoria VERIFICACAO para imagens de equipamento
-- Usada no dialog de VerificacaoTecnica para registrar fotos durante a verificacao tecnica

ALTER TABLE equipamento_imagens DROP CONSTRAINT IF EXISTS chk_equipamento_imagens_categoria;
ALTER TABLE equipamento_imagens ADD CONSTRAINT chk_equipamento_imagens_categoria
    CHECK (categoria IN ('ENTRADA', 'SAIDA', 'VERIFICACAO'));
