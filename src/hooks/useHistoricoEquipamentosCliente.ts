import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  // Só o pedido mais recente do cliente atual mexe no estado: resposta atrasada de outro
  // cliente (ou de uma leitura anterior) é descartada.
  const pedido = useRef(0);
  const clienteAtual = useRef(clienteId);
  clienteAtual.current = clienteId;

  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    const vale = () => meu === pedido.current && clienteAtual.current === clienteId;
    if (clienteId == null) {
      setLoading(false);
      setError("Cliente não encontrado.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const encontrado = await db.buscarCliente(clienteId);
      if (!vale()) return;
      // OS antigas sem cliente_id são achadas pelo nome, como no painel de Clientes.
      const nomes = [nomeExibicaoCliente(encontrado), encontrado.nome ?? ""];
      const lista = await db.listarEquipamentosCliente(clienteId, nomes);
      if (!vale()) return;
      setCliente(encontrado);
      setEquipamentos(lista);
    } catch (e) {
      if (vale()) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (vale()) setLoading(false);
    }
  }, [clienteId]);

  // Trocar de cliente limpa a tela na hora: nada do cliente anterior fica à vista.
  useEffect(() => {
    setCliente(null);
    setEquipamentos([]);
    void carregar();
  }, [carregar]);

  const aparelhos = useMemo(() => agruparHistoricoEquipamentos(equipamentos), [equipamentos]);

  return { cliente, aparelhos, totalOs: equipamentos.length, loading, error, recarregar: carregar };
}
