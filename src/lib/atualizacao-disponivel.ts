/**
 * Estado compartilhado da atualização do app: qual versão nova existe (se houver) e se o
 * painel de instalação está aberto. Quem consulta o servidor é o `UpdateNotice` (montado uma
 * vez no App); o menu lateral e o aviso flutuante só leem daqui e pedem para abrir o painel.
 */
import { useSyncExternalStore } from "react";

export type EstadoAtualizacao = {
  versao: string | null;
  painelAberto: boolean;
};

let estado: EstadoAtualizacao = { versao: null, painelAberto: false };
const ouvintes = new Set<() => void>();

function publicar(proximo: Partial<EstadoAtualizacao>) {
  estado = { ...estado, ...proximo };
  ouvintes.forEach((ouvinte) => ouvinte());
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export function definirVersaoDisponivel(versao: string | null) {
  if (estado.versao !== versao) publicar({ versao });
}

export function abrirPainelAtualizacao() {
  if (estado.versao) publicar({ painelAberto: true });
}

export function fecharPainelAtualizacao() {
  publicar({ painelAberto: false });
}

export function useAtualizacaoDisponivel(): EstadoAtualizacao {
  return useSyncExternalStore(assinar, () => estado, () => estado);
}

/** Só para testes: volta ao estado inicial. */
export function reiniciarAtualizacaoParaTeste() {
  estado = { versao: null, painelAberto: false };
}

const CHAVE_AVISO_VISTO = "autoos:aviso-atualizacao-visto";

/** O aviso flutuante aparece uma vez por versão; depois fica só o botão do menu. */
export function avisoJaVisto(versao: string): boolean {
  try {
    return window.localStorage.getItem(CHAVE_AVISO_VISTO) === versao;
  } catch {
    return false;
  }
}

export function marcarAvisoVisto(versao: string) {
  try {
    window.localStorage.setItem(CHAVE_AVISO_VISTO, versao);
  } catch {
    // Sem armazenamento: o aviso volta na próxima abertura, sem prejuízo.
  }
}
