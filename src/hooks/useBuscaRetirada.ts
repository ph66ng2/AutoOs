import { useCallback, useEffect, useRef, useState } from "react";
import { useAtualizacaoAoVivo } from "@/hooks/useAtualizacaoAoVivo";
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
async function vendasDoStatus(
  busca: string,
  status: StatusOrcamentoInsumos,
  segundoPlano: boolean,
): Promise<OrcamentoInsumos[]> {
  const primeira = await db.listarOrcamentosInsumos({ busca, status, page: 0 }, segundoPlano);
  const itens = primeira?.items ?? [];
  const tamanhoPagina = itens.length;
  const total = primeira?.total ?? 0;
  if (tamanhoPagina === 0 || total <= tamanhoPagina) return itens;
  const paginas = Math.ceil(total / tamanhoPagina);
  const restantes = await Promise.all(
    Array.from({ length: paginas - 1 }, (_, i) =>
      db.listarOrcamentosInsumos({ busca, status, page: i + 1 }, segundoPlano),
    ),
  );
  return [...itens, ...restantes.flatMap((pagina) => pagina?.items ?? [])];
}

/** Tabelas cuja mudança (em outro computador) pode mudar o resultado da busca. */
const TABELAS_AO_VIVO = ["equipamentos", "orcamentos_insumos", "clientes"];

/**
 * Busca do Balcão para entregar ao cliente: equipamentos e vendas de insumos
 * (também por OI-n). Busca com 2 caracteres ou mais, 250 ms depois da digitação.
 *
 * Com uma busca na tela, uma mudança ao vivo relê a mesma busca em segundo plano:
 * sem indicador de carga e, se a leitura falhar, o resultado anterior fica.
 * Só a leitura mais nova (digitada ou ao vivo) é aplicada.
 */
export function useBuscaRetirada(termo: string) {
  const [data, setData] = useState<ItemRetirada[]>([]);
  const [loading, setLoading] = useState(false);
  const query = termo.trim();

  const pedido = useRef(0);
  const termoAtual = useRef(query);
  const cargaVisivelPendente = useRef(false);
  // Mudança chegou durante a busca visível: o SELECT dela pode ter rodado antes do COMMIT remoto.
  const recargaPendente = useRef(false);
  // Últimas listas aplicadas, para uma parte que falhe na releitura manter o que havia.
  const ultimos = useRef<{ eqs: Equipamento[]; vds: OrcamentoInsumos[] }>({ eqs: [], vds: [] });

  const ler = useCallback((busca: string, silencioso: boolean) => {
    const meu = ++pedido.current;
    if (!silencioso) {
      cargaVisivelPendente.current = true;
      setLoading(true);
    }
    // Uma das buscas falhar não esconde a outra. Na releitura silenciosa, a parte
    // que falhar mantém o que já estava na tela.
    const equipamentos = Promise.resolve()
      .then(() => db.listarEquipamentos(busca, undefined, silencioso))
      .then((items) => items ?? [])
      .catch(() => (silencioso ? ultimos.current.eqs : ([] as Equipamento[])));
    const vendas = silencioso
      ? Promise.all(STATUS_VENDA_BUSCA_RETIRADA.map((status) => vendasDoStatus(busca, status, true)))
          .then((listas) => listas.flat())
          .catch(() => ultimos.current.vds)
      : Promise.all(
          STATUS_VENDA_BUSCA_RETIRADA.map((status) =>
            Promise.resolve()
              .then(() => vendasDoStatus(busca, status, false))
              .catch(() => [] as OrcamentoInsumos[]),
          ),
        ).then((listas) => listas.flat());
    void Promise.all([equipamentos, vendas])
      .then(([eqs, vds]) => {
        if (meu !== pedido.current) return;
        ultimos.current = { eqs, vds };
        setData(juntarFilaRetirada(eqs, vds));
      })
      .finally(() => {
        if (meu !== pedido.current) return;
        cargaVisivelPendente.current = false;
        setLoading(false);
        if (!silencioso && recargaPendente.current) {
          recargaPendente.current = false;
          ler(busca, true);
        }
      });
  }, []);

  useEffect(() => {
    termoAtual.current = query;
    recargaPendente.current = false;
    if (query.length < 2) {
      ++pedido.current;
      cargaVisivelPendente.current = false;
      ultimos.current = { eqs: [], vds: [] };
      setData([]);
      setLoading(false);
      return;
    }
    // Do agendamento até a resposta, uma mudança ao vivo espera esta busca.
    cargaVisivelPendente.current = true;
    const timer = window.setTimeout(() => ler(query, false), 250);
    return () => {
      ++pedido.current;
      cargaVisivelPendente.current = false;
      window.clearTimeout(timer);
    };
  }, [query, ler]);

  useAtualizacaoAoVivo(TABELAS_AO_VIVO, () => {
    const busca = termoAtual.current;
    if (busca.length < 2) return;
    if (cargaVisivelPendente.current) {
      recargaPendente.current = true;
      return;
    }
    ler(busca, true);
  });

  return { data, loading, buscando: query.length >= 2 };
}
