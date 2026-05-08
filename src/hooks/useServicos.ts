import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { ServicoCatalogo } from "@/types";

interface UseServicosParams {
  busca?: string;
  apenasAtivos?: boolean;
}

export function useServicos(params?: UseServicosParams) {
  const [servicos, setServicos] = useState<ServicoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await db.listarServicos(params?.busca, params?.apenasAtivos ?? true);
      setServicos(data);
    } catch (err: any) {
      setError(err?.toString() || "Erro ao carregar serviços");
      console.error("Erro ao carregar serviços:", err);
    } finally {
      setLoading(false);
    }
  }, [params?.busca, params?.apenasAtivos]);

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

  return {
    servicos,
    loading,
    error,
    criar,
    atualizar,
    deletar,
    recarregar: carregar,
  };
}
