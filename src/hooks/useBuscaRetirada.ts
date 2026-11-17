import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { juntarFilaRetirada, type ItemRetirada } from "@/lib/retirada-balcao";
import type { Equipamento, OrcamentoInsumos, StatusOrcamentoInsumos } from "@/types";

/** Vendas que ainda aparecem na busca de retirada; as encerradas ficam de fora. */
export const STATUS_VENDA_BUSCA_RETIRADA: StatusOrcamentoInsumos[] = ["RASCUNHO", "ENVIADO", "APROVADO"];

/**
 * Todas as vendas de um status que batem com a busca. O filtro de status vai ao
 * servidor (antes da paginação) e as páginas seguintes são buscadas quando o
 * total passa de uma página, para uma venda aprovada mais antiga não sumir atrás
 * de orçamentos mais novos.
 */
async function vendasDoStatus(busca: string, status: StatusOrcamentoInsumos): Promise<OrcamentoInsumos[]> {
  const primeira = await db.listarOrcamentosInsumos({ busca, status, page: 0 });
  const itens = primeira?.items ?? [];
  const tamanhoPagina = itens.length;
  const total = primeira?.total ?? 0;
  if (tamanhoPagina === 0 || total <= tamanhoPagina) return itens;
  const paginas = Math.ceil(total / tamanhoPagina);
  const restantes = await Promise.all(
    Array.from({ length: paginas - 1 }, (_, i) => db.listarOrcamentosInsumos({ busca, status, page: i + 1 })),
  );
  return [...itens, ...restantes.flatMap((pagina) => pagina?.items ?? [])];
}

/**
 * Busca do Balcão para entregar ao cliente: equipamentos e vendas de insumos
 * (também por OI-n). Busca com 2 caracteres ou mais, 250 ms depois da digitação.
 */
export function useBuscaRetirada(termo: string) {
  const [data, setData] = useState<ItemRetirada[]>([]);
  const [loading, setLoading] = useState(false);
  const query = termo.trim();

  useEffect(() => {
    if (query.length < 2) {
      setData([]);
      setLoading(false);
      return;
    }
    let ativo = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      // Uma das buscas falhar não esconde a outra.
      const equipamentos = Promise.resolve()
        .then(() => db.listarEquipamentos(query))
        .then((items) => items ?? [])
        .catch(() => [] as Equipamento[]);
      const vendas = Promise.all(
        STATUS_VENDA_BUSCA_RETIRADA.map((status) =>
          Promise.resolve()
            .then(() => vendasDoStatus(query, status))
            .catch(() => [] as OrcamentoInsumos[]),
        ),
      ).then((listas) => listas.flat());
      void Promise.all([equipamentos, vendas])
        .then(([eqs, vds]) => {
          if (ativo) setData(juntarFilaRetirada(eqs, vds));
        })
        .finally(() => {
          if (ativo) setLoading(false);
        });
    }, 250);
    return () => {
      ativo = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  return { data, loading, buscando: query.length >= 2 };
}
