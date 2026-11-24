import { useCallback, useEffect, useRef, useState } from "react";
import { useAtualizacaoAoVivo } from "@/hooks/useAtualizacaoAoVivo";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { db } from "@/lib/db";
import type { ContagemClientes, ResumoCliente } from "@/types";

/** Contagem dos filtros da lista de clientes (com a busca aplicada). */
export function useContagemClientes(busca?: string) {
  const [data, setData] = useState<ContagemClientes | null>(null);
  const pedido = useRef(0);
  const buscaAtual = useRef(busca);
  buscaAtual.current = busca;

  const carregar = useCallback(async (segundoPlano = false) => {
    const minhaBusca = buscaAtual.current;
    const meu = ++pedido.current;
    try {
      const contagem = await db.contarClientesPorFiltro(minhaBusca, segundoPlano);
      if (meu === pedido.current && minhaBusca === buscaAtual.current) setData(contagem);
    } catch (err) {
      if (meu !== pedido.current || minhaBusca !== buscaAtual.current) return;
      console.error("Erro ao contar clientes:", err);
      setData(null);
    }
  }, []);

  useEffect(() => {
    void carregar();
    return () => { pedido.current += 1; };
  }, [busca, carregar]);
  useAtualizacaoAoVivo(["clientes", "equipamentos"], () => { void carregar(true); });
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
