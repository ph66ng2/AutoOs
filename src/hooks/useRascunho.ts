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
export function useRascunho<T>(chave: string | null) {
  const chaveCompleta = chave === null ? null : PREFIXO + chave;
  const pendente = useRef<{ chave: string; dados: T; timer: number } | null>(null);

  const cancelarPendente = useCallback(() => {
    const atual = pendente.current;
    if (atual) window.clearTimeout(atual.timer);
    pendente.current = null;
    return atual;
  }, []);

  const gravarPendente = useCallback(() => {
    const atual = cancelarPendente();
    if (atual) gravar(atual.chave, atual.dados);
  }, [cancelarPendente]);

  const ler = useCallback((): Rascunho<T> | null => {
    if (chaveCompleta === null) return null;
    if (pendente.current?.chave === chaveCompleta) gravarPendente();
    return lerGravado<T>(chaveCompleta);
  }, [chaveCompleta, gravarPendente]);

  const salvarAgora = useCallback((dados: T, salvoEm = new Date().toISOString()) => {
    if (chaveCompleta === null) return;
    if (pendente.current?.chave === chaveCompleta) cancelarPendente();
    gravar(chaveCompleta, dados, salvoEm);
  }, [cancelarPendente, chaveCompleta]);

  /** Salva depois de uma pausa na digitação. */
  const salvar = useCallback((dados: T) => {
    if (chaveCompleta === null) return;
    if (pendente.current?.chave === chaveCompleta) cancelarPendente();
    else gravarPendente();
    const timer = window.setTimeout(gravarPendente, ESPERA_MS);
    pendente.current = { chave: chaveCompleta, dados, timer };
  }, [cancelarPendente, chaveCompleta, gravarPendente]);

  /** Apaga o rascunho só se o gravado ainda for o mesmo (`eDoDono`); o pendente também. */
  const limparSe = useCallback((eDoDono: (dados: T) => boolean) => {
    if (chaveCompleta === null) return;
    const atual = pendente.current;
    if (atual?.chave === chaveCompleta && eDoDono(atual.dados)) cancelarPendente();
    const gravado = lerGravado<T>(chaveCompleta);
    if (gravado && eDoDono(gravado.dados)) remover(chaveCompleta);
  }, [cancelarPendente, chaveCompleta]);

  const limpar = useCallback(() => {
    if (chaveCompleta === null) return;
    if (pendente.current?.chave === chaveCompleta) cancelarPendente();
    remover(chaveCompleta);
  }, [cancelarPendente, chaveCompleta]);

  // Sair da tela ou fechar o app no meio da pausa grava na chave que originou a escrita.
  useEffect(() => {
    window.addEventListener("pagehide", gravarPendente);
    window.addEventListener("beforeunload", gravarPendente);
    return () => {
      window.removeEventListener("pagehide", gravarPendente);
      window.removeEventListener("beforeunload", gravarPendente);
      gravarPendente();
    };
  }, [gravarPendente]);

  return useMemo(() => ({ ler, salvar, salvarAgora, limpar, limparSe }), [ler, salvar, salvarAgora, limpar, limparSe]);
}

function gravar<T>(chave: string, dados: T, salvoEm = new Date().toISOString()) {
  try {
    localStorage.setItem(chave, JSON.stringify({ dados, salvoEm } satisfies Rascunho<T>));
  } catch { /* sem armazenamento */ }
}

function lerGravado<T>(chave: string): Rascunho<T> | null {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return null;
    const valor = JSON.parse(bruto) as Rascunho<T>;
    return valor && typeof valor.salvoEm === "string" && valor.dados != null ? valor : null;
  } catch {
    return null;
  }
}

function remover(chave: string) {
  try { localStorage.removeItem(chave); } catch { /* sem armazenamento */ }
}

/** "hoje às 14:32" ou "18/11 às 09:05", para o aviso de rascunho recuperado. */
export function quandoRascunho(iso: string, agora = new Date()): string {
  const data = new Date(iso);
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const mesmoDia = data.toDateString() === agora.toDateString();
  return mesmoDia ? `hoje às ${hora}` : `${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hora}`;
}
