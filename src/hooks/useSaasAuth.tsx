import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createSaasAuthService } from "@/lib/saas-auth";
import { SaasAuthError, type SaasAuthService, type SaasAuthState } from "@/types/saas-auth";

interface SaasAuthContextValue {
  state: SaasAuthState;
  login(email: string, password: string): Promise<void>;
  retry(): Promise<void>;
  lock(): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordRecovery(email: string): Promise<void>;
}

const SaasAuthContext = createContext<SaasAuthContextValue | null>(null);
const REFRESH_MARGIN_MS = 60_000;
const MAX_TIMEOUT_MS = 2_147_000_000;

function safeMessage(error: unknown): string {
  if (error instanceof SaasAuthError) return error.message;
  return "Não foi possível concluir a autenticação. Tente novamente.";
}

export function SaasAuthProvider({ children, service }: { children: ReactNode; service?: SaasAuthService }) {
  const [state, setState] = useState<SaasAuthState>({ kind: "booting" });
  const bootStarted = useRef(false);
  const serviceResult = useMemo(() => {
    try {
      return { service: service ?? createSaasAuthService(), error: null };
    } catch (error) {
      return { service: null, error };
    }
  }, [service]);

  const requireService = useCallback(() => {
    if (serviceResult.service) return serviceResult.service;
    throw serviceResult.error;
  }, [serviceResult]);

  const restore = useCallback(async () => {
    setState({ kind: "booting" });
    try {
      setState(await requireService().restoreSession());
    } catch (error) {
      setState({ kind: "signed_out", message: safeMessage(error) });
    }
  }, [requireService]);

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    void restore();
  }, [restore]);

  useEffect(() => {
    if (state.kind !== "authenticated") return;
    const delay = Math.min(
      MAX_TIMEOUT_MS,
      Math.max(0, state.session.expiresAt * 1_000 - Date.now() - REFRESH_MARGIN_MS),
    );
    const timer = window.setTimeout(() => {
      void requireService().refreshSession(state.session)
        .then(setState)
        .catch((error) => setState({ kind: "signed_out", message: safeMessage(error) }));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [requireService, state]);

  const value = useMemo<SaasAuthContextValue>(() => ({
    state,
    async login(email, password) {
      setState({ kind: "booting" });
      try {
        const session = await requireService().login(email, password);
        setState({ kind: "authenticated", session });
      } catch (error) {
        setState({ kind: "signed_out", message: safeMessage(error) });
        throw error;
      }
    },
    retry: restore,
    async lock() {
      await requireService().lock();
      setState({ kind: "locked" });
    },
    async signOut() {
      const session = state.kind === "authenticated" || state.kind === "offline_recoverable"
        ? state.session
        : undefined;
      const result = await requireService().signOut(session);
      setState({
        kind: "signed_out",
        message: result.revoked
          ? "Sessão encerrada neste dispositivo."
          : "Sessão local removida. Não foi possível avisar o servidor porque ele está indisponível.",
      });
    },
    requestPasswordRecovery(email) {
      return requireService().requestPasswordRecovery(email);
    },
  }), [requireService, restore, state]);

  return <SaasAuthContext.Provider value={value}>{children}</SaasAuthContext.Provider>;
}

export function useSaasAuth(): SaasAuthContextValue {
  const context = useContext(SaasAuthContext);
  if (!context) throw new Error("useSaasAuth deve ser usado dentro de SaasAuthProvider");
  return context;
}
