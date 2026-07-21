-- Torna telefone opcional na tabela clientes
ALTER TABLE clientes ALTER COLUMN telefone DROP NOT NULL;
