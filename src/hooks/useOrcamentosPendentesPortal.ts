import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { OrcamentoPendentePortal, PublicacaoLotePortal } from "@/types";

/** OS aguardando aprovação que ainda não têm orçamento publicado no portal (empresa do perfil ativo). */
export function useOrcamentosPendentesPortal() {
  const [pendentes, setPendentes] = useState<OrcamentoPendentePortal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await db.listarOrcamentosPendentesPortal();
      setPendentes(data);
    } catch (err: any) {
      setPendentes([]);
      setError(err?.toString() || "Erro ao carregar orçamentos pendentes do portal");
      console.error("Erro ao carregar orçamentos pendentes do portal:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const publicarTodos = async (): Promise<PublicacaoLotePortal> => {
    try {
      const resultado = await db.publicarOrcamentosPendentesPortal();
      await carregar();
      return resultado;
    } catch (err: any) {
      setError(err?.toString() || "Erro ao enviar orçamentos ao portal");
      throw err;
    }
  };

  return { pendentes, loading, error, publicarTodos, recarregar: carregar };
}
