export const CLIENTES_POR_ABA = 10;

export function totalAbasClientes(totalClientes: number) {
  return Math.max(1, Math.ceil(totalClientes / CLIENTES_POR_ABA));
}

export function clientesDaAba<T>(clientes: T[], aba: number) {
  const abaValida = Math.min(Math.max(aba, 1), totalAbasClientes(clientes.length));
  const inicio = (abaValida - 1) * CLIENTES_POR_ABA;

  return clientes.slice(inicio, inicio + CLIENTES_POR_ABA);
}
