import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { ModeloMensagem, ModeloMensagemInput } from "@/types";

/**
 * Mensagens prontas de WhatsApp da empresa (0058), no padrão dos hooks de domínio.
 * `ativo` false não carrega (ex.: menu do WhatsApp ainda fechado).
 */
export function useModelosMensagem(ativo = true) {
  const [modelos, setModelos] = useState<ModeloMensagem[]>([]);
  const [loading, setLoading] = useState(ativo);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setModelos(await db.listarModelosMensagem());
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : String(causa));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ativo) void carregar();
  }, [ativo, carregar]);

  const salvar = useCallback(async (input: ModeloMensagemInput) => {
    const salvo = await db.salvarModeloMensagem(input);
    await carregar();
    return salvo;
  }, [carregar]);

  const excluir = useCallback(async (id: number) => {
    await db.excluirModeloMensagem(id);
    await carregar();
  }, [carregar]);

  return { modelos, loading, error, salvar, excluir, recarregar: carregar };
}
