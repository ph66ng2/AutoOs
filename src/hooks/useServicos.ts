import { useCallback, useEffect, useState } from "react";
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

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const numeros = Promise.resolve().then(() => db.contarServicos(params?.busca)).catch(() => null);
      const data = await db.listarServicosPaginados(
        params?.busca,
        params?.situacao ?? "ATIVOS",
        Math.max((params?.page ?? 1) - 1, 0),
      );
      setContagem(await numeros);
      setServicos(data.items);
      setTotal(data.total);
    } catch (err: any) {
      setError(err?.toString() || "Erro ao carregar serviços");
      console.error("Erro ao carregar serviços:", err);
    } finally {
      setLoading(false);
    }
  }, [params?.busca, params?.situacao, params?.page]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

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
