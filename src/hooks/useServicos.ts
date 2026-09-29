import { useCallback, useEffect, useRef, useState } from "react";
import { carregarRepositorioServicos, type ServicoCatalogoInput } from "@/lib/data/servicos-repository";
import type { ClienteId, ServicoCatalogo } from "@/types";

interface UseServicosParams {
  busca?: string;
  apenasAtivos?: boolean;
  /** Página apresentada pela interface, iniciando em 1. */
  page?: number;
}

export function useServicos(params?: UseServicosParams) {
  const [servicos, setServicos] = useState<ServicoCatalogo<ClienteId>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const carregar = useCallback(async () => {
    const currentRequestVersion = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const repository = await carregarRepositorioServicos();
      const data = await repository.listar(params?.busca, params?.apenasAtivos ?? true, Math.max((params?.page ?? 1) - 1, 0));
      if (currentRequestVersion !== requestVersion.current) return;
      setServicos(data.items);
      setTotal(data.total);
    } catch (err: any) {
      if (currentRequestVersion !== requestVersion.current) return;
      setError(err?.toString() || "Erro ao carregar serviços");
      console.error("Erro ao carregar serviços:", err);
    } finally {
      if (currentRequestVersion === requestVersion.current) setLoading(false);
    }
  }, [params?.busca, params?.apenasAtivos, params?.page]);

  useEffect(() => {
    void carregar();
    return () => {
      requestVersion.current += 1;
    };
  }, [carregar]);

  const criar = async (servico: ServicoCatalogoInput) => {
    try {
      const repository = await carregarRepositorioServicos();
      await repository.criar(servico);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  const atualizar = async (id: ClienteId, servico: ServicoCatalogoInput) => {
    try {
      const repository = await carregarRepositorioServicos();
      await repository.atualizar(id, servico);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  const deletar = async (id: ClienteId) => {
    try {
      const repository = await carregarRepositorioServicos();
      await repository.desativar(id);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  return {
    servicos,
    total,
    loading,
    error,
    criar,
    atualizar,
    deletar,
    recarregar: carregar,
  };
}
