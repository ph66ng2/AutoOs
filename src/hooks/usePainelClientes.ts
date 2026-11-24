import { useCallback, useEffect, useRef, useState } from "react";
import { useAtualizacaoAoVivo } from "@/hooks/useAtualizacaoAoVivo";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { db } from "@/lib/db";
import type { ContagemClientes, ResumoCliente } from "@/types";

/** Contagem dos filtros da lista de clientes (com a busca aplicada). */
export function useContagemClientes(busca?: string) {
  const [data, setData] = useState<ContagemClientes | null>(null);
  const pedido = useRef(0);
  const cargaVisivelPendente = useRef(false);
  const buscaAtual = useRef(busca);
  buscaAtual.current = busca;

  const carregar = useCallback(async (segundoPlano = false) => {
    const minhaBusca = buscaAtual.current;
    if (segundoPlano && cargaVisivelPendente.current) return;
    const meu = ++pedido.current;
    if (!segundoPlano) cargaVisivelPendente.current = true;
    try {
      const contagem = await db.contarClientesPorFiltro(minhaBusca, segundoPlano);
      if (meu === pedido.current && minhaBusca === buscaAtual.current) setData(contagem);
    } catch (err) {
      if (meu !== pedido.current || minhaBusca !== buscaAtual.current) return;
      console.error("Erro ao contar clientes:", err);
      setData(null);
    } finally {
      if (meu === pedido.current && minhaBusca === buscaAtual.current) cargaVisivelPendente.current = false;
    }
  }, []);

  useEffect(() => {
    void carregar();
    return () => {
      ++pedido.current;
      cargaVisivelPendente.current = false;
    };
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
  const cargaVisivelPendente = useRef(false);

  const carregar = useCallback(async (segundoPlano = false) => {
    if (clienteId == null || sessao == null) return;
    if (segundoPlano && cargaVisivelPendente.current) return;
    const meu = ++pedido.current;
    if (!segundoPlano) cargaVisivelPendente.current = true;
    try {
      const resumo = await db.resumoCliente(clienteId, segundoPlano);
      if (meu === pedido.current) setCache({ chave, resumo });
    } catch (err) {
      if (meu === pedido.current) console.error("Erro ao carregar resumo do cliente:", err);
    } finally {
      if (meu === pedido.current) cargaVisivelPendente.current = false;
    }
  }, [clienteId, sessao, chave]);

  useEffect(() => {
    setCache(null);
    void carregar();
    return () => {
      ++pedido.current;
      cargaVisivelPendente.current = false;
    };
  }, [carregar]);

  useAtualizacaoAoVivo(["equipamentos", "clientes"], () => { void carregar(true); });
  const recarregar = useCallback(() => carregar(), [carregar]);
  return { data: cache?.chave === chave ? cache.resumo : null, recarregar };
}
