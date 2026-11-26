import type { DatabaseErrorKind } from "@/types";

/** Regras de reconexão comuns à tela de abertura e ao aviso com o app aberto. */

/** Espera entre tentativas automáticas, em segundos; a última se repete. */
export const RECONNECT_DELAYS_SECONDS = [5, 10, 20, 30];
/** Com o servidor lotado, nunca tentar antes disto (igual ao backoff do backend). */
export const CAPACITY_MIN_DELAY_SECONDS = 30;

export function reconnectDelaySeconds(attempt: number, tipo: DatabaseErrorKind): number {
  const index = Math.min(attempt, RECONNECT_DELAYS_SECONDS.length - 1);
  const delay = RECONNECT_DELAYS_SECONDS[index];
  return tipo === "capacidade" ? Math.max(delay, CAPACITY_MIN_DELAY_SECONDS) : delay;
}

/** A partir de quantos minutos sem conexão a tela sugere chamar alguém. */
export const LONG_OUTAGE_MINUTES = 5;

/** Linha de queda longa; antes de 5 min não diz nada (contar tentativas só assusta). */
export function longOutageMessage(downSinceMs: number, nowMs: number): string | null {
  const minutes = Math.floor((nowMs - downSinceMs) / 60_000);
  if (minutes < LONG_OUTAGE_MINUTES) return null;
  return `Sem conexão há ${minutes} min. Se continuar, chame o administrador.`;
}

type FailureKind = Exclude<DatabaseErrorKind, "nao_configurado">;

const COPY: Record<FailureKind, { title: string; description: string }> = {
  rede: {
    title: "Sem conexão com o servidor",
    description: "Confira a internet deste computador. O AutoOS tenta de novo sozinho.",
  },
  capacidade: {
    title: "Servidor ocupado",
    description: "Muitos computadores conectados agora. O AutoOS tenta de novo em instantes.",
  },
  desconhecido: {
    title: "Não foi possível abrir o AutoOS",
    description: "O servidor respondeu algo inesperado. O AutoOS tenta de novo sozinho.",
  },
  credencial: {
    title: "O banco precisa de ajuste",
    description: "A senha ou o endereço salvo foi recusado. Chame o administrador.",
  },
  configuracao_invalida: {
    title: "O banco precisa de ajuste",
    description: "A senha ou o endereço salvo foi recusado. Chame o administrador.",
  },
  incompativel: {
    title: "Banco de outra versão",
    description: "Este AutoOS e o banco estão em versões diferentes. Chame o administrador para atualizar.",
  },
};

/** Título e explicação de cada falha, iguais na tela de abertura e no aviso com o app aberto. */
export function failureCopy(tipo: DatabaseErrorKind) {
  return tipo === "nao_configurado" ? COPY.desconhecido : COPY[tipo];
}
