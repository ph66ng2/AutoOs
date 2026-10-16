import { useEffect, useRef, useState, type FormEvent } from "react";
import { CodigoForm } from "./CodigoForm";
import {
  dateTime,
  mensagemWhatsapp,
  money,
  PortalError,
  portalApi,
  shortDate,
  shortTime,
  whatsappUrl,
  type Comprovante,
  type Decisao,
  type DetalheAtendimento,
  type OrcamentoPortal,
  type SolicitacaoRegistrada,
} from "./portal-api";
import type { PortalSession } from "./portal-session";

type Etapa =
  | { tipo: "verificar"; depois: Decisao; desafio: string | null; canal: "WHATSAPP" | "EMAIL" | null }
  | { tipo: "confirmar"; decisao: Decisao; versaoId: number }
  | { tipo: "negociar" }
  | { tipo: "corrigir" }
  | null;

const ROTULO_DECISAO: Record<Decisao, string> = {
  APROVAR: "Aceite do orçamento",
  RECUSAR: "Recusa do orçamento",
  DESFEITA: "Resposta cancelada",
};

const ACAO_WHATSAPP: Record<Decisao, string> = {
  APROVAR: "aceitei o orçamento",
  RECUSAR: "recusei o orçamento",
  DESFEITA: "cancelei minha resposta ao orçamento",
};

/** Conflitos em que a página recarrega e mostra a explicação no lugar da confirmação. */
const RECARREGAR = new Set([
  "PROPOSTA_ALTERADA", "RESPOSTA_DESATUALIZADA", "RESPOSTA_DE_OUTRO_CONTATO", "RESPOSTA_JA_EFETIVADA",
  "RESPOSTA_JA_REGISTRADA", "PRAZO_CORRECAO_ENCERRADO", "PROPOSTA_VENCIDA", "ACEITE_PAUSADO", "NADA_A_DESFAZER",
]);

type Props = {
  session: PortalSession;
  detalhe: DetalheAtendimento;
  orcamento: OrcamentoPortal;
  recarregar: () => Promise<DetalheAtendimento | null>;
  onExpirou: (mensagem: string) => void;
};

