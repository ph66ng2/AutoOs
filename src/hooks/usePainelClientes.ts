import { useCallback, useEffect, useRef, useState } from "react";
import { useAtualizacaoAoVivo } from "@/hooks/useAtualizacaoAoVivo";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
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
  const { status } = useSensitiveAccess();
  const sessao = status?.unlocked
    ? `${status.active_profile_id ?? ""}:${[...(status.permissions ?? [])].sort().join(",")}`
    : null;
  const chave = JSON.stringify([clienteId, sessao]);
  const [cache, setCache] = useState<{ chave: string; resumo: ResumoCliente } | null>(null);
  const pedido = useRef(0);

  const carregar = useCallback(async (segundoPlano = false) => {
    if (clienteId == null || sessao == null) return;
    const meu = ++pedido.current;
    try {
      const resumo = await db.resumoCliente(clienteId, segundoPlano);
      if (meu === pedido.current) setCache({ chave, resumo });
    } catch (err) {
      if (meu === pedido.current) console.error("Erro ao carregar resumo do cliente:", err);
    }
  }, [clienteId, sessao, chave]);

  useEffect(() => {
    setCache(null);
    void carregar();
    return () => { pedido.current += 1; };
  }, [carregar]);

  useAtualizacaoAoVivo(["equipamentos", "clientes"], () => { void carregar(true); });
  const recarregar = useCallback(() => carregar(), [carregar]);
  return { data: cache?.chave === chave ? cache.resumo : null, recarregar };
}
