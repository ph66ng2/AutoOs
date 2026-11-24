import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import { argSegundoPlano } from "@/lib/ao-vivo";
import { useAtualizacaoAoVivo } from "@/hooks/useAtualizacaoAoVivo";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import type { ResumoEstoque } from "@/types";

/**
 * Números do topo de Insumos e peças. Falha silenciosa: os números somem, a lista continua.
 * O valor em estoque depende das permissões do perfil: ao trocar de perfil, bloquear ou mudar
 * permissões, o resumo anterior é descartado na hora e lido de novo. Mudanças de outro
 * computador (itens, OS esperando peça e orçamentos de venda) releem em segundo plano,
 * sem renovar a sessão.
 */
export function useResumoEstoque() {
  const { status } = useSensitiveAccess();
  const sessao = status?.unlocked
    ? `${status.active_profile_id ?? ""}:${[...(status.permissions ?? [])].sort().join(",")}`
    : "bloqueada";
  const [resumo, setResumo] = useState<ResumoEstoque | null>(null);
  const pedido = useRef(0);
  const cargaVisivelPendente = useRef(false);

  const carregar = useCallback(async (opcoes?: { silencioso?: boolean }) => {
    const silencioso = opcoes?.silencioso === true;
    if (silencioso && cargaVisivelPendente.current) return;
    const meu = ++pedido.current;
    if (!silencioso) cargaVisivelPendente.current = true;
    try {
      const dados = (await db.resumoEstoque(...argSegundoPlano(silencioso))) ?? null;
      if (meu === pedido.current) setResumo(dados);
    } catch {
      if (meu === pedido.current) setResumo(null);
    } finally {
      if (meu === pedido.current) cargaVisivelPendente.current = false;
    }
    // `sessao` refaz a leitura quando o perfil ou as permissões mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao]);

  useEffect(() => {
    setResumo(null);
    void carregar();
    return () => {
      ++pedido.current;
      cargaVisivelPendente.current = false;
    };
  }, [carregar]);

  useAtualizacaoAoVivo(["produtos", "equipamentos", "orcamentos_insumos"], () => {
    void carregar({ silencioso: true });
  });

  return { resumo, recarregar: carregar };
}
