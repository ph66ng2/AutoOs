import { useCallback, useEffect, useState, useLayoutEffect, useRef } from "react";
import { argSegundoPlano } from "@/lib/ao-vivo";
import { useAtualizacaoAoVivo, useDestaquesAoVivo } from "@/hooks/useAtualizacaoAoVivo";
import { db } from "@/lib/db";
import type { ServicoCatalogo, SituacaoServico } from "@/types";

interface UseServicosParams {
  busca?: string;
  situacao?: SituacaoServico;
  /** Página apresentada pela interface, iniciando em 1. */
  page?: number;
}

export function useServicos(params?: UseServicosParams) {
  const [servicos, setServicos] = useState<ServicoCatalogo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Números dos filtros (ativos e inativos com a busca); null se a contagem falhar. */
  const [contagem, setContagem] = useState<{ ativos: number; inativos: number } | null>(null);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);
  const paramsRef = useRef(params);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useLayoutEffect(() => {
    paramsRef.current = params;
    requestIdRef.current += 1;
  }, [params?.busca, params?.situacao, params?.page]);

  const carregar = useCallback(async (opcoes?: { silencioso?: boolean }) => {
    if (!mountedRef.current) return;
    const requestId = ++requestIdRef.current;
    const atual = () => mountedRef.current && requestIdRef.current === requestId;
    const silencioso = opcoes?.silencioso === true;
    if (!silencioso) {
      setLoading(true);
      setError(null);
    }
    try {
      const params = paramsRef.current;
      const numeros = Promise.resolve().then(() => db.contarServicos(params?.busca, ...argSegundoPlano(silencioso))).catch(() => null);
      const data = await db.listarServicosPaginados(
        params?.busca,
        params?.situacao ?? "ATIVOS",
        Math.max((params?.page ?? 1) - 1, 0),
        ...argSegundoPlano(silencioso),
      );
      const contagemAtual = await numeros;
      if (!atual()) return;
      setContagem(contagemAtual);
      setServicos(data.items);
      setTotal(data.total);
    } catch (err: any) {
      if (!atual() || silencioso) return;
      setError(err?.toString() || "Erro ao carregar serviços");
      console.error("Erro ao carregar serviços:", err);
    } finally {
      if (atual()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    return () => { requestIdRef.current += 1; };
  }, [carregar, params?.busca, params?.situacao, params?.page]);

  // Outro computador mudou algo desta lista: recarrega em silêncio e destaca o que mudou.

  const { destaques, lembrar } = useDestaquesAoVivo(servicos, (item) => item.id, (item) => JSON.stringify(item));

  useAtualizacaoAoVivo(["servicos_catalogo"], () => {

    lembrar();

    void carregar({ silencioso: true });

  });

  const criar = async (servico: Omit<ServicoCatalogo, "id">) => {
    try {
      await db.criarServico(servico);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  const atualizar = async (id: number, servico: Omit<ServicoCatalogo, "id">) => {
    try {
      await db.atualizarServico(id, servico);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  const deletar = async (id: number) => {
    try {
      await db.deletarServico(id);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  const reativar = async (id: number) => {
    try {
      await db.reativarServico(id);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  return {
    destaques,
    servicos,
    total,
    contagem,
    loading,
    error,
    criar,
    atualizar,
    deletar,
    reativar,
    recarregar: carregar,
  };
}
