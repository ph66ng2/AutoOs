-- Atualização ao vivo entre computadores: cada mudança nas tabelas que as telas mostram
-- dispara um aviso curto no canal `autoos_mudancas` (LISTEN/NOTIFY). Cada AutoOS aberto
-- escuta e recarrega em silêncio só a tela afetada (sem F5).
-- O aviso nunca leva dados do cliente, só onde mudou:
--   {"e": empresa_id, "t": tabela, "id": id da linha, "ref": id do pai, "op": "I" | "U" | "D"}
--   ref: verificacoes → equipamento_id; cliente_contatos → cliente_id; demais → null.
-- O PostgreSQL entrega na hora do COMMIT e junta avisos idênticos da mesma transação.
-- Requer conexão de sessão (Supavisor Session, porta 5432): no modo Transaction (6543) o
-- LISTEN não funciona e o app fica só com a atualização ao voltar o foco.
CREATE OR REPLACE FUNCTION public.avisar_mudanca()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    linha JSONB;
BEGIN
    linha := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
    IF linha->>'empresa_id' IS NULL THEN
        RETURN NULL;
    END IF;
    PERFORM pg_notify('autoos_mudancas', json_build_object(
        'e', (linha->>'empresa_id')::INTEGER,
        't', TG_TABLE_NAME,
        'id', (linha->>'id')::BIGINT,
        'ref', CASE TG_TABLE_NAME
                 WHEN 'verificacoes' THEN (linha->>'equipamento_id')::BIGINT
                 WHEN 'cliente_contatos' THEN (linha->>'cliente_id')::BIGINT
                 ELSE NULL
               END,
        'op', left(TG_OP, 1)
    )::TEXT);
    RETURN NULL;
END;
$$;

DO $$
DECLARE
    tabela TEXT;
BEGIN
    FOREACH tabela IN ARRAY ARRAY[
        'equipamentos', 'verificacoes', 'clientes', 'cliente_contatos',
        'produtos', 'orcamentos_insumos', 'servicos_catalogo'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_avisar_mudanca ON public.%I', tabela);
        EXECUTE format(
            'CREATE TRIGGER trg_avisar_mudanca AFTER INSERT OR UPDATE OR DELETE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.avisar_mudanca()', tabela);
    END LOOP;
END;
$$;
