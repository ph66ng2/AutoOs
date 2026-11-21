/**
 * "Visto" do sino: abrir o sino zera o número, sem marcar nada como lido. O número conta só o
 * que ainda não foi lido E chegou depois da última vez que este perfil abriu o sino (neste
 * computador). Dentro do sino, o não lido continua destacado até ser tratado.
 */
const PREFIXO = "autoos:sino-visto:";
const LIMITE = 500;

export function lerVistos(perfilId: number | null): Set<string> {
  if (perfilId == null) return new Set();
  try {
    const bruto = window.localStorage.getItem(PREFIXO + perfilId);
    const lista = bruto ? (JSON.parse(bruto) as unknown) : [];
    return new Set(Array.isArray(lista) ? lista.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

/** Junta as chaves não lidas de agora às já vistas e grava (as mais novas ficam, até o limite). */
export function marcarVistos(perfilId: number | null, vistos: Set<string>, chavesNaoLidas: string[]): Set<string> {
  const proximo = new Set(vistos);
  chavesNaoLidas.forEach((chave) => proximo.add(chave));
  const lista = [...proximo].slice(-LIMITE);
  if (perfilId != null) {
    try {
      window.localStorage.setItem(PREFIXO + perfilId, JSON.stringify(lista));
    } catch {
      // Sem armazenamento: o "visto" vale só até fechar o app.
    }
  }
  return new Set(lista);
}

export function contarNovos(chavesNaoLidas: string[], vistos: Set<string>): number {
  return chavesNaoLidas.filter((chave) => !vistos.has(chave)).length;
}
