import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { notificarSistema } from "@/lib/notificacao-sistema";
import { textoSimplesDoSuporte } from "@/lib/suporte-links";
import { aoEnviarAoSuporte, intervaloDeBusca } from "@/lib/suporte-ponte";
import type { RespostaNovaSuporte } from "@/types";

const PRIMEIRA_BUSCA_MS = 5_000;

/** Um aviso por chamado: "Suporte respondeu o chamado #N", com o começo da última resposta. */
export function avisosDeResposta(novas: RespostaNovaSuporte[]): { chamadoId: number; titulo: string; texto: string }[] {
  const porChamado = new Map<number, RespostaNovaSuporte>();
  novas.forEach((nova) => porChamado.set(nova.chamado_id, nova));
  return [...porChamado.values()].map((nova) => {
    const texto = textoSimplesDoSuporte(nova.texto).replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
    return {
      chamadoId: nova.chamado_id,
      titulo: `Suporte respondeu o chamado #${nova.chamado_id}`,
      texto: texto.length > 140 ? `${texto.slice(0, 139)}…` : texto,
    };
  });
}

/**
 * Busca as respostas do suporte na thread do Slack enquanto a sessão está aberta: a cada 10 s
 * logo depois de um envio, a cada 60 s fora disso. Resposta nova vira aviso no app ("Ver" abre o
 * chamado) e no Windows. Na própria página Suporte a conversa já atualiza sozinha: sem aviso.
 * A busca é de segundo plano (não renova a sessão) e não faz nada sem token neste computador.
 */
export function useBuscaRespostasSuporte(ativo: boolean) {
  const navigate = useNavigate();
  const location = useLocation();
  const rota = useRef(location.pathname);
  rota.current = location.pathname;
  const navegar = useRef(navigate);
  navegar.current = navigate;

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const agendar = (ms = intervaloDeBusca()) => {
      clearTimeout(timer);
      timer = setTimeout(() => void buscar(), ms);
    };
    async function buscar() {
      try {
        const novas = await db.sincronizarSuporte();
        if (!vivo) return;
        for (const aviso of avisosDeResposta(Array.isArray(novas) ? novas : [])) {
          void notificarSistema(aviso.titulo, aviso.texto);
          if (rota.current === "/suporte") continue;
          toast.info(aviso.titulo, {
            id: `suporte-resposta-${aviso.chamadoId}`,
            description: aviso.texto,
            duration: 15_000,
            action: { label: "Ver", onClick: () => navegar.current("/suporte", { state: { chamadoId: aviso.chamadoId } }) },
          });
        }
      } catch {
        // Sessão bloqueada, sem rede ou Slack fora: tenta de novo na próxima volta.
      }
      if (vivo) agendar();
    }
    const pararDeOuvir = aoEnviarAoSuporte(() => agendar());
    agendar(PRIMEIRA_BUSCA_MS);
    return () => {
      vivo = false;
      clearTimeout(timer);
      pararDeOuvir();
    };
  }, [ativo]);
}
