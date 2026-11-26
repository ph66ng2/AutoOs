/**
 * Preferências deste computador (Configurações › Geral), abertas a qualquer perfil.
 * Ficam no `localStorage`: não vão para o banco e não mudam nada nos outros computadores.
 * Sem armazenamento, valem só até fechar o app.
 */

export type TamanhoTexto = "normal" | "grande" | "maior";
export type TelaInicial = "inicio" | "equipamentos";
export type Densidade = "confortavel" | "compacta";

const CHAVE_TEXTO = "autoos:tamanho-texto";
const CHAVE_ANIMACOES = "autoos:animacoes";
const CHAVE_TELA_INICIAL = "autoos:tela-inicial";
const CHAVE_DENSIDADE = "autoos:densidade";

export const ESCALA_TEXTO: Record<TamanhoTexto, string> = {
  normal: "100%",
  grande: "112.5%",
  maior: "125%",
};

export const ROTA_TELA_INICIAL: Record<TelaInicial, string> = {
  inicio: "/",
  equipamentos: "/equipamentos",
};

function ler(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string | null) {
  try {
    if (valor === null) window.localStorage.removeItem(chave);
    else window.localStorage.setItem(chave, valor);
  } catch {
    // Sem armazenamento a escolha vale só até fechar o app.
  }
}

export function tamanhoTexto(): TamanhoTexto {
  const valor = ler(CHAVE_TEXTO);
  return valor === "grande" || valor === "maior" ? valor : "normal";
}

export function definirTamanhoTexto(tamanho: TamanhoTexto) {
  gravar(CHAVE_TEXTO, tamanho === "normal" ? null : tamanho);
  aplicarPreferenciasComputador();
}

/** `true` quando este computador pediu animações reduzidas (vale além da opção do Windows). */
export function animacoesReduzidasAqui(): boolean {
  return ler(CHAVE_ANIMACOES) === "reduzidas";
}

export function definirAnimacoesReduzidas(reduzidas: boolean) {
  gravar(CHAVE_ANIMACOES, reduzidas ? "reduzidas" : null);
  aplicarPreferenciasComputador();
  window.dispatchEvent(new CustomEvent("autoos:preferencias-computador"));
}

/** Movimento reduzido: escolha deste computador ou a do sistema operacional. */
export function movimentoReduzido(): boolean {
  if (typeof window === "undefined") return false;
  if (animacoesReduzidasAqui()) return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Listas compactas: linhas mais baixas nas tabelas (cabe mais em telas de 720p). */
export function densidade(): Densidade {
  return ler(CHAVE_DENSIDADE) === "compacta" ? "compacta" : "confortavel";
}

export function definirDensidade(valor: Densidade) {
  gravar(CHAVE_DENSIDADE, valor === "compacta" ? "compacta" : null);
  aplicarPreferenciasComputador();
}

export function telaInicial(): TelaInicial {
  return ler(CHAVE_TELA_INICIAL) === "equipamentos" ? "equipamentos" : "inicio";
}

export function definirTelaInicial(tela: TelaInicial) {
  gravar(CHAVE_TELA_INICIAL, tela === "inicio" ? null : tela);
}

/** Aplica tamanho do texto e animações no `<html>`. Chamado no boot e a cada mudança. */
export function aplicarPreferenciasComputador() {
  if (typeof document === "undefined") return;
  const raiz = document.documentElement;
  raiz.style.fontSize = ESCALA_TEXTO[tamanhoTexto()];
  if (animacoesReduzidasAqui()) raiz.dataset.movimento = "reduzido";
  else delete raiz.dataset.movimento;
  if (densidade() === "compacta") raiz.dataset.densidade = "compacta";
  else delete raiz.dataset.densidade;
}
