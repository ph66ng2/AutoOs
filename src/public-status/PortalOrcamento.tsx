import { useEffect, useRef, useState, type FormEvent } from "react";
import "./portal-orcamento.css";
import {
  dateTime,
  definirContatoEmpresa,
  emailValido,
  mailtoUrl,
  mensagemWhatsapp,
  money,
  PortalError,
  portalApi,
  shortDate,
  shortTime,
  telefoneValido,
  whatsappUrl,
  type Comprovante,
  type ContatoRetorno,
  type Decisao,
  type DetalheAtendimento,
  type OrcamentoPortal,
  type SolicitacaoRegistrada,
} from "./portal-api";
import type { PortalSession } from "./portal-session";

type Etapa =
  | { tipo: "retencao" }
  | { tipo: "verificar"; depois: Decisao }
  | { tipo: "confirmar"; decisao: Decisao; versaoId: number }
  | { tipo: "negociar" }
  | { tipo: "corrigir" }
  | null;

const ROTULO_DECISAO: Record<Decisao, string> = {
  APROVAR: "Aceite do orçamento",
  RECUSAR: "Recusa do orçamento",
  DESFEITA: "Resposta cancelada",
};

/** Pedido recém-enviado, com o que o cliente informou, para montar a mensagem pronta. */
type Enviado = {
  solicitacao: SolicitacaoRegistrada;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
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
  const [enviado, setEnviado] = useState<Enviado | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [ordemCompra, setOrdemCompra] = useState("");
  const [erroOrdem, setErroOrdem] = useState<string | null>(null);
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [salvarContato, setSalvarContato] = useState(true);
  const [erroContato, setErroContato] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [agora, setAgora] = useState(() => Date.now());
  const versaoAnterior = useRef(orcamento.versaoId);
  const caixaEtapa = useRef<HTMLDivElement>(null);
  const exigeOrdem = detalhe.cliente?.exigeOrdemCompra === true;
  const faltaTelefone = !detalhe.temTelefone;
  const faltaEmail = !detalhe.temEmail;

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
      setEnviado(null);
      setAviso(`A proposta foi atualizada para a versão ${orcamento.versao}. Releia antes de responder.`);
    }
  }, [orcamento.versaoId, orcamento.versao]);

  // O portal só descobre o contato da empresa no detalhe; o aviso de testes (PortalApp) o reaproveita.
  useEffect(() => {
    definirContatoEmpresa(detalhe.contatoEmpresa);
  }, [detalhe.contatoEmpresa]);

  // A resposta vigente mudou (desfeita aqui, ou por outro contato/canal): o comprovante e o pedido
  // mostrados antes não descrevem mais o que está valendo. O comprovante da resposta que acabou de
  // ser registrada (mesmo id) continua.
  const respostaChave = `${resposta?.id ?? "-"}:${resposta?.decisao ?? "-"}`;
  const comprovanteProtocolo = comprovante?.protocolo ?? null;
  useEffect(() => {
    if (comprovanteProtocolo !== null && comprovanteProtocolo !== (resposta?.protocolo ?? null)) setComprovante(null);
    setEnviado(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respostaChave]);

  // A barra fixa do celular inicia a confirmação longe dela: leva a caixa para a tela.
  useEffect(() => {
    if (etapa && etapa.tipo !== "negociar" && etapa.tipo !== "corrigir") {
      caixaEtapa.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }
  }, [etapa]);

  // Contagem do prazo de correção; ao terminar, a página busca o estado novo. O relógio segue
  // enquanto o servidor ainda disser EM_CORRECAO (relógio do cliente adiantado): recarrega a cada volta.
  const aguardandoServidor = respostaAtiva?.estado === "EM_CORRECAO";
  useEffect(() => {
    if (!aguardandoServidor) return;
    const timer = window.setInterval(() => setAgora(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [aguardandoServidor]);
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
        setEtapa({ tipo: "verificar", depois: etapa.decisao });
        setErro(null);
        return;
      }
      if (cause.codigo === "ORDEM_COMPRA_OBRIGATORIA") {
        setErroOrdem(cause.message);
        return;
      }
      if (cause.codigo === "CONTATO_INVALIDO") {
        setErroContato(cause.message);
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

  // Nova ação: o resultado da anterior (comprovante, pedido enviado) deixa de valer na tela.
  const limparResultados = () => {
    setErro(null);
    setAviso(null);
    setComprovante(null);
    setEnviado(null);
  };

  const prosseguir = (decisao: Decisao) => {
    limparResultados();
    setOrdemCompra("");
    setErroOrdem(null);
    if (!detalhe.verificacaoRecente && decisao !== "DESFEITA") {
      setEtapa({ tipo: "verificar", depois: decisao });
      return;
    }
    setEtapa({ tipo: "confirmar", decisao, versaoId: orcamento.versaoId });
  };

  // Recusar passa antes por uma conversa: a equipe pode negociar valor e itens.
  const iniciar = (decisao: Decisao) => {
    if (decisao === "RECUSAR") {
      limparResultados();
      setEtapa({ tipo: "retencao" });
      return;
    }
    prosseguir(decisao);
  };

  const abrirSolicitacao = (tipo: "negociar" | "corrigir") => {
    limparResultados();
    setErroContato(null);
    setTelefone("");
    setEmail("");
    setSalvarContato(true);
    setEtapa({ tipo });
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
    const ordem = etapa.decisao === "APROVAR" && exigeOrdem ? ordemCompra.trim() : "";
    if (etapa.decisao === "APROVAR" && exigeOrdem && !ordem) {
      setErroOrdem("Informe o número da ordem de compra para aceitar o orçamento.");
      return;
    }
    setBusy(true);
    setErro(null);
    setErroOrdem(null);
    try {
      const base = [session.token, detalhe.id, etapa.versaoId, etapa.decisao, resposta?.id ?? null] as const;
      const result = ordem ? await portalApi.responder(...base, ordem) : await portalApi.responder(...base);
      if (etapa.decisao === "DESFEITA") {
        // Desfeita não gera mensagem pronta: o orçamento só volta a aguardar resposta.
        setComprovante(null);
        setAviso("Resposta cancelada. O orçamento voltou a aguardar a sua decisão.");
      } else {
        setComprovante(result.comprovante);
      }
      setEtapa(null);
      await recarregar();
    } catch (cause) {
      await tratarErro(cause);
    } finally {
      setBusy(false);
    }
  };

  const solicitar = async (tipo: "NEGOCIAR" | "MUDANCA") => {
    const tel = faltaTelefone ? telefone.trim() : "";
    const mail = faltaEmail ? email.trim() : "";
    if (tel && !telefoneValido(tel)) {
      setErroContato("Informe o telefone com DDD, por exemplo (71) 99999-0000.");
      return;
    }
    if (mail && !emailValido(mail)) {
      setErroContato("Informe um e-mail válido, por exemplo nome@empresa.com.br.");
      return;
    }
    const contato: ContatoRetorno | undefined = tel || mail
      ? { ...(tel ? { telefone: tel } : {}), ...(mail ? { email: mail } : {}), salvarNoContato: salvarContato }
      : undefined;
    setBusy(true);
    setErro(null);
    setErroContato(null);
    try {
      const result = contato
        ? await portalApi.solicitar(session.token, detalhe.id, orcamento.versaoId, tipo, mensagem, contato)
        : await portalApi.solicitar(session.token, detalhe.id, orcamento.versaoId, tipo, mensagem);
      setEnviado({ solicitacao: result.solicitacao, telefone: tel || null, email: mail || null, observacao: mensagem.trim() || null });
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
  const emailEmpresa = detalhe.contatoEmpresa?.email ?? null;
  const empresa = detalhe.contatoEmpresa?.nome;
  const textoComprovante = comprovante
    ? mensagemWhatsapp({
      contato: comprovante.contato,
      cliente: detalhe.cliente,
      empresa,
      intencao: comprovante.decisao,
      equipamento: comprovante.equipamento,
      serie: comprovante.serie,
      versao: comprovante.versao,
      valor: comprovante.valorTotal,
      protocolo: comprovante.protocolo,
      ordemCompra: comprovante.ordemCompra,
    })
    : null;
  const textoEnviado = enviado
    ? mensagemWhatsapp({
      contato: session.contato,
      cliente: detalhe.cliente,
      empresa,
      intencao: enviado.solicitacao.tipo,
      equipamento: detalhe.equipamento,
      serie: detalhe.serie,
      versao: orcamento.versao,
      valor: orcamento.valorTotal,
      protocolo: enviado.solicitacao.protocolo,
      telefone: enviado.telefone,
      email: enviado.email,
      observacao: enviado.observacao,
    })
    : null;
  const textoConversa = mensagemWhatsapp({
    contato: session.contato,
    cliente: detalhe.cliente,
    empresa,
    intencao: "CONVERSAR",
    equipamento: detalhe.equipamento,
    serie: detalhe.serie,
    versao: orcamento.versao,
    valor: orcamento.valorTotal,
  });

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
        <div className={`answer-box answer-${respostaAtiva.estado?.toLowerCase() ?? "registrada"}${respostaAtiva.decisao === "RECUSAR" ? " is-recusa" : ""}`}>
          <h2>
            {respostaAtiva.estado === "EFETIVADA"
              ? respostaAtiva.decisao === "APROVAR" ? "Orçamento aprovado" : "Orçamento recusado"
              : respostaAtiva.decisao === "APROVAR" ? "Resposta registrada: aceite" : "Resposta registrada: recusa"}
          </h2>
          <p>
            {respostaAtiva.contato ? `Por ${respostaAtiva.propria ? "você" : respostaAtiva.contato}, ` : ""}
            em {dateTime(respostaAtiva.registradaEm)}. Protocolo {respostaAtiva.protocolo}.
          </p>
          {respostaAtiva.ordemCompra && <p>Ordem de compra: <strong>{respostaAtiva.ordemCompra}</strong></p>}
          {respostaAtiva.estado === "EM_CORRECAO" && (
            <p>
              {respostaAtiva.propria
                ? `A resposta é efetivada às ${shortTime(respostaAtiva.janelaAte)}. Se você errou, ainda dá para desfazer até lá.`
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
        <div className={`sent-box portal-receipt${comprovante.decisao === "RECUSAR" ? " is-recusa" : ""}`} role="status">
          <strong>Resposta registrada no AutoOS</strong>
          <p>
            {ROTULO_DECISAO[comprovante.decisao]} — {comprovante.equipamento}{comprovante.serie ? ` (série ${comprovante.serie})` : ""},
            versão {comprovante.versao}, {money(comprovante.valorTotal)}.
          </p>
          <p>Protocolo {comprovante.protocolo} · {dateTime(comprovante.registradaEm)} · {comprovante.contato}</p>
          {comprovante.ordemCompra && <p>Ordem de compra: <strong>{comprovante.ordemCompra}</strong></p>}
          <p>A equipe já foi avisada; enviar a mensagem abaixo é opcional. Efetivação às {shortTime(comprovante.janelaAte)}.</p>
          {textoComprovante && <MensagemPronta whatsapp={whatsapp} texto={textoComprovante} />}
          <button className="link-button" type="button" onClick={() => setComprovante(null)}>Fechar comprovante</button>
        </div>
      )}

      {etapa?.tipo === "retencao" && (
        <div className="confirm-box portal-retention" ref={caixaEtapa} role="group" aria-labelledby="portal-retention-title">
          <h2 id="portal-retention-title">Tem certeza que quer recusar?</h2>
          <p>
            Antes de decidir: a nossa equipe pode negociar com você o valor e os itens deste orçamento.
            Muitas vezes dá para chegar a uma proposta que faça sentido para os dois lados.
          </p>
          <div className="action-row portal-retention-actions">
            <button className="primary-button" type="button" onClick={() => abrirSolicitacao("negociar")}>Quero negociar</button>
            {whatsapp && (
              <a className="secondary-button portal-link-button" href={whatsappUrl(whatsapp, textoConversa)} target="_blank" rel="noopener noreferrer">
                Falar com a equipe no WhatsApp
              </a>
            )}
          </div>
          <button className="link-button portal-refuse-anyway" type="button" onClick={() => prosseguir("RECUSAR")}>Recusar mesmo assim</button>
        </div>
      )}

      {etapa?.tipo === "verificar" && (
        <div className="confirm-box" ref={caixaEtapa}>
          <h2>Confirme que é você</h2>
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
          </form>
        </div>
      )}

      {etapa?.tipo === "confirmar" && (
        <div className="confirm-box" ref={caixaEtapa} role="alertdialog" aria-labelledby="portal-confirm-title">
          <h2 id="portal-confirm-title">
            {etapa.decisao === "APROVAR" ? "Confirmar ACEITE do orçamento inteiro?" : etapa.decisao === "RECUSAR" ? "Confirmar RECUSA do orçamento inteiro?" : "Cancelar sua resposta?"}
          </h2>
          <p><strong>{detalhe.equipamento}</strong>{detalhe.serie ? ` · série ${detalhe.serie}` : ""}</p>
          <p>Versão {orcamento.versao} · <strong>{money(orcamento.valorTotal)}</strong></p>
          {etapa.decisao === "APROVAR" && (
            <p className="answer-hint">Você aceita todos os itens acima. Para discutir preço ou itens, use “Quero negociar”.</p>
          )}
          {etapa.decisao === "APROVAR" && exigeOrdem && (
            <div className="portal-oc">
              <label htmlFor="portal-ordem-compra">Número da ordem de compra</label>
              <input id="portal-ordem-compra" className="portal-input" type="text" maxLength={60} value={ordemCompra}
                aria-required="true" aria-invalid={erroOrdem ? true : undefined} aria-describedby="portal-ordem-ajuda"
                onChange={(event) => { setOrdemCompra(event.target.value); setErroOrdem(null); }} />
              <p id="portal-ordem-ajuda" className="answer-hint">O cadastro da sua empresa exige a ordem de compra para aceitar orçamentos.</p>
              {erroOrdem && <p className="portal-error" role="alert">{erroOrdem}</p>}
            </div>
          )}
          {etapa.decisao !== "DESFEITA" && (
            <p className="answer-hint">Confira antes de confirmar. Se errar, há {orcamento.janelaMinutos} minutos para desfazer; depois a resposta é efetivada.</p>
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
        <div className="contact-box portal-request-box">
          <label htmlFor="portal-mensagem">
            {etapa.tipo === "negociar" ? "O que você gostaria de negociar? (opcional)" : "O que precisa ser corrigido?"}
          </label>
          <textarea id="portal-mensagem" rows={4} maxLength={500} value={mensagem} onChange={(event) => setMensagem(event.target.value)} />
          <p className="answer-hint">
            {etapa.tipo === "negociar"
              ? "O pedido avisa a equipe. Não é aceite, recusa nem prorrogação do prazo. Se a proposta mudar, uma nova versão aparecerá aqui."
              : "A equipe vai analisar. Mudar só o status não desfaz peças já baixadas nem trabalho iniciado."}
          </p>
          {(faltaTelefone || faltaEmail) && (
            <fieldset className="portal-reach">
              <legend>Como a equipe pode falar com você?</legend>
              {faltaTelefone && (
                <>
                  <label htmlFor="portal-contato-telefone">Telefone com DDD</label>
                  <input id="portal-contato-telefone" className="portal-input" type="tel" inputMode="tel" autoComplete="tel" maxLength={20}
                    placeholder="(71) 99999-0000" value={telefone} onChange={(event) => { setTelefone(event.target.value); setErroContato(null); }} />
                </>
              )}
              {faltaEmail && (
                <>
                  <label htmlFor="portal-contato-email">E-mail</label>
                  <input id="portal-contato-email" className="portal-input" type="email" inputMode="email" autoComplete="email" maxLength={254}
                    placeholder="nome@empresa.com.br" value={email} onChange={(event) => { setEmail(event.target.value); setErroContato(null); }} />
                </>
              )}
              <label className="portal-check" htmlFor="portal-contato-salvar">
                <input id="portal-contato-salvar" type="checkbox" checked={salvarContato} onChange={(event) => setSalvarContato(event.target.checked)} />
                <span>Estes são meus dados de contato — salvar no meu cadastro</span>
              </label>
              {erroContato && <p className="portal-error" role="alert">{erroContato}</p>}
            </fieldset>
          )}
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

      {enviado && (
        <div className="sent-box portal-request-done" role="status">
          <strong>Pedido {enviado.solicitacao.protocolo} registrado no AutoOS</strong>
          <p>A equipe foi avisada. Para agilizar, fale com ela agora: a conversa costuma resolver mais rápido.</p>
          {textoEnviado && (
            <MensagemPronta whatsapp={whatsapp} email={emailEmpresa} destaque texto={textoEnviado}
              assunto={`Portal das Impressoras: pedido ${enviado.solicitacao.protocolo}`} />
          )}
          <button className="link-button" type="button" onClick={() => setEnviado(null)}>Fechar</button>
        </div>
      )}

      {etapa === null && (
        <div className="action-stack">
          {podeResponder && (
            <div className="portal-inline-decision">
              <button className="primary-button" type="button" onClick={() => iniciar("APROVAR")}>Aceitar orçamento</button>
              <button className="secondary-button" type="button" onClick={() => iniciar("RECUSAR")}>Recusar orçamento</button>
            </div>
          )}
          {/* Correção de clique errado, discreta: desfaz e o orçamento volta a aguardar resposta. */}
          {podeMudar && respostaAtiva && (
            <button className="link-button portal-undo" type="button" onClick={() => iniciar("DESFEITA")}>
              Errou? Desfazer resposta (até {shortTime(respostaAtiva.janelaAte)})
            </button>
          )}
          {detalhe.podeDecidir && orcamento.aceiteOnline && orcamento.estado === "ABERTA" && !respostaAtiva && (
            <button className="link-button" type="button" onClick={() => abrirSolicitacao("negociar")}>Quero negociar</button>
          )}
          {detalhe.podeDecidir && respostaAtiva?.estado === "EFETIVADA" && (
            <button className="secondary-button" type="button" onClick={() => abrirSolicitacao("corrigir")}>Solicitar correção</button>
          )}
        </div>
      )}

      {/* Celular: decisão sempre ao alcance do polegar, sem rolar até o fim. */}
      {etapa === null && podeResponder && (
        <div className="portal-decision-bar" role="region" aria-label="Responder ao orçamento">
          <div className="portal-decision-total">
            <span>Total</span>
            <strong>{money(orcamento.valorTotal)}</strong>
          </div>
          <button className="secondary-button" type="button" onClick={() => iniciar("RECUSAR")}>Recusar</button>
          <button className="primary-button" type="button" onClick={() => iniciar("APROVAR")}>Aceitar</button>
        </div>
      )}
    </section>
  );
}

function MensagemPronta({ whatsapp, email, texto, assunto, destaque }: {
  whatsapp: string | null;
  email?: string | null;
  texto: string;
  assunto?: string;
  destaque?: boolean;
}) {
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
    <div className={`portal-message${destaque ? " is-highlight" : ""}`}>
      <pre>{texto}</pre>
      <div className="action-row">
        {whatsapp && (
          <a className={`primary-button portal-link-button${destaque ? " portal-cta" : ""}`} href={whatsappUrl(whatsapp, texto)} target="_blank" rel="noopener noreferrer">
            {destaque ? "Falar agora no WhatsApp" : "Abrir no WhatsApp"}
          </a>
        )}
        {destaque && email && (
          <a className="secondary-button portal-link-button" href={mailtoUrl(email, assunto ?? "Portal das Impressoras", texto)}>Enviar por e-mail</a>
        )}
        <button className="secondary-button" type="button" onClick={() => void copiar()}>{copiado ? "Copiada" : "Copiar mensagem"}</button>
      </div>
    </div>
  );
}
