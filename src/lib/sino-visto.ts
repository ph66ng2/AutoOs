/**
 * "Visto" do sino: abrir o sino zera o número, sem marcar nada como lido. O número conta só o
 * que ainda não foi lido E chegou depois da última vez que este perfil abriu o sino (neste
 * computador). Dentro do sino, o não lido continua destacado até ser tratado.
 *
 * - Alertas do portal: marca d'água (`portalAte`, o maior id já visto). Os ids crescem, então
 *   "novo" é não lido com id maior, e a conta vem do banco, sem depender de uma janela de itens.
 * - Avisos internos e erros: chaves. Ao abrir, guarda só as não lidas de agora; as que já foram
 *   lidas saem, então a lista não cresce sem limite nem perde o "visto" de um item pendente.
 */
const PREFIXO = "autoos:sino-visto:";

export interface Vistos {
  chaves: Set<string>;
  portalAte: number;
}

const VAZIO: Vistos = { chaves: new Set(), portalAte: 0 };

export function lerVistos(perfilId: number | null): Vistos {
  if (perfilId == null) return { chaves: new Set(), portalAte: 0 };
  try {
    const bruto = window.localStorage.getItem(PREFIXO + perfilId);
    const dados = bruto ? (JSON.parse(bruto) as unknown) : null;
    // Formato antigo: só a lista de chaves (os alertas do portal eram "portal:<id>").
    const lista = Array.isArray(dados) ? dados : Array.isArray((dados as { chaves?: unknown })?.chaves) ? (dados as { chaves: unknown[] }).chaves : [];
    const chaves = lista.filter((item): item is string => typeof item === "string");
    const salvo = Number((dados as { portalAte?: unknown } | null)?.portalAte);
    const portalAte = Number.isFinite(salvo) && salvo > 0
      ? salvo
      : chaves.reduce((max, chave) => (chave.startsWith("portal:") ? Math.max(max, Number(chave.slice(7)) || 0) : max), 0);
    return { chaves: new Set(chaves.filter((chave) => !chave.startsWith("portal:"))), portalAte };
  } catch {
    return { ...VAZIO, chaves: new Set() };
  }
}

/** Grava o "visto" do perfil neste computador. Sem perfil ou sem armazenamento, não grava. */
export function gravarVistos(perfilId: number | null, vistos: Vistos): void {
  if (perfilId == null) return;
  try {
    window.localStorage.setItem(PREFIXO + perfilId, JSON.stringify({ chaves: [...vistos.chaves], portalAte: vistos.portalAte }));
  } catch {
    // Sem armazenamento: o "visto" vale só até fechar o app.
  }
}

// ─── Regras (funções puras: recebem o "visto" atual e devolvem o próximo) ───────────

/**
 * Abrir o sino: as não lidas de agora viram vistas e a marca do portal sobe até `portalMaiorId`.
 * As chaves de quem já foi lido saem (a lista não cresce sem limite). Exceção: enquanto os
 * avisos internos não carregaram com sucesso, as chaves `aviso:` já vistas ficam, porque a lista
 * vazia de agora não quer dizer que foram lidos.
 */
export function aoAbrir(atual: Vistos, { chavesNaoLidas, avisosCarregados, portalMaiorId }: {
  chavesNaoLidas: string[];
  avisosCarregados: boolean;
  portalMaiorId: number;
}): Vistos {
  const mantidas = avisosCarregados ? [] : [...atual.chaves].filter((chave) => chave.startsWith("aviso:"));
  return { chaves: new Set([...mantidas, ...chavesNaoLidas]), portalAte: Math.max(atual.portalAte, portalMaiorId) };
}

/** Com o sino aberto, o que aparece no painel também fica visto. `atual` volta igual se nada mudou. */
export function comChaves(atual: Vistos, chaves: string[]): Vistos {
  if (chaves.every((chave) => atual.chaves.has(chave))) return atual;
  return { chaves: new Set([...atual.chaves, ...chaves]), portalAte: atual.portalAte };
}

/** A marca do portal só sobe. `atual` volta igual se não subiu. */
export function subirMarcaPortal(atual: Vistos, maiorId: number): Vistos {
  return maiorId > atual.portalAte ? { chaves: atual.chaves, portalAte: maiorId } : atual;
}

export function contarNovos(chavesNaoLidas: string[], vistos: Vistos): number {
  return chavesNaoLidas.filter((chave) => !vistos.chaves.has(chave)).length;
}
