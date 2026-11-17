import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import { agruparHistoricoEquipamentos } from "@/lib/historico-equipamentos";
import { nomeExibicaoCliente } from "@/components/clientes/cliente-display-utils";
import type { Cliente, Equipamento } from "@/types";

/** Cliente e todas as OS dele, agrupadas por aparelho. */
export function useHistoricoEquipamentosCliente(clienteId: number | null) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (clienteId == null) {
      setLoading(false);
      setError("Cliente não encontrado.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const encontrado = await db.buscarCliente(clienteId);
      // OS antigas sem cliente_id são achadas pelo nome, como no painel de Clientes.
      const nomes = [nomeExibicaoCliente(encontrado), encontrado.nome ?? ""];
      setCliente(encontrado);
      setEquipamentos(await db.listarEquipamentosCliente(clienteId, nomes));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const aparelhos = useMemo(() => agruparHistoricoEquipamentos(equipamentos), [equipamentos]);

  return { cliente, aparelhos, totalOs: equipamentos.length, loading, error, recarregar: carregar };
}
