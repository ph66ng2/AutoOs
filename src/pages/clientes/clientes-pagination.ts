import {
  ITEMS_PER_PAGE,
  paginateItems,
  totalPages,
  visiblePaginationItems,
} from "@/lib/pagination";

export const CLIENTES_POR_ABA = ITEMS_PER_PAGE;

export type ItemPaginacao = number | "reticencias-inicio" | "reticencias-fim";

export function totalAbasClientes(totalClientes: number) {
  return totalPages(totalClientes, CLIENTES_POR_ABA);
}

export function clientesDaAba<T>(clientes: T[], aba: number) {
  return paginateItems(clientes, aba, CLIENTES_POR_ABA);
}

export function itensPaginacao(totalAbas: number, abaAtual: number): ItemPaginacao[] {
  return visiblePaginationItems(totalAbas, abaAtual).map((item) => {
    if (item === "ellipsis-start") return "reticencias-inicio";
    if (item === "ellipsis-end") return "reticencias-fim";
    return item;
  });
}
