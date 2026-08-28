export const CLIENTES_POR_ABA = 10;

export type ItemPaginacao = number | "reticencias-inicio" | "reticencias-fim";

export function totalAbasClientes(totalClientes: number) {
  return Math.max(1, Math.ceil(totalClientes / CLIENTES_POR_ABA));
}

export function clientesDaAba<T>(clientes: T[], aba: number) {
  const abaValida = Math.min(Math.max(aba, 1), totalAbasClientes(clientes.length));
  const inicio = (abaValida - 1) * CLIENTES_POR_ABA;

  return clientes.slice(inicio, inicio + CLIENTES_POR_ABA);
}

export function itensPaginacao(totalAbas: number, abaAtual: number): ItemPaginacao[] {
  const totalValido = Math.max(1, totalAbas);
  const abaValida = Math.min(Math.max(abaAtual, 1), totalValido);

  if (totalValido <= 7) {
    return Array.from({ length: totalValido }, (_, indice) => indice + 1);
  }

  if (abaValida <= 4) {
    return [1, 2, 3, 4, 5, "reticencias-fim", totalValido];
  }

  if (abaValida >= totalValido - 3) {
    return [
      1,
      "reticencias-inicio",
      totalValido - 4,
      totalValido - 3,
      totalValido - 2,
      totalValido - 1,
      totalValido,
    ];
  }

  return [
    1,
    "reticencias-inicio",
    abaValida - 1,
    abaValida,
    abaValida + 1,
    "reticencias-fim",
    totalValido,
  ];
}
