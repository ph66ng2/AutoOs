import { useCallback, useEffect, useState } from "react";
import PortalDetalhe from "./PortalDetalhe";
import PortalLista from "./PortalLista";
import PortalLogin from "./PortalLogin";
import { definirContatoEmpresa, portalApi, useContatoEmpresa, whatsappUrl } from "./portal-api";
import { clearSession, loadSession, navigate, parseRoute, saveSession, type PortalSession } from "./portal-session";
import { StatusBrand } from "./StatusView";

/** Portal das Impressoras do Cliente: `#/` lista, `#/atendimentos/<id>` detalhe, `#/entrar` login. */
const MENSAGEM_TESTE = "Olá, equipe BMI TAG! Estou testando o Portal das Impressoras e queria contar o que achei: ";

/** Faixa discreta de período de testes; o WhatsApp da empresa só existe depois de abrir um atendimento. */
function AvisoTeste() {
  const contato = useContatoEmpresa();
  const whatsapp = contato?.whatsapp ?? null;
  return (
    <p className="portal-beta" role="note">
      Portal em período de testes. Sua opinião ajuda muito:{" "}
      {whatsapp
        ? <a href={whatsappUrl(whatsapp, MENSAGEM_TESTE)} target="_blank" rel="noopener noreferrer">conte o que achou para a equipe.</a>
        : "conte o que achou para a equipe."}
    </p>
  );
}

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
    definirContatoEmpresa(null);
    setSession(null);
    setAviso(mensagem);
  }, []);

  const entrou = (nova: PortalSession) => {
    saveSession(nova);
    setSession(nova);
    setAviso(null);
    if (route.kind === "entrar") navigate("#/atendimentos");
  };

  const sair = async () => {
    const atual = session;
    clearSession();
    definirContatoEmpresa(null);
    setSession(null);
    setAviso("Você saiu do portal.");
    navigate("#/entrar");
    if (atual) await portalApi.sair(atual.token).catch(() => undefined);
  };

  return (
    <main className="status-shell portal-shell">
      <StatusBrand />
      <AvisoTeste />
      {session && (
        <div className="portal-userbar">
          <span>{session.contato}{session.acesso === "ACOMPANHAR" ? " · somente acompanhamento" : ""}</span>
          <button className="link-button" type="button" onClick={() => void sair()}>Sair</button>
        </div>
      )}

      {!session && <PortalLogin aviso={aviso} onEntrou={entrou} />}
      {session && route.kind === "detalhe" && <PortalDetalhe session={session} equipamentoId={route.id} onExpirou={expirou} />}
      {session && route.kind !== "detalhe" && <PortalLista session={session} onExpirou={expirou} />}

      <footer className="status-footer">
        <p>Portal das Impressoras BMI TAG. O acesso é pessoal: não compartilhe sua senha.</p>
        <p>Recebeu um link individual de acompanhamento? Ele continua funcionando.</p>
      </footer>
    </main>
  );
}
