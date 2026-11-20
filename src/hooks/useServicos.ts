import { useCallback, useEffect, useState } from "react";
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

  const carregar = useCallback(async (opcoes?: { silencioso?: boolean }) => {
    // Atualização ao vivo recarrega sem "carregando": a lista fica e só o que mudou troca.
    if (opcoes?.silencioso !== true) setLoading(true);
    setError(null);
    try {
      const numeros = Promise.resolve().then(() => db.contarServicos(params?.busca, ...argSegundoPlano(opcoes?.silencioso === true))).catch(() => null);
      const data = await db.listarServicosPaginados(
        params?.busca,
        params?.situacao ?? "ATIVOS",
        Math.max((params?.page ?? 1) - 1, 0),
        ...argSegundoPlano(opcoes?.silencioso === true),
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
