import { useCallback, useEffect, useState } from "react";
import PortalDetalhe from "./PortalDetalhe";
import PortalLista from "./PortalLista";
import PortalLogin from "./PortalLogin";
import { definirContatoEmpresa, portalApi, whatsappUrl } from "./portal-api";
import { clearSession, loadSession, navigate, parseRoute, saveSession, type PortalSession } from "./portal-session";
import { StatusBrand } from "./StatusView";

/** Portal das Impressoras do Cliente: `#/` lista, `#/atendimentos/<id>` detalhe, `#/entrar` login. */
const MENSAGEM_TESTE = "Olá, equipe BMI TAG! Estou testando o Portal das Impressoras e queria contar o que achei: ";

/**
 * WhatsApp do feedback do período de testes: o mesmo número principal do site bmitag.com.br.
 * Fixo de propósito (portal interno da BMI TAG, decisão do responsável): o botão aparece já no login.
 */
const WHATSAPP_FEEDBACK = "5571981650801";

function IconeWhatsapp() {
  return (
    <svg className="portal-feedback-icone" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z" />
    </svg>
  );
}

/** Faixa do período de testes com um botão que abre o WhatsApp com a mensagem já começada. */
function AvisoTeste() {
  return (
    <div className="portal-beta" role="note">
      <span>Portal em período de testes. Sua opinião ajuda muito.</span>
      <a className="portal-feedback" href={whatsappUrl(WHATSAPP_FEEDBACK, MENSAGEM_TESTE)} target="_blank" rel="noopener noreferrer">
        <IconeWhatsapp />
        Enviar feedback pelo WhatsApp
      </a>
    </div>
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
    <>
    {/* Entrar: céu pixelado alto atrás do título e da manada (só enfeite). Logado, o céu fica só no topo. */}
    {!session && <div className="portal-ceu is-alto" aria-hidden="true" />}
    <main className="status-shell portal-shell">
      {/* Barra do topo (prancheta do Portal): marca à esquerda, quem está logado e Sair à direita. */}
      <div className={`portal-topo${session ? " tem-ceu" : ""}`}>
        <div className="portal-topbar">
          <StatusBrand />
          <span className="portal-topbar-nome" aria-hidden="true">Portal das Impressoras</span>
          {session && (
            <div className="portal-userbar">
              <div className="portal-quem">
                <span className="portal-quem-inicial" aria-hidden="true">{session.contato.trim().charAt(0).toUpperCase() || "?"}</span>
                <span className="portal-quem-texto">
                  <strong>{session.contato}</strong>
                  <small>{session.acesso === "ACOMPANHAR" ? "Somente acompanhamento" : "Pode responder orçamentos"}</small>
                </span>
              </div>
              <button className="secondary-button portal-sair" type="button" onClick={() => void sair()}>Sair</button>
            </div>
          )}
        </div>
        <AvisoTeste />
      </div>

      {!session && <PortalLogin aviso={aviso} onEntrou={entrou} />}
      {session && route.kind === "detalhe" && <PortalDetalhe session={session} equipamentoId={route.id} onExpirou={expirou} />}
      {session && route.kind !== "detalhe" && <PortalLista session={session} onExpirou={expirou} />}

      <footer className="status-footer">
        <p>Portal das Impressoras BMI TAG. O acesso é pessoal: não compartilhe sua senha.</p>
        <p>Recebeu um link individual de acompanhamento? Ele continua funcionando.</p>
      </footer>
    </main>
    </>
  );
}
