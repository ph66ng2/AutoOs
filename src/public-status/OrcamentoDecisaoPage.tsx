import { useCallback, useEffect, useRef, useState } from "react";
import {
  consultarOrcamento,
  OrcamentoRequestError,
  responderOrcamento,
  solicitarContatoOrcamento,
  type DecisaoCliente,
  type OrcamentoErrorKind,
  type OrcamentoPublico,
} from "./orcamento-api";

const MAX_MESSAGE = 500;

function tokenFromFragment() {
  const match = window.location.hash.match(/^#\/o\/([a-f\d]{64})$/i);
  return match?.[1] ?? null;
}

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const time = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date(value));

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));

const VERB: Record<DecisaoCliente, string> = {
  APROVAR: "aprovou este orçamento",
  RECUSAR: "não aprovou este orçamento",
  DESFEITA: "retirou a resposta",
};

const ERROR_COPY: Record<OrcamentoErrorKind, { title: string; description: string }> = {
  "rate-limit": { title: "Muitas tentativas em seguida", description: "Aguarde um minuto e tente novamente." },
  service: { title: "Não foi possível concluir agora", description: "O serviço está temporariamente indisponível. Tente novamente em instantes." },
  unavailable: { title: "Este orçamento não está disponível", description: "O link pode ter vencido ou o orçamento foi atualizado. Fale com a equipe BMI TAG pelo canal em que recebeu o link." },
  outdated: { title: "A resposta mudou", description: "Atualizamos a página com a resposta mais recente. Confira e tente de novo." },
  applied: { title: "A equipe já registrou a decisão", description: "Use “Pedir mudança” para avisar a equipe." },
  limit: { title: "Muitas mensagens enviadas", description: "Fale com a equipe BMI TAG pelo canal em que recebeu o link." },
};

type Pending = { decisao: Exclude<DecisaoCliente, "DESFEITA"> } | null;
type Contact = { tipo: "DUVIDA" | "MUDANCA" } | null;

