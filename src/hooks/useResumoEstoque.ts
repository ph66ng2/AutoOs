import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { ResumoEstoque } from "@/types";

/** Números do topo de Insumos e peças. Falha silenciosa: os números somem, a lista continua. */
export function useResumoEstoque() {
  const [resumo, setResumo] = useState<ResumoEstoque | null>(null);

  const carregar = useCallback(async () => {
    try {
      setResumo((await db.resumoEstoque()) ?? null);
    } catch {
      setResumo(null);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { resumo, recarregar: carregar };
}
