/**
 * Atualização ao vivo entre computadores (3/3, lado das telas). O Rust (`ao_vivo.rs`) emite
 * `autoos:mudancas` com o que mudou na empresa e `autoos:reconectado` quando a escuta volta
 * depois de cair. Aqui fica um distribuidor só para o app inteiro: cada tela assina as
 * tabelas que mostra. Ao voltar o foco da janela, todas recarregam (rede de segurança).
 */
import { listen } from "@tauri-apps/api/event";

export interface MudancaAoVivo {
  tabela: string;
  id: number | null;
  referencia: number | null;
  operacao: "I" | "U" | "D";
}

interface Assinatura {
  tabelas: ReadonlySet<string>;
  aoMudar: (mudancas: MudancaAoVivo[]) => void;
}

const assinaturas = new Set<Assinatura>();
let ligado = false;
let ultimoFoco = 0;
const INTERVALO_FOCO_MS = 15_000;

/** Repassa a cada assinatura só as mudanças das tabelas dela. */
export function distribuirMudancas(mudancas: MudancaAoVivo[]) {
  for (const assinatura of [...assinaturas]) {
    const delas = mudancas.filter((m) => assinatura.tabelas.has(m.tabela));
    if (delas.length > 0) assinatura.aoMudar(delas);
  }
}

/** Todas recarregam (lista vazia = "pode ter mudado qualquer coisa"). */
export function recarregarTodas() {
  for (const assinatura of [...assinaturas]) assinatura.aoMudar([]);
}

function aoFocar() {
  const agora = Date.now();
  if (agora - ultimoFoco < INTERVALO_FOCO_MS) return;
  ultimoFoco = agora;
  recarregarTodas();
}

function ligar() {
  if (ligado) return;
  ligado = true;
  // Fora do Tauri (testes, navegador) não há eventos: fica só o foco da janela.
  void Promise.resolve()
    .then(() => listen<MudancaAoVivo[]>("autoos:mudancas", (evento) => distribuirMudancas(evento.payload ?? [])))
    .catch(() => undefined);
  void Promise.resolve()
    .then(() => listen("autoos:reconectado", () => recarregarTodas()))
    .catch(() => undefined);
  window.addEventListener("focus", aoFocar);
}

/**
 * Assina as mudanças das `tabelas`. `aoMudar` recebe as mudanças, ou uma lista vazia quando
 * é preciso recarregar tudo (reconexão ou volta do foco). Devolve a função para cancelar.
 */
export function assinarMudancas(tabelas: string[], aoMudar: (mudancas: MudancaAoVivo[]) => void): () => void {
  ligar();
  const assinatura: Assinatura = { tabelas: new Set(tabelas), aoMudar };
  assinaturas.add(assinatura);
  return () => { assinaturas.delete(assinatura); };
}

export type Destaque = "novo" | "alterado";

/**
 * O que mudou entre duas versões de uma lista: itens que entraram ("novo") e os que já
 * estavam mas têm outra versão ("alterado", ex.: `atualizado_em`). Itens que saíram não
 * entram (somem da tela).
 */
export function calcularDestaques<T>(
  antes: readonly T[],
  depois: readonly T[],
  chave: (item: T) => number | string | null | undefined,
  versao: (item: T) => unknown,
): Map<number | string, Destaque> {
  const anteriores = new Map<number | string, unknown>();
  for (const item of antes) {
    const id = chave(item);
    if (id != null) anteriores.set(id, versao(item));
  }
  const destaques = new Map<number | string, Destaque>();
  for (const item of depois) {
    const id = chave(item);
    if (id == null) continue;
    if (!anteriores.has(id)) destaques.set(id, "novo");
    else if (anteriores.get(id) !== versao(item)) destaques.set(id, "alterado");
  }
  return destaques;
}

/** Classes da linha destacada: entra deslizando (novo) e o fundo some devagar. */
export function classeDestaque(destaque: Destaque | undefined): string {
  if (destaque === "novo") return "animate-in fade-in-0 slide-in-from-top-1 duration-padrao ease-saida bg-acc-soft motion-reduce:animate-none";
  if (destaque === "alterado") return "bg-acc-soft";
  return "";
}
