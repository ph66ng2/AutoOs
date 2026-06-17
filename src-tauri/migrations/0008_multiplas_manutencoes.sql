-- Migration 0008: Remove UNIQUE constraint on serial_number
-- Permite que o mesmo equipamento físico tenha múltiplos registros
-- de manutenção (ciclos de serviço) na tabela equipamentos.

ALTER TABLE equipamentos DROP CONSTRAINT IF EXISTS equipamentos_serial_number_key;
