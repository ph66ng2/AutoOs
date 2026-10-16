import { useCallback, useEffect, useState } from "react";
import CriarSenha from "./CriarSenha";
import PortalDetalhe from "./PortalDetalhe";
import PortalLista from "./PortalLista";
import PortalLogin from "./PortalLogin";
import { portalApi } from "./portal-api";
import { clearSession, loadSession, navigate, parseRoute, saveSession, type PortalSession } from "./portal-session";
import { StatusBrand } from "./StatusView";

/** Portal das Impressoras do Cliente: `#/` lista, `#/atendimentos/<id>` detalhe, `#/entrar` login. */
export default function PortalApp() {
  const [session, setSession] = useState<PortalSession | null>(loadSession);
  const [route, setRoute] = useState(() => parseRoute());
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setRoute(parseRoute());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const expirou = useCallback((mensagem: string) => {
    clearSession();
    setSession(null);
    setAviso(mensagem);
  }, []);

  const entrou = (nova: PortalSession) => {
    saveSession(nova);
    setSession(nova);
    setAviso(null);
    if (route.kind === "entrar") navigate("#/atendimentos");
  };

  const senhaCriada = () => {
    if (!session) return;
    const atualizada = { ...session, trocarSenha: undefined };
    saveSession(atualizada);
    setSession(atualizada);
    navigate("#/atendimentos");
  };

  const sair = async () => {
    const atual = session;
    clearSession();
    setSession(null);
    setAviso("Você saiu do portal.");
    navigate("#/entrar");
    if (atual) await portalApi.sair(atual.token).catch(() => undefined);
  };

  return (
    <main className="status-shell portal-shell">
      <StatusBrand />
      {session && (
        <div className="portal-userbar">
          <span>{session.contato}{session.acesso === "ACOMPANHAR" ? " · somente acompanhamento" : ""}</span>
          <button className="link-button" type="button" onClick={() => void sair()}>Sair</button>
        </div>
      )}

      {!session && <PortalLogin aviso={aviso} onEntrou={entrou} />}
      {session?.trocarSenha && <CriarSenha session={session} onConcluido={senhaCriada} onExpirou={expirou} />}
      {session && !session.trocarSenha && route.kind === "detalhe" && (
        <PortalDetalhe session={session} equipamentoId={route.id} onExpirou={expirou} />
      )}
      {session && !session.trocarSenha && route.kind !== "detalhe" && <PortalLista session={session} onExpirou={expirou} />}

      <footer className="status-footer">
        <p>Portal das Impressoras BMI TAG. O acesso é pessoal: não compartilhe sua senha nem seus códigos.</p>
        <p>Recebeu um link individual de acompanhamento? Ele continua funcionando.</p>
      </footer>
    </main>
  );
}
