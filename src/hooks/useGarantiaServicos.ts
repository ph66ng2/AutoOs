import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";

/**
 * Prazo de garantia dos serviços (dias contados de quando ficou pronta), configuração da empresa.
 * `dias` fica `null` enquanto carrega ou se a leitura falhar: aí a Nova entrada só não fala de garantia.
 */
export function useGarantiaServicos() {
  const [dias, setDias] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDias(await db.obterGarantiaServicosDias());
      setErro(null);
    } catch (causa) {
      setDias(null);
      setErro(causa instanceof Error ? causa.message : String(causa));
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvar = useCallback(async (novo: number) => {
    const gravado = await db.salvarGarantiaServicosDias(novo);
    setDias(gravado);
    return gravado;
  }, []);

  return { dias, erro, salvar, recarregar: carregar };
}
