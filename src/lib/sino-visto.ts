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

/** Abrir o sino: as não lidas de agora viram vistas e a marca do portal sobe até `portalAte`. */
export function marcarVistos(perfilId: number | null, atual: Vistos, chavesNaoLidas: string[], portalAte: number): Vistos {
  const proximo: Vistos = { chaves: new Set(chavesNaoLidas), portalAte: Math.max(atual.portalAte, portalAte) };
  if (perfilId != null) {
    try {
      window.localStorage.setItem(PREFIXO + perfilId, JSON.stringify({ chaves: [...proximo.chaves], portalAte: proximo.portalAte }));
    } catch {
      // Sem armazenamento: o "visto" vale só até fechar o app.
    }
  }
  return proximo;
}

export function contarNovos(chavesNaoLidas: string[], vistos: Vistos): number {
  return chavesNaoLidas.filter((chave) => !vistos.chaves.has(chave)).length;
}
