/**
 * Registro dos erros mostrados ao operador, para a aba "Erros" das notificações.
 *
 * O aviso (toast) some; o registro fica até 50 itens neste computador (localStorage), para o
 * operador conseguir copiar o relatório técnico depois e mandar ao suporte.
 */
import { useSyncExternalStore } from "react";
import type { AppError } from "@/types/notification";

const CHAVE = "autoos.notificacoes.erros";
const LIMITE = 50;

export type ErroRegistrado = {
  id: string;
  erro: AppError;
  lido: boolean;
};

type Serializado = Omit<ErroRegistrado, "erro"> & { erro: Omit<AppError, "timestamp" | "originalError"> & { timestamp: string } };

let itens: ErroRegistrado[] = carregar();
const ouvintes = new Set<() => void>();

function carregar(): ErroRegistrado[] {
  try {
    const bruto = typeof localStorage !== "undefined" ? localStorage.getItem(CHAVE) : null;
    if (!bruto) return [];
    return (JSON.parse(bruto) as Serializado[]).map((item) => ({
      ...item,
      erro: { ...item.erro, timestamp: new Date(item.erro.timestamp) },
    }));
  } catch {
    return [];
  }
}

function salvar() {
  try {
    const serializado: Serializado[] = itens.map(({ erro, ...resto }) => {
      const { originalError: _ignorado, timestamp, ...campos } = erro;
      return { ...resto, erro: { ...campos, timestamp: timestamp.toISOString() } };
    });
    localStorage.setItem(CHAVE, JSON.stringify(serializado));
  } catch {
    // Sem armazenamento (modo privado/cota): o registro vale só nesta sessão.
  }
}

function emitir() {
  salvar();
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function registrarErro(erro: AppError): ErroRegistrado {
  const item: ErroRegistrado = {
    id: `${erro.timestamp.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    erro,
    lido: false,
  };
  itens = [item, ...itens].slice(0, LIMITE);
  emitir();
  return item;
}

export function marcarErrosLidos(id?: string) {
  itens = itens.map((item) => (id === undefined || item.id === id ? { ...item, lido: true } : item));
  emitir();
}

export function limparErros() {
  itens = [];
  emitir();
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function useErrosRegistrados(): ErroRegistrado[] {
  return useSyncExternalStore(assinar, () => itens, () => itens);
}

/** Só para testes. */
export function __resetErrosRegistrados() {
  itens = [];
  ouvintes.clear();
  try { localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ }
}
