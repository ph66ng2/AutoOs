import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import { ouvirPossivelQuedaDeConexao } from "@/lib/database-health";
import { reconnectDelaySeconds } from "@/lib/database-reconnect";
import { isTransientDatabaseError } from "@/lib/db-config";
import type { DatabaseInitError } from "@/types";

/** Quanto tempo "Conexão restabelecida" fica na tela. */
export const RESTORED_NOTICE_MS = 4000;

export type DatabaseHealth =
  | { status: "ok" }
  | {
      status: "caiu";
      error: DatabaseInitError;
      /** Início da queda (ms), para a linha "Sem conexão há N min". */
      downSince: number;
      reconnecting: boolean;
      /** Segundos até a próxima tentativa automática; null quando não tenta sozinho. */
      secondsLeft: number | null;
    }
  | { status: "restabelecida" };

/**
 * Saúde do banco com o app aberto. Não consulta nada enquanto tudo funciona:
 * só checa quando um comando falha com cara de queda (canal de
 * `database-health.ts`) ou quando o sistema avisa que a rede caiu ou voltou.
 */
export function useDatabaseHealth() {
  const [health, setHealth] = useState<DatabaseHealth>({ status: "ok" });
  const downRef = useRef(false);
  downRef.current = health.status === "caiu";
  const checkingRef = useRef(false);
  const attemptRef = useRef(0);

  const check = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setHealth((atual) => (atual.status === "caiu" ? { ...atual, reconnecting: true, secondsLeft: null } : atual));
    let erro: DatabaseInitError | null;
    try {
      erro = await db.verificarSaudeBanco();
    } catch (cause: unknown) {
      erro = { tipo: "desconhecido", mensagem: cause instanceof Error ? cause.message : String(cause || "Falha ao checar o banco.") };
    } finally {
      checkingRef.current = false;
    }

    if (!erro) {
      attemptRef.current = 0;
      setHealth((atual) => (atual.status === "caiu" ? { status: "restabelecida" } : atual));
      return;
    }
    const tipo = erro.tipo;
    const secondsLeft = isTransientDatabaseError(tipo) ? reconnectDelaySeconds(attemptRef.current, tipo) : null;
    attemptRef.current += 1;
    const falha = erro;
    setHealth((atual) => ({
      status: "caiu",
      error: falha,
      downSince: atual.status === "caiu" ? atual.downSince : Date.now(),
      reconnecting: false,
      secondsLeft,
    }));
  }, []);

  // Indícios de queda: comando que falhou com cara de conexão, ou rede do sistema.
  // Com a queda já confirmada, falhas novas de comando não antecipam a
  // tentativa: a espera (e o mínimo de 30 s com o servidor lotado) vale.
  // "Tentar agora" e a volta da rede continuam checando na hora.
  useEffect(() => {
    const suspeita = () => {
      if (downRef.current) return;
      void check();
    };
    const redeVoltou = () => void check();
    const parar = ouvirPossivelQuedaDeConexao(suspeita);
    window.addEventListener("offline", suspeita);
    window.addEventListener("online", redeVoltou);
    return () => {
      parar();
      window.removeEventListener("offline", suspeita);
      window.removeEventListener("online", redeVoltou);
    };
  }, [check]);

  // Contagem até a próxima tentativa automática.
  const secondsLeft = health.status === "caiu" ? health.secondsLeft : null;
  const reconnecting = health.status === "caiu" && health.reconnecting;
  useEffect(() => {
    if (secondsLeft === null || reconnecting) return;
    if (secondsLeft <= 0) {
      void check();
      return;
    }
    const timer = window.setTimeout(() => {
      setHealth((atual) =>
        atual.status === "caiu" && atual.secondsLeft !== null ? { ...atual, secondsLeft: atual.secondsLeft - 1 } : atual,
      );
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft, reconnecting, check]);

  // "Conexão restabelecida" some sozinho.
  useEffect(() => {
    if (health.status !== "restabelecida") return;
    const timer = window.setTimeout(() => {
      setHealth((atual) => (atual.status === "restabelecida" ? { status: "ok" } : atual));
    }, RESTORED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [health.status]);

  const tentarAgora = useCallback(() => void check(), [check]);

  return { health, tentarAgora };
}
