import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { ContagemClientes, ResumoCliente } from "@/types";

/** Contagem dos filtros da lista de clientes (com a busca aplicada). */
export function useContagemClientes(busca?: string) {
  const [data, setData] = useState<ContagemClientes | null>(null);
  const carregar = useCallback(async () => {
    try {
      setData(await db.contarClientesPorFiltro(busca));
    } catch (err) {
      console.error("Erro ao contar clientes:", err);
      setData(null);
    }
  }, [busca]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  return { data, recarregar: carregar };
}

/** Números do painel do cliente aberto; descarta a resposta de um cliente que já foi trocado. */
export function useResumoCliente(clienteId: number | null) {
  const [data, setData] = useState<ResumoCliente | null>(null);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let vigente = true;
    setData(null);
    if (clienteId == null) return;
    (async () => {
      try {
        const resumo = await db.resumoCliente(clienteId);
        if (vigente) setData(resumo);
      } catch (err) {
        console.error("Erro ao carregar resumo do cliente:", err);
      }
    })();
    return () => { vigente = false; };
  }, [clienteId, versao]);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { data, recarregar };
}