export default function PortalOrcamento({ session, detalhe, orcamento, recarregar, onExpirou }: Props) {
  const [etapa, setEtapa] = useState<Etapa>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [comprovante, setComprovante] = useState<Comprovante | null>(null);
  const [solicitacao, setSolicitacao] = useState<SolicitacaoRegistrada | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [senha, setSenha] = useState("");
  const [usarCodigo, setUsarCodigo] = useState(false);
  const porSenha = detalhe.metodo === "SENHA" && !usarCodigo;
  const [agora, setAgora] = useState(() => Date.now());
  const versaoAnterior = useRef(orcamento.versaoId);

  const resposta = orcamento.resposta;
  const respostaAtiva = resposta && resposta.decisao !== "DESFEITA" ? resposta : null;
  const janelaAte = respostaAtiva ? new Date(respostaAtiva.janelaAte).getTime() : 0;
  const emCorrecao = respostaAtiva?.estado === "EM_CORRECAO" && janelaAte > agora;
  const podeResponder = detalhe.podeDecidir && orcamento.aceiteOnline && orcamento.estado === "ABERTA" && !respostaAtiva;
  const podeMudar = detalhe.podeDecidir && orcamento.aceiteOnline && emCorrecao && respostaAtiva?.propria;

  // A proposta mudou com a página aberta: a confirmação antiga não vale mais.
  useEffect(() => {
    if (versaoAnterior.current !== orcamento.versaoId) {
      versaoAnterior.current = orcamento.versaoId;
      setEtapa(null);
      setComprovante(null);
      setAviso(`A proposta foi atualizada para a versão ${orcamento.versao}. Releia antes de responder.`);
    }
  }, [orcamento.versaoId, orcamento.versao]);

  // Contagem do prazo de correção; ao terminar, a página busca o estado novo.
  useEffect(() => {
    if (!emCorrecao) return;
    const timer = window.setInterval(() => setAgora(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [emCorrecao]);
  useEffect(() => {
    if (respostaAtiva?.estado === "EM_CORRECAO" && janelaAte <= agora) void recarregar();
  }, [agora, janelaAte, respostaAtiva?.estado, recarregar]);

  const tratarErro = async (cause: unknown) => {
    if (cause instanceof PortalError) {
      if (cause.status === 401) {
        onExpirou(cause.message);
        return;
      }
      if (cause.codigo === "VERIFICACAO_NECESSARIA" && etapa?.tipo === "confirmar") {
        setEtapa({ tipo: "verificar", depois: etapa.decisao, desafio: null, canal: null });
        setErro(null);
        return;
      }
      if (cause.codigo && RECARREGAR.has(cause.codigo)) {
        setEtapa(null);
        setErro(null);
        setAviso(cause.message);
        await recarregar();
        return;
      }
      setErro(cause.message);
      return;
    }
    setErro("Não foi possível concluir agora. Tente novamente.");
  };

  const iniciar = (decisao: Decisao) => {
    setErro(null);
    setAviso(null);
    if (!detalhe.verificacaoRecente && decisao !== "DESFEITA") {
      setEtapa({ tipo: "verificar", depois: decisao, desafio: null, canal: null });
      return;
    }
    setEtapa({ tipo: "confirmar", decisao, versaoId: orcamento.versaoId });
  };

  const pedirCodigo = async (canal: "WHATSAPP" | "EMAIL") => {
    if (etapa?.tipo !== "verificar") return;
    setBusy(true);
    setErro(null);
    try {
      const result = await portalApi.novoCodigo(session.token, canal);
      setEtapa({ ...etapa, desafio: result.desafio, canal });
    } catch (cause) {
      await tratarErro(cause);
    } finally {
      setBusy(false);
    }
  };

  const confirmarCodigo = async (codigo: string) => {
    if (etapa?.tipo !== "verificar" || !etapa.desafio) return;
    setBusy(true);
    setErro(null);
    try {
      await portalApi.verificarCodigo(etapa.desafio, codigo, session.token);
      const novo = await recarregar();
      const versaoId = novo?.orcamento?.versaoId ?? orcamento.versaoId;
      setEtapa({ tipo: "confirmar", decisao: etapa.depois, versaoId });
    } catch (cause) {
      await tratarErro(cause);
    } finally {
      setBusy(false);
    }
  };

  const confirmarSenha = async (event: FormEvent) => {
    event.preventDefault();
    if (etapa?.tipo !== "verificar" || !senha) return;
    setBusy(true);
    setErro(null);
    try {
      await portalApi.confirmarSenha(session.token, senha);
      setSenha("");
      const novo = await recarregar();
      const versaoId = novo?.orcamento?.versaoId ?? orcamento.versaoId;
      setEtapa({ tipo: "confirmar", decisao: etapa.depois, versaoId });
    } catch (cause) {
      await tratarErro(cause);
    } finally {
      setBusy(false);
    }
  };

  const responder = async () => {
    if (etapa?.tipo !== "confirmar") return;
    if (etapa.versaoId !== orcamento.versaoId) {
      setEtapa(null);
      setAviso("A proposta mudou. Releia a versão atual antes de responder.");
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      const result = await portalApi.responder(session.token, detalhe.id, etapa.versaoId, etapa.decisao, resposta?.id ?? null);
      setComprovante(result.comprovante);
      setEtapa(null);
      await recarregar();
    } catch (cause) {
      await tratarErro(cause);
    } finally {
      setBusy(false);
    }
  };

  const solicitar = async (tipo: "NEGOCIAR" | "MUDANCA") => {
    setBusy(true);
    setErro(null);
    try {
      const result = await portalApi.solicitar(session.token, detalhe.id, orcamento.versaoId, tipo, mensagem);
      setSolicitacao(result.solicitacao);
      setMensagem("");
      setEtapa(null);
      await recarregar();
    } catch (cause) {
      await tratarErro(cause);
    } finally {
      setBusy(false);
    }
  };

  const whatsapp = detalhe.contatoEmpresa?.whatsapp ?? null;
  const textoComprovante = comprovante
    ? mensagemWhatsapp({
      contato: comprovante.contato,
      equipamento: comprovante.equipamento,
      serie: comprovante.serie,
      acao: ACAO_WHATSAPP[comprovante.decisao],
      versao: comprovante.versao,
      valor: comprovante.valorTotal,
      protocolo: comprovante.protocolo,
    })
    : null;
  const textoSolicitacao = solicitacao
    ? mensagemWhatsapp({
      contato: session.contato,
      equipamento: detalhe.equipamento,
      serie: detalhe.serie,
      acao: solicitacao.tipo === "NEGOCIAR" ? "pedi para negociar o orçamento" : solicitacao.tipo === "MUDANCA" ? "pedi correção na decisão do orçamento" : "enviei uma dúvida",
      versao: orcamento.versao,
      valor: orcamento.valorTotal,
      protocolo: solicitacao.protocolo,
    })
    : null;

  return (
    <section className="portal-quote" aria-labelledby="portal-quote-title">
      <div className="portal-quote-head">
        <h2 id="portal-quote-title">Orçamento</h2>
        <span className="portal-version">Versão {orcamento.versao} · publicada em {shortDate(orcamento.publicadaEm)}</span>
      </div>

      {aviso && <p className="notice-box" role="status">{aviso}</p>}

      <ul className="quote-list">
        {orcamento.servicos.map((servico, index) => (
          <li key={`s-${index}`}>
            <span className="quote-line"><span>{servico.descricao}</span><strong>{money(servico.valor)}</strong></span>
            {servico.pecas.map((peca, pIndex) => (
              <span className="quote-part" key={`p-${index}-${pIndex}`}>
                {peca.quantidade} × {peca.nome} — {money(peca.valorUnitario)} cada
              </span>
            ))}
          </li>
        ))}
        {orcamento.pecas.map((peca, index) => (
          <li key={`l-${index}`}>
            <span className="quote-line"><span>{peca.quantidade} × {peca.nome}</span><strong>{money(peca.valorTotal)}</strong></span>
          </li>
        ))}
      </ul>
      <p className="quote-total"><span>Total</span><strong>{money(orcamento.valorTotal)}</strong></p>
      {orcamento.validoAte && (
        <p className="answer-hint">Proposta válida até {shortDate(new Date(new Date(orcamento.validoAte).getTime() - 1).toISOString())}.</p>
      )}

      {orcamento.estado === "EM_REVISAO" && (
        <p className="notice-box">A equipe está revisando esta proposta. Quando a nova versão for publicada, ela aparece aqui para você responder.</p>
      )}
      {orcamento.estado === "VENCIDA" && (
        <p className="notice-box">O prazo desta proposta terminou. Fale com a equipe para renovar.</p>
      )}
      {orcamento.estado === "ABERTA" && !respostaAtiva && !detalhe.podeDecidir && (
        <p className="answer-hint">Seu contato pode acompanhar, mas não responder a orçamentos.</p>
      )}
      {orcamento.estado === "ABERTA" && !respostaAtiva && detalhe.podeDecidir && !orcamento.aceiteOnline && (
        <p className="notice-box">As respostas pelo portal estão pausadas no momento. Use o contato da equipe abaixo.</p>
      )}

      {respostaAtiva && !comprovante && (
        <div className={`answer-box answer-${respostaAtiva.estado?.toLowerCase() ?? "registrada"}`}>
          <h2>
            {respostaAtiva.estado === "EFETIVADA"
              ? respostaAtiva.decisao === "APROVAR" ? "Orçamento aprovado" : "Orçamento recusado"
              : respostaAtiva.decisao === "APROVAR" ? "Resposta registrada: aceite" : "Resposta registrada: recusa"}
          </h2>
          <p>
            {respostaAtiva.contato ? `Por ${respostaAtiva.propria ? "você" : respostaAtiva.contato}, ` : ""}
            em {dateTime(respostaAtiva.registradaEm)}. Protocolo {respostaAtiva.protocolo}.
          </p>
          {respostaAtiva.estado === "EM_CORRECAO" && (
            <p>
              {respostaAtiva.propria
                ? `Até ${shortTime(respostaAtiva.janelaAte)} você pode mudar de ideia. Depois disso, a resposta é efetivada.`
                : `O prazo de correção vai até ${shortTime(respostaAtiva.janelaAte)}. Só quem respondeu pode mudar; para discutir, use “Quero negociar” ou fale com a equipe.`}
            </p>
          )}
          {respostaAtiva.estado === "PROCESSANDO" && (
            <p>O prazo de correção terminou e a resposta está sendo efetivada. Atualize em instantes.</p>
          )}
          {respostaAtiva.estado === "PENDENTE_EQUIPE" && (
            <p>Recebemos sua resposta, mas ela precisa ser confirmada pela equipe antes de valer. A BMI TAG vai falar com você.</p>
          )}
          {respostaAtiva.estado === "AGUARDANDO_EQUIPE" && (
            <p>Esta resposta foi registrada por outro canal e será conferida pela equipe.</p>
          )}
          {respostaAtiva.estado === "EFETIVADA" && respostaAtiva.efetivadaEm && (
            <p>Efetivada em {dateTime(respostaAtiva.efetivadaEm)}.</p>
          )}
        </div>
      )}

      {comprovante && (
        <div className="sent-box portal-receipt" role="status">
          <strong>Resposta registrada no AutoOS</strong>
          <p>
            {ROTULO_DECISAO[comprovante.decisao]} — {comprovante.equipamento}{comprovante.serie ? ` (série ${comprovante.serie})` : ""},
            versão {comprovante.versao}, {money(comprovante.valorTotal)}.
          </p>
          <p>Protocolo {comprovante.protocolo} · {dateTime(comprovante.registradaEm)} · {comprovante.contato}</p>
          {comprovante.decisao !== "DESFEITA" && (
            <p>Você pode mudar de ideia até {shortTime(comprovante.janelaAte)}. A equipe já foi avisada; enviar a mensagem abaixo é opcional.</p>
          )}
          {textoComprovante && <MensagemPronta whatsapp={whatsapp} texto={textoComprovante} />}
          <button className="link-button" type="button" onClick={() => setComprovante(null)}>Fechar comprovante</button>
        </div>
      )}

      {etapa?.tipo === "verificar" && (
        <div className="confirm-box">
          <h2>Confirme que é você</h2>
          {porSenha ? (
            <form className="portal-form" onSubmit={(event) => void confirmarSenha(event)} noValidate>
              <p className="portal-help">Por segurança, digite sua senha de novo para responder ao orçamento.</p>
              <label htmlFor="portal-reconfirmar-senha">Senha</label>
              <input id="portal-reconfirmar-senha" className="portal-input" type="password" autoComplete="current-password"
                maxLength={72} value={senha} onChange={(event) => setSenha(event.target.value)} autoFocus />
              {erro && <p className="portal-error" role="alert">{erro}</p>}
              <div className="action-row">
                <button className="primary-button" type="submit" disabled={busy || !senha}>{busy ? "Conferindo…" : "Confirmar senha"}</button>
                <button className="secondary-button" type="button" disabled={busy} onClick={() => setEtapa(null)}>Cancelar</button>
              </div>
              <button className="link-button" type="button" onClick={() => { setUsarCodigo(true); setErro(null); }}>Prefiro receber um código</button>
            </form>
          ) : !etapa.desafio ? (
            <>
              <p>Para responder ao orçamento, enviaremos um novo código para o seu contato cadastrado.</p>
              <div className="action-row">
                <button className="primary-button" type="button" disabled={busy} onClick={() => void pedirCodigo("WHATSAPP")}>Enviar por WhatsApp</button>
                <button className="secondary-button" type="button" disabled={busy} onClick={() => void pedirCodigo("EMAIL")}>Enviar por email</button>
                <button className="link-button" type="button" onClick={() => setEtapa(null)}>Cancelar</button>
              </div>
              {erro && <p className="portal-error" role="alert">{erro}</p>}
            </>
          ) : (
            <CodigoForm
              destinoDescricao={`Enviamos o código para o ${etapa.canal === "EMAIL" ? "email" : "WhatsApp"} cadastrado.`}
              busy={busy}
              erro={erro}
              confirmarRotulo="Confirmar código"
              onConfirmar={(codigo) => void confirmarCodigo(codigo)}
              onReenviar={() => void pedirCodigo(etapa.canal ?? "WHATSAPP")}
              onVoltar={() => setEtapa(null)}
            />
          )}
        </div>
      )}

      {etapa?.tipo === "confirmar" && (
        <div className="confirm-box" role="alertdialog" aria-labelledby="portal-confirm-title">
          <h2 id="portal-confirm-title">
            {etapa.decisao === "APROVAR" ? "Confirmar ACEITE do orçamento inteiro?" : etapa.decisao === "RECUSAR" ? "Confirmar RECUSA do orçamento inteiro?" : "Cancelar sua resposta?"}
          </h2>
          <p><strong>{detalhe.equipamento}</strong>{detalhe.serie ? ` · série ${detalhe.serie}` : ""}</p>
          <p>Versão {orcamento.versao} · <strong>{money(orcamento.valorTotal)}</strong></p>
          {etapa.decisao === "APROVAR" && (
            <p className="answer-hint">Você aceita todos os itens acima. Para discutir preço ou itens, use “Quero negociar”.</p>
          )}
          {etapa.decisao !== "DESFEITA" && (
            <p className="answer-hint">Você terá {orcamento.janelaMinutos} minutos para mudar de ideia. Depois disso a resposta é efetivada.</p>
          )}
          {etapa.decisao === "DESFEITA" && <p className="answer-hint">O orçamento volta a aguardar resposta.</p>}
          {erro && <p className="portal-error" role="alert">{erro}</p>}
          <div className="action-row">
            <button className="primary-button" type="button" disabled={busy} onClick={() => void responder()}>
              {busy ? "Registrando…" : etapa.decisao === "APROVAR" ? "Confirmar aceite" : etapa.decisao === "RECUSAR" ? "Confirmar recusa" : "Cancelar resposta"}
            </button>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => setEtapa(null)}>Voltar</button>
          </div>
        </div>
      )}

      {(etapa?.tipo === "negociar" || etapa?.tipo === "corrigir") && (
        <div className="contact-box">
          <label htmlFor="portal-mensagem">
            {etapa.tipo === "negociar" ? "O que você gostaria de negociar? (opcional)" : "O que precisa ser corrigido?"}
          </label>
          <textarea id="portal-mensagem" rows={3} maxLength={500} value={mensagem} onChange={(event) => setMensagem(event.target.value)} />
          <p className="answer-hint">
            {etapa.tipo === "negociar"
              ? "O pedido avisa a equipe. Não é aceite, recusa nem prorrogação do prazo. Se a proposta mudar, uma nova versão aparecerá aqui."
              : "A equipe vai analisar. Mudar só o status não desfaz peças já baixadas nem trabalho iniciado."}
          </p>
          {erro && <p className="portal-error" role="alert">{erro}</p>}
          <div className="action-row">
            <button className="primary-button" type="button" disabled={busy || (etapa.tipo === "corrigir" && mensagem.trim().length === 0)}
              onClick={() => void solicitar(etapa.tipo === "negociar" ? "NEGOCIAR" : "MUDANCA")}>
              {busy ? "Registrando…" : etapa.tipo === "negociar" ? "Registrar pedido de negociação" : "Solicitar correção"}
            </button>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => setEtapa(null)}>Voltar</button>
          </div>
        </div>
      )}

      {solicitacao && (
        <div className="sent-box" role="status">
          <strong>Pedido {solicitacao.protocolo} registrado no AutoOS</strong>
          <p>A equipe foi avisada. Se quiser, envie também a mensagem abaixo.</p>
          {textoSolicitacao && <MensagemPronta whatsapp={whatsapp} texto={textoSolicitacao} />}
          <button className="link-button" type="button" onClick={() => setSolicitacao(null)}>Fechar</button>
        </div>
      )}

      {etapa === null && (
        <div className="action-stack">
          {podeResponder && (
            <>
              <button className="primary-button" type="button" onClick={() => iniciar("APROVAR")}>Aceitar orçamento</button>
              <button className="secondary-button" type="button" onClick={() => iniciar("RECUSAR")}>Recusar orçamento</button>
            </>
          )}
          {podeMudar && respostaAtiva && (
            <>
              <button className="secondary-button" type="button" onClick={() => iniciar(respostaAtiva.decisao === "APROVAR" ? "RECUSAR" : "APROVAR")}>
                Mudei de ideia: {respostaAtiva.decisao === "APROVAR" ? "recusar" : "aceitar"}
              </button>
              <button className="secondary-button" type="button" onClick={() => iniciar("DESFEITA")}>Mudei de ideia: cancelar resposta</button>
            </>
          )}
          {detalhe.podeDecidir && orcamento.estado === "ABERTA" && !respostaAtiva && (
            <button className="link-button" type="button" onClick={() => { setErro(null); setEtapa({ tipo: "negociar" }); }}>Quero negociar</button>
          )}
          {detalhe.podeDecidir && respostaAtiva?.estado === "EFETIVADA" && (
            <button className="secondary-button" type="button" onClick={() => { setErro(null); setEtapa({ tipo: "corrigir" }); }}>Solicitar correção</button>
          )}
        </div>
      )}
    </section>
  );
}

function MensagemPronta({ whatsapp, texto }: { whatsapp: string | null; texto: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <div className="portal-message">
      <pre>{texto}</pre>
      <div className="action-row">
        {whatsapp && (
          <a className="primary-button portal-link-button" href={whatsappUrl(whatsapp, texto)} target="_blank" rel="noopener noreferrer">
            Abrir no WhatsApp
          </a>
        )}
        <button className="secondary-button" type="button" onClick={() => void copiar()}>{copiado ? "Copiada" : "Copiar mensagem"}</button>
      </div>
    </div>
  );
}
