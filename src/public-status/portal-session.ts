import type { Acesso } from "./portal-api";

/**
 * Sessão do portal no `sessionStorage`: some ao fechar a aba e não fica num computador
 * compartilhado. O servidor também expira a sessão e pode encerrá-la a qualquer momento.
 */
export interface PortalSession {
  token: string;
  contato: string;
  acesso: Acesso;
  expiraEm: string;
  metodo?: "SENHA" | "CODIGO";
  /**
   * `obrigatoria`: entrou com a senha provisória criada pela equipe (o servidor bloqueia o resto).
   * `esqueci`: entrou pelo código para criar uma senha nova.
   */
  trocarSenha?: "obrigatoria" | "esqueci";
}

const KEY = "autoos.portal.sessao";

export function loadSession(): PortalSession | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortalSession;
    if (!/^[0-9a-f]{64}$/.test(parsed.token) || new Date(parsed.expiraEm).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: PortalSession) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Sem armazenamento (aba privada restrita): a sessão vale enquanto a página estiver aberta.
  }
}

export function clearSession() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nada a limpar.
  }
}

export type PortalRoute = { kind: "lista" } | { kind: "detalhe"; id: number } | { kind: "entrar" };

export function parseRoute(hash = window.location.hash): PortalRoute {
  const detalhe = hash.match(/^#\/atendimentos\/(\d{1,9})$/);
  if (detalhe) return { kind: "detalhe", id: Number(detalhe[1]) };
  if (hash === "#/entrar") return { kind: "entrar" };
  return { kind: "lista" };
}

export function navigate(hash: string) {
  if (window.location.hash !== hash) window.location.hash = hash;
}

export type Area = "status" | "portal";

/**
 * `#/c/<token>`: link individual de acompanhamento (já enviado a clientes; não muda).
 * Qualquer outro endereço, inclusive o antigo `#/o/<token>` do link de decisão: Portal do Cliente.
 */
export function areaFromHash(hash = window.location.hash): Area {
  if (hash.startsWith("#/c/")) return "status";
  return "portal";
}