export default function OrcamentoDecisaoPage() {
  const [token, setToken] = useState<string | null>(tokenFromFragment);
  const [data, setData] = useState<OrcamentoPublico | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [fatal, setFatal] = useState<OrcamentoErrorKind | null>(token ? null : "unavailable");
  const [notice, setNotice] = useState<OrcamentoErrorKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [contact, setContact] = useState<Contact>(null);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<"DUVIDA" | "MUDANCA" | null>(null);
  const seq = useRef(0);
  const tokenRef = useRef(token);

  useEffect(() => {
    const sync = () => {
      const next = tokenFromFragment();
      if (next === tokenRef.current) return;
      tokenRef.current = next;
      seq.current += 1;
      setToken(next);
      setData(null);
      setPending(null);
      setContact(null);
      setSent(null);
      setNotice(null);
      setFatal(next ? null : "unavailable");
      setLoading(Boolean(next));
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const load = useCallback(async (silent = false) => {
    const requested = token;
    const id = ++seq.current;
    if (!requested) {
      setFatal("unavailable");
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setFatal(null);
    try {
      const result = await consultarOrcamento(requested);
      if (id !== seq.current || tokenRef.current !== requested) return;
      setData(result);
    } catch (cause) {
      if (id !== seq.current || tokenRef.current !== requested) return;
      setData(null);
      setFatal(cause instanceof OrcamentoRequestError ? cause.kind : "service");
    } finally {
      if (id === seq.current && tokenRef.current === requested) setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function responder(decisao: DecisaoCliente) {
    if (!token || !data || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await responderOrcamento(token, decisao, data.resposta?.id ?? 0);
      setPending(null);
      await load(true);
    } catch (cause) {
      const kind = cause instanceof OrcamentoRequestError ? cause.kind : "service";
      setPending(null);
      if (kind === "outdated" || kind === "applied") {
        setNotice(kind);
        await load(true);
      } else if (kind === "unavailable") {
        setData(null);
        setFatal(kind);
      } else {
        setNotice(kind);
      }
    } finally {
      setBusy(false);
    }
  }

  async function enviarMensagem() {
    if (!token || !contact || busy) return;
    const texto = message.trim();
    if (!texto) return;
    setBusy(true);
    setNotice(null);
    try {
      await solicitarContatoOrcamento(token, contact.tipo, texto);
      setSent(contact.tipo);
      setContact(null);
      setMessage("");
    } catch (cause) {
      const kind = cause instanceof OrcamentoRequestError ? cause.kind : "service";
      if (kind === "unavailable") {
        setData(null);
        setFatal(kind);
      } else {
        setNotice(kind);
      }
    } finally {
      setBusy(false);
    }
  }

  const resposta = data?.resposta && data.resposta.decisao !== "DESFEITA" ? data.resposta : null;
  const aberto = data?.estado === "ABERTO";
  const total = data ? money(data.valorTotal) : "";

  return (
    <main className="status-shell">
      <header className="status-brand" aria-label="AutoOS BMI TAG">
        <img src="/logo-tag-trasparente.svg" alt="AutoOS BMI TAG" />
      </header>

      <section className="status-card" aria-live="polite">
        <p className="eyebrow">Orçamento para sua decisão</p>

        {loading && (
          <div className="loading-state" role="status">
            <span className="spinner" aria-hidden="true" />
            <p>Consultando o orçamento…</p>
          </div>
        )}

        {!loading && fatal && (
          <div className="error-state">
            <h1>{ERROR_COPY[fatal].title}</h1>
            <p>{ERROR_COPY[fatal].description}</p>
            {fatal !== "unavailable" && (
              <button className="refresh-button" type="button" onClick={() => void load()}>Tentar novamente</button>
            )}
          </div>
        )}

        {!loading && !fatal && data && (
          <>
            <p className="equipment-name" title={data.equipamento}>{data.equipamento}</p>
            <h1>{total}</h1>
            {data.validoAte && aberto && <p className="orientation">Válido até {dateTime(data.validoAte)}.</p>}

            <ul className="quote-list" aria-label="Serviços do orçamento">
              {data.servicos.map((servico, index) => (
                <li key={`${servico.descricao}-${index}`}>
                  <span className="quote-line"><span>{servico.descricao}</span><strong>{money(servico.valor)}</strong></span>
                  {servico.pecas.map((peca, i) => (
                    <span className="quote-part" key={`${peca.nome}-${i}`}>
                      {peca.quantidade} × {peca.nome}{peca.valorUnitario ? ` · ${money(peca.valorUnitario)}` : ""}
                    </span>
                  ))}
                </li>
              ))}
              {data.servicos.length === 0 && data.pecas.map((peca, index) => (
                <li key={`${peca.nome}-${index}`}>
                  <span className="quote-line"><span>{peca.quantidade} × {peca.nome}</span>{peca.valorTotal ? <strong>{money(peca.valorTotal)}</strong> : null}</span>
                </li>
              ))}
            </ul>
            <p className="quote-total"><span>Total</span><strong>{total}</strong></p>

            {notice && (
              <p role="alert" className="notice-box">
                <strong>{ERROR_COPY[notice].title}.</strong> {ERROR_COPY[notice].description}
              </p>
            )}

            {aberto && resposta && !pending && (
              <div className="answer-box" role="status">
                <h2>Resposta recebida às {time(resposta.registradaEm)}</h2>
                <p>Você {VERB[resposta.decisao]} de {total}. A equipe ainda não iniciou o serviço.</p>
                <p className="answer-hint">
                  Você pode desfazer ou alterar até a equipe aplicar a resposta. Ela aguarda pelo menos {data.janelaMinutos} minutos, até {time(resposta.janelaAte)}.
                </p>
                <div className="action-row">
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => void responder("DESFEITA")}>Desfazer resposta</button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setPending({ decisao: resposta.decisao === "APROVAR" ? "RECUSAR" : "APROVAR" })}
                  >
                    {resposta.decisao === "APROVAR" ? "Alterar para: não aprovar" : "Alterar para: aprovar"}
                  </button>
                </div>
              </div>
            )}

            {aberto && !resposta && !pending && (
              <div className="action-stack">
                <button type="button" className="primary-button" disabled={busy} onClick={() => setPending({ decisao: "APROVAR" })}>
                  Aprovar este orçamento de {total}
                </button>
                <button type="button" className="secondary-button" disabled={busy} onClick={() => setPending({ decisao: "RECUSAR" })}>
                  Não aprovar
                </button>
              </div>
            )}

            {aberto && pending && (
              <div className="confirm-box" role="alertdialog" aria-labelledby="confirm-title">
                <h2 id="confirm-title">
                  {pending.decisao === "APROVAR" ? `Confirmar a aprovação de ${total}?` : "Confirmar que você não aprova este orçamento?"}
                </h2>
                <p>Nada é decidido até você confirmar. A equipe só inicia o serviço depois de conferir a sua resposta.</p>
                <div className="action-row">
                  <button type="button" className="primary-button" disabled={busy} onClick={() => void responder(pending.decisao)}>
                    {pending.decisao === "APROVAR" ? "Confirmar aprovação" : "Confirmar: não aprovar"}
                  </button>
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => setPending(null)}>Voltar</button>
                </div>
              </div>
            )}

            {!aberto && (
              <div className="answer-box" role="status">
                <h2>A equipe já registrou sua decisão</h2>
                <p>
                  {data.resposta?.decisao === "RECUSAR"
                    ? "Este orçamento foi registrado como não aprovado."
                    : "Este orçamento foi registrado como aprovado."}
                </p>
                <p className="answer-hint">
                  Se precisar mudar algo, peça à equipe. O serviço pode já ter começado, então o cancelamento não é automático.
                </p>
              </div>
            )}

            {sent && (
              <p role="status" className="sent-box">
                {sent === "DUVIDA"
                  ? "Mensagem enviada. A equipe BMI TAG responderá pelo canal em que você recebeu o orçamento."
                  : "Pedido enviado. A equipe vai avaliar e entrar em contato; ele não cancela nada automaticamente."}
              </p>
            )}

            {contact ? (
              <div className="contact-box">
                <label htmlFor="mensagem-orcamento">
                  {contact.tipo === "DUVIDA" ? "Qual é a sua dúvida?" : "O que você gostaria de mudar?"}
                </label>
                <textarea
                  id="mensagem-orcamento"
                  value={message}
                  maxLength={MAX_MESSAGE}
                  rows={4}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <p className="answer-hint">{message.length}/{MAX_MESSAGE} · Não envie senhas nem dados de cartão.</p>
                <div className="action-row">
                  <button type="button" className="primary-button" disabled={busy || !message.trim()} onClick={() => void enviarMensagem()}>
                    {contact.tipo === "DUVIDA" ? "Enviar dúvida" : "Enviar pedido"}
                  </button>
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => { setContact(null); setMessage(""); }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="action-row">
                {aberto ? (
                  <button type="button" className="link-button" disabled={busy || Boolean(pending)} onClick={() => { setSent(null); setContact({ tipo: "DUVIDA" }); }}>
                    Tenho uma dúvida
                  </button>
                ) : (
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => { setSent(null); setContact({ tipo: "MUDANCA" }); }}>
                    Pedir mudança
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <footer className="status-footer">
        <p>Possuir este link permite responder ao orçamento. Não o compartilhe.</p>
        <p>Para qualquer dúvida, fale com a equipe BMI TAG pelo canal em que recebeu este link.</p>
      </footer>
    </main>
  );
}
