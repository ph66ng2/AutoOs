import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import type { ResumoEstoque } from "@/types";

/**
 * Números do topo de Insumos e peças. Falha silenciosa: os números somem, a lista continua.
 * O valor em estoque depende das permissões do perfil: ao trocar de perfil, bloquear ou mudar
 * permissões, o resumo anterior é descartado na hora e lido de novo.
 */
export function useResumoEstoque() {
  const { status } = useSensitiveAccess();
  const sessao = status?.unlocked
    ? `${status.active_profile_id ?? ""}:${[...(status.permissions ?? [])].sort().join(",")}`
    : "bloqueada";
  const [resumo, setResumo] = useState<ResumoEstoque | null>(null);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    try {
      const dados = (await db.resumoEstoque()) ?? null;
      if (meu === pedido.current) setResumo(dados);
    } catch {
      if (meu === pedido.current) setResumo(null);
    }
    // `sessao` refaz a leitura quando o perfil ou as permissões mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao]);

  useEffect(() => {
    setResumo(null);
    void carregar();
  }, [carregar]);

  return { resumo, recarregar: carregar };
}
