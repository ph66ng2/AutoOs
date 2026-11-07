/**
 * Hook do módulo já existente de Insumos: carrega dados paginados e delega
 * CRUD/movimentações ao adapter Tauri ou Supabase conforme o build ativo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import { IS_SAAS_BUILD } from "@/lib/runtime-mode";
import type { ClienteId, Produto, UsoProdutoOrcamentos } from "@/types";
import {
  carregarRepositorioProdutos,
  type ProdutoInput,
} from "@/lib/data/produtos-repository";

interface UseInsumosParams {
  busca?: string;
  categoria?: string;
  apenasEstoqueBaixo?: boolean;
  page?: number;
}

export function useInsumos(params?: UseInsumosParams) {
  const [produtos, setProdutos] = useState<Produto<ClienteId>[]>([]);
  const [total, setTotal] = useState(0);
  const [insumosAbaixoMinimo, setInsumosAbaixoMinimo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const carregar = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const repository = await carregarRepositorioProdutos();
      const result = await repository.listar({
        busca: params?.busca,
        categoria: params?.categoria === "TODOS" ? undefined : params?.categoria,
        apenasEstoqueBaixo: params?.apenasEstoqueBaixo,
      }, params?.page ?? 1);
      if (requestId !== requestIdRef.current) return;
      setProdutos(result.items);
      setTotal(result.total);
      setInsumosAbaixoMinimo(result.insumosAbaixoMinimo);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Erro ao carregar produtos.");
      console.error("Erro ao carregar produtos:", err);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [params?.busca, params?.categoria, params?.apenasEstoqueBaixo, params?.page]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => () => {
    requestIdRef.current += 1;
  }, []);

  const criar = async (input: ProdutoInput) => {
    try {
      const repository = await carregarRepositorioProdutos();
      await repository.criar(input);
      await carregar();
      return { sucesso: true } as const;
    } catch (err) {
      return { sucesso: false, erro: err instanceof Error ? err.message : String(err) } as const;
    }
  };

  const atualizar = async (id: ClienteId, input: ProdutoInput) => {
    try {
      const repository = await carregarRepositorioProdutos();
      await repository.atualizar(id, input);
      await carregar();
      return { sucesso: true } as const;
    } catch (err) {
      return { sucesso: false, erro: err instanceof Error ? err.message : String(err) } as const;
    }
  };

  const deletar = async (id: ClienteId, atualizadoEm?: string) => {
    try {
      const repository = await carregarRepositorioProdutos();
      await repository.desativar(id, atualizadoEm);
      await carregar();
      return { sucesso: true } as const;
    } catch (err) {
      return { sucesso: false, erro: err instanceof Error ? err.message : String(err) } as const;
    }
  };

  const registrarMovimentacao = async (
    produtoId: ClienteId,
    tipo: "ENTRADA" | "SAIDA",
    quantidade: number,
    origem: string,
    referencia?: string,
  ) => {
    try {
      const repository = await carregarRepositorioProdutos();
      await repository.registrarMovimentacao(produtoId, tipo, quantidade, origem, referencia);
      await carregar();
      return { sucesso: true } as const;
    } catch (err) {
      return { sucesso: false, erro: err instanceof Error ? err.message : String(err) } as const;
    }
  };

  /**
   * Consulta em quais OS e orçamentos de insumos a peça está em uso.
   *
   * Fluxo: `db.usoProdutoEmOrcamentos(id)` → comando Tauri
   * `uso_produto_em_orcamentos` (Rust). Erro, resposta vazia ou build SaaS
   * (sem esse comando no adapter Supabase) viram `null`.
   *
   * @param id - ID do produto.
   * @returns Listas de uso ou `null` quando indisponível.
   */
  const consultarUsoEmOrcamentos = async (
    id: ClienteId,
  ): Promise<UsoProdutoOrcamentos | null> => {
    if (IS_SAAS_BUILD || typeof id !== "number") return null;
    try {
      const uso = await db.usoProdutoEmOrcamentos(id);
      return uso ?? null;
    } catch (err: any) {
      console.error("Erro ao consultar uso do produto em orçamentos:", err);
      return null;
    }
  };

  return {
    produtos,
    total,
    loading,
    error,
    insumosAbaixoMinimo,
    criar,
    atualizar,
    deletar,
    registrarMovimentacao,
    consultarUsoEmOrcamentos,
    recarregar: carregar,
  };
}
