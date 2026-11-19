import { useCallback, useEffect, useMemo, useRef } from "react";

const PREFIXO = "autoos:rascunho:";
const ESPERA_MS = 400;

export interface Rascunho<T> {
  dados: T;
  /** ISO 8601 do último salvamento. */
  salvoEm: string;
}

/**
 * Rascunho automático de um formulário neste computador (localStorage).
 * Sobrevive a fechar a janela, trocar de tela e fechar o app; some ao salvar de verdade.
 * Não guarda fotos nem nada binário: só os campos.
 */
export function useRascunho<T>(chave: string) {
  const espera = useRef<number | null>(null);
  const chaveCompleta = PREFIXO + chave;

  const ler = useCallback((): Rascunho<T> | null => {
    try {
      const bruto = localStorage.getItem(chaveCompleta);
      if (!bruto) return null;
      const valor = JSON.parse(bruto) as Rascunho<T>;
      return valor && typeof valor.salvoEm === "string" && valor.dados != null ? valor : null;
    } catch {
      return null;
    }
  }, [chaveCompleta]);

  const cancelarEspera = useCallback(() => {
    if (espera.current != null) window.clearTimeout(espera.current);
    espera.current = null;
  }, []);

  const salvarAgora = useCallback((dados: T, salvoEm = new Date().toISOString()) => {
    cancelarEspera();
    try {
      localStorage.setItem(chaveCompleta, JSON.stringify({ dados, salvoEm } satisfies Rascunho<T>));
    } catch {
      // Sem armazenamento: o formulário só não tem rascunho.
    }
  }, [cancelarEspera, chaveCompleta]);

  /** Salva depois de uma pausa na digitação. */
  const salvar = useCallback((dados: T) => {
    cancelarEspera();
    espera.current = window.setTimeout(() => {
      espera.current = null;
      salvarAgora(dados);
    }, ESPERA_MS);
  }, [cancelarEspera, salvarAgora]);

  const limpar = useCallback(() => {
    cancelarEspera();
    try { localStorage.removeItem(chaveCompleta); } catch { /* sem armazenamento */ }
  }, [cancelarEspera, chaveCompleta]);

  useEffect(() => cancelarEspera, [cancelarEspera]);

  return useMemo(() => ({ ler, salvar, salvarAgora, limpar }), [ler, salvar, salvarAgora, limpar]);
}

/** "hoje às 14:32" ou "18/11 às 09:05", para o aviso de rascunho recuperado. */
export function quandoRascunho(iso: string, agora = new Date()): string {
  const data = new Date(iso);
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const mesmoDia = data.toDateString() === agora.toDateString();
  return mesmoDia ? `hoje às ${hora}` : `${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hora}`;
}
