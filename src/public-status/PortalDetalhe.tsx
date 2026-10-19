import { useCallback, useEffect, useRef, useState } from "react";
import PortalOrcamento from "./PortalOrcamento";
import { PortalError, portalApi, shortDate, type ContatoEmpresa, type DetalheAtendimento } from "./portal-api";
import { navigate, type PortalSession } from "./portal-session";
import { formatDate, StatusView } from "./StatusView";
import PortalFotos from "./PortalFotos";
import PortalHistorico from "./PortalHistorico";
import { DestaqueConcluido, DestaqueProntoRetirada, DocumentosCard, NotaValorAtualizado } from "./PortalDestaques";

const REFRESH_MS = 60_000;

type Props = {
  session: PortalSession;
  equipamentoId: number;
  onExpirou: (mensagem: string) => void;
};

/** Detalhe = a tela pública de status + orçamento publicado + contato da equipe. */
export default function PortalDetalhe({ session, equipamentoId, onExpirou }: Props) {
  const [data, setData] = useState<DetalheAtendimento | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const seq = useRef(0);
  const temDados = useRef(false);

  const carregar = useCallback(async (silencioso = false): Promise<DetalheAtendimento | null> => {
    const id = ++seq.current;
    if (!silencioso) setLoading(true);
    try {
      const result = await portalApi.detalhe(session.token, equipamentoId);
      if (id !== seq.current) return result;
      setData(result);
      temDados.current = true;
      setErro(null);
      setCheckedAt(new Date().toISOString());
      return result;
    } catch (cause) {
      if (id !== seq.current) return null;
      if (cause instanceof PortalError && cause.status === 401) {
        onExpirou(cause.message);
        return null;
      }
      if (!silencioso || !temDados.current) {
        setData(null);
        temDados.current = false;
        setErro(cause instanceof PortalError ? cause.message : "Não foi possível consultar o atendimento.");
      }
      return null;
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [session.token, equipamentoId, onExpirou]);

  const recarregar = useCallback(() => carregar(true), [carregar]);

  useEffect(() => {
    setData(null);
    temDados.current = false;
    void carregar();
  }, [carregar]);

  // Atualização periódica: uma proposta nova ou a efetivação aparecem sem recarregar a página.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void carregar(true);
    }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void carregar(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [carregar]);

  return (
    <>
      <nav className="portal-back">
        <a href="#/atendimentos" onClick={(event) => { event.preventDefault(); navigate("#/atendimentos"); }}>← Todos os atendimentos</a>
        {data && (
          <button className="link-button" type="button" onClick={() => void carregar()} disabled={loading}>
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        )}
      </nav>
      <section className={`status-card${data?.status === "ENTREGUE" ? " is-concluido" : ""}`} aria-live="polite">
        <p className="eyebrow">Portal das Impressoras</p>

        {loading && !data && (
          <div className="loading-state" role="status">
            <span className="spinner" aria-hidden="true" />
            <p>Consultando o atendimento…</p>
          </div>
        )}

        {!loading && erro && !data && (
          <div className="error-state">
            <h1>Este atendimento não está disponível</h1>
            <p>{erro}</p>
            <button className="refresh-button" type="button" onClick={() => void carregar()}>Tentar novamente</button>
          </div>
        )}

        {data && (() => {
          const fotos = data.fotos ?? [];
          const historico = data.historico ?? [];
          const resposta = data.orcamento?.resposta;
          const emDecisao = data.status === "AGUARDANDO_APROVACAO" && data.orcamento?.estado === "ABERTA" && !(resposta && resposta.decisao !== "DESFEITA");
          const concluido = data.status === "ENTREGUE";
          const galeriaLateral = emDecisao || concluido || data.status === "PRONTO";
          const galeria = fotos.length > 0 && <PortalFotos fotos={fotos} equipamento={data.equipamento} destaque={emDecisao} />;
          return (
          <>
            {/* Celular: uma coluna. Tela larga: status à esquerda, orçamento e contato à direita. */}
            <div className="portal-detail-grid">
              <div className="portal-detail-main">
                <StatusView
                  equipamento={data.equipamento}
                  titulo={data.titulo}
                  orientacao={data.orientacao}
                  statusAlteradoEm={data.statusAlteradoEm}
                  compacto
                  etapas={data.etapas}
                  concluido={concluido}
                  identificacao={(data.serie || data.patrimonio || data.entradaEm) && (
                    <p className="portal-identification">
                      {data.serie && <>Série {data.serie}</>}
                      {data.patrimonio && <> · Patrimônio {data.patrimonio}</>}
                      {data.entradaEm && <> · Entrada em {shortDate(data.entradaEm)}</>}
                    </p>
                  )}
                />
                {!galeriaLateral && galeria}
              </div>
              <div className={`portal-detail-side${emDecisao ? " is-decisao" : ""}`}>
                {data.status === "PRONTO" && <DestaqueProntoRetirada detalhe={data} />}
                {concluido && <DestaqueConcluido detalhe={data} />}
                {galeriaLateral && galeria}
                {!["PRONTO", "ENTREGUE"].includes(data.status) && <NotaValorAtualizado detalhe={data} />}
                {data.orcamento && (
                  <PortalOrcamento
                    session={session}
                    detalhe={data}
                    orcamento={data.orcamento}
                    recarregar={recarregar}
                    onExpirou={onExpirou}
                  />
                )}
                {!data.orcamento && data.status === "AGUARDANDO_APROVACAO" && (
                  <p className="notice-box">O orçamento ainda não foi publicado no portal. Fale com a equipe para recebê-lo.</p>
                )}

                {!concluido && <DocumentosCard detalhe={data} />}
                <PortalHistorico historico={historico} />

                <ContatoCard contato={data.contatoEmpresa} />
              </div>
            </div>

            {checkedAt && <p className="checked-at">Consulta realizada em {formatDate(checkedAt)}.</p>}
          </>
          );
        })()}
      </section>
    </>
  );
}

function ContatoCard({ contato }: { contato: ContatoEmpresa | null }) {
  if (!contato || (!contato.whatsapp && !contato.email && !contato.telefone)) {
    return (
      <div className="contact-card">
        <h2>Fale com a equipe</h2>
        <p>Use o canal em que você costuma falar com a BMI TAG.</p>
      </div>
    );
  }
  const whatsappDigits = contato.whatsapp?.replace(/\D/g, "") ?? "";
  return (
    <div className="contact-card">
      <h2>Fale com {contato.nome}</h2>
      <ul>
        {contato.whatsapp && (
          <li>
            <a href={`https://wa.me/${whatsappDigits.startsWith("55") && whatsappDigits.length >= 12 ? whatsappDigits : `55${whatsappDigits}`}`} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          </li>
        )}
        {contato.email && <li><a href={`mailto:${contato.email}`}>{contato.email}</a></li>}
        {contato.telefone && <li><a href={`tel:${contato.telefone.replace(/[^\d+]/g, "")}`}>{contato.telefone}</a></li>}
      </ul>
      {contato.horario && <p className="answer-hint">{contato.horario}</p>}
    </div>
  );
}
