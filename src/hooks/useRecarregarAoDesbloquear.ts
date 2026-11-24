import { useEffect, useRef } from "react";
import { recarregarTodas } from "@/lib/ao-vivo";

interface SessaoObservada {
  active_profile_id?: number | null;
  unlocked: boolean;
}

/**
 * Sessão bloqueada não recebe avisos ao vivo (`ao_vivo.rs` só repassa com sessão aberta) e as
 * recargas em segundo plano falham em silêncio. Ao desbloquear, ou ao trocar para outro perfil
 * já desbloqueado, todas as telas abertas recarregam uma vez (em segundo plano). A primeira
 * leitura do status (arranque) não recarrega: cada tela já carrega ao montar.
 */
export function deveRecarregarAoMudarSessao(antes: SessaoObservada | null, depois: SessaoObservada | null): boolean {
  if (!antes || !depois || !depois.unlocked) return false;
  return !antes.unlocked || antes.active_profile_id !== depois.active_profile_id;
}

export function useRecarregarAoDesbloquear(status: SessaoObservada | null) {
  const anterior = useRef<SessaoObservada | null>(null);
  const perfil = status?.active_profile_id ?? null;
  const desbloqueada = status?.unlocked;
  useEffect(() => {
    if (desbloqueada === undefined) return;
    const atual = { active_profile_id: perfil, unlocked: desbloqueada };
    const antes = anterior.current;
    anterior.current = atual;
    if (deveRecarregarAoMudarSessao(antes, atual)) recarregarTodas();
  }, [perfil, desbloqueada]);
}
