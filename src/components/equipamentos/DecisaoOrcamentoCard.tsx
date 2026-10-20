import { useState } from "react";
import { Loader2, KeyRound, Mail, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { db } from "@/lib/db";
import {
  contatoParaRetorno,
  mensagemInicialContato,
  montarLinkEmail,
  montarLinkWhatsapp,
  protocoloSolicitacao,
  telefoneParaExibir,
} from "@/lib/contato-cliente";
import { mensagemErro, usePortalCliente } from "@/components/equipamentos/portal-cliente-context";
import {
  DECISAO_TEXTO,
  MOTIVO_FALHA,
  TIPO_SOLICITACAO_TEXTO,
  formatarHora,
  formatarQuando,
  formatarValor,
  textoOrdemCompra,
} from "@/components/equipamentos/portal-cliente-format";
import type { DecisaoOrcamentoInfo, RespostaOrcamentoInfo, SolicitacaoOrcamentoInfo } from "@/types";

type Props = {
  /** Abre o fluxo atual de pagamento e aprovação já com a decisão do cliente. */
  onAplicar: (decisao: "aprovar" | "reprovar") => void;
};

type Tom = "neutro" | "verde" | "vermelho" | "ambar" | "violeta";

const TOM_CLASSE: Record<Tom, string> = {
  neutro: "border-border bg-muted/20 text-foreground",
  verde: "border-emerald-300 bg-emerald-50 text-emerald-950",
  vermelho: "border-red-300 bg-red-50 text-red-950",
  ambar: "border-amber-300 bg-amber-50 text-amber-950",
  violeta: "border-violet-300 bg-violet-50 text-violet-950",
};

type Faixa = {
  tom: Tom;
  texto: string;
  /** Segunda linha, menor. */
  detalhe?: string;
  oc?: string | null;
  /** Botão de aplicar a decisão do cliente. */
  aplicar?: { decisao: "aprovar" | "reprovar"; habilitado: boolean };
  publicar?: boolean;
};

function tomDaDecisao(decisao: RespostaOrcamentoInfo["decisao"]): Tom {
  return decisao === "APROVAR" ? "verde" : decisao === "RECUSAR" ? "vermelho" : "neutro";
}

/** Resume em uma faixa o estado do orçamento no portal; `null` quando não há nada a mostrar. */
export function resumirFaixa(
  info: DecisaoOrcamentoInfo | null,
  status: string | undefined,
  respostaFinal: RespostaOrcamentoInfo | null,
  agora = new Date(),
): Faixa | null {
  const aguardando = status === "AGUARDANDO_APROVACAO";
  if (!info) {
    return aguardando ? { tom: "neutro", texto: "Orçamento ainda não publicado no Portal do Cliente", publicar: true } : null;
  }

  if (respostaFinal) {
    const decisao = respostaFinal.decisao === "APROVAR" ? "aprovar" : "reprovar";
    const verbo = DECISAO_TEXTO[respostaFinal.decisao];
    const oc = textoOrdemCompra(respostaFinal);
    if (respostaFinal.origem === "PORTAL_CLIENTE") {
      const emPrazo = Boolean(info.aplicavelAPartirDe && new Date(info.aplicavelAPartirDe).getTime() > agora.getTime());
      const quem = `${respostaFinal.contato ?? "Contato autorizado"} em ${formatarHora(respostaFinal.registradaEm)}`;
      if (respostaFinal.efetivacaoFalhouEm) {
        const motivo = MOTIVO_FALHA[respostaFinal.efetivacaoErro ?? ""] ?? respostaFinal.efetivacaoErro ?? "não informado";
        return {
          tom: "ambar",
          texto: `Cliente ${verbo}, mas a efetivação não foi concluída`,
          detalhe: `${quem}. Motivo: ${motivo}. Confira com o cliente e aplique manualmente.`,
          oc,
          aplicar: { decisao, habilitado: info.podeAplicar },
        };
      }
      if (emPrazo) {
        return {
          tom: tomDaDecisao(respostaFinal.decisao),
          texto: `Cliente ${verbo}: aplica às ${formatarQuando(info.aplicavelAPartirDe, agora)}`,
          detalhe: `${quem}. Ele pode mudar de ideia até lá; não inicie o serviço nem separe peças antes disso.`,
          oc,
        };
      }
      return {
        tom: tomDaDecisao(respostaFinal.decisao),
        texto: `Cliente ${verbo}: aplicando automaticamente`,
        detalhe: `${quem}. O sistema aplica status, pagamento (a combinar, se vazio) e estoque em instantes.`,
        oc,
      };
    }
    const aindaCorrige = respostaFinal.origem === "PORTAL" && !info.podeAplicar && info.aplicavelAPartirDe;
    return {
      tom: "ambar",
      texto: `Cliente ${verbo}: aguardando conferência`,
      detalhe: `${respostaFinal.origem === "PORTAL" ? "Pelo link" : `Informado à equipe por ${respostaFinal.registradaPor ?? "—"}`} em ${formatarHora(respostaFinal.registradaEm)}.${
        aindaCorrige ? ` O cliente ainda pode corrigir; a equipe aplica a partir de ${formatarHora(info.aplicavelAPartirDe)}.` : ""
      }`,
      oc,
      aplicar: { decisao, habilitado: info.podeAplicar },
    };
  }

  const resposta = info.resposta;
  if (aguardando) {
    if (info.encerradaMotivo) {
      return {
        tom: "neutro",
        texto: `Versão ${info.versao} encerrada: o orçamento ou a etapa mudou`,
        detalhe: "Publique de novo para o cliente responder.",
        publicar: true,
      };
    }
    if (resposta?.decisao === "DESFEITA") {
      return { tom: "neutro", texto: `Cliente retirou a resposta em ${formatarHora(resposta.registradaEm)}`, detalhe: "Aguardando nova resposta." };
    }
    return {
      tom: "neutro",
      texto: "Aguardando resposta do cliente",
      detalhe: `Versão ${info.versao} · ${formatarValor(info.valorTotal)}${info.validoAte ? ` · válida até ${formatarHora(info.validoAte)}` : ""}${
        info.aceiteOnlineAtivo ? "" : " · respostas pelo portal desligadas"
      }`,
    };
  }

  // Fora da etapa de aprovação: só o registro do que o cliente respondeu e foi aplicado.
  if (resposta && resposta.decisao !== "DESFEITA" && resposta.aplicadaEm) {
    return {
      tom: tomDaDecisao(resposta.decisao),
      texto: `Cliente ${DECISAO_TEXTO[resposta.decisao]} pelo portal em ${formatarHora(resposta.registradaEm)}`,
      detalhe: `Aplicada em ${formatarHora(resposta.aplicadaEm)}${resposta.aplicadaPeloSistema ? " (efetivação automática)" : ""}.`,
      oc: textoOrdemCompra(resposta),
    };
  }
  return null;
}

export function DecisaoOrcamentoCard({ onAplicar }: Props) {
  const portal = usePortalCliente();
  const { equipamento, info, error, loading, busy, consultado, respostaFinal, solicitacoesAbertas } = portal;
  if (!equipamento.id || !consultado) return null;

  const faixa = resumirFaixa(info, equipamento.status, respostaFinal);
  if (!faixa && solicitacoesAbertas.length === 0 && !error) return null;

  const tomDestaque: Tom = faixa?.tom ?? "neutro";
  const [primeira, ...outras] = solicitacoesAbertas;

  return (
    <section className="space-y-2 text-sm" aria-label="Resposta do cliente ao orçamento" data-tom={tomDestaque}>
      {(faixa || error) && (
        <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2", TOM_CLASSE[faixa?.tom ?? "neutro"])}>
          <div className="min-w-0 flex-1">
            {faixa && (
              <p className="font-medium [overflow-wrap:anywhere]">
                {faixa.texto}
                {faixa.oc && (
                  <span className="ml-2 rounded bg-background/70 px-1.5 py-0.5 text-xs font-semibold">{faixa.oc}</span>
                )}
              </p>
            )}
            {faixa?.detalhe && <p className="text-xs opacity-80 [overflow-wrap:anywhere]">{faixa.detalhe}</p>}
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {faixa?.aplicar && (
              <Button size="sm" disabled={!faixa.aplicar.habilitado || busy} onClick={() => onAplicar(faixa.aplicar!.decisao)}>
                Revisar e aplicar decisão
              </Button>
            )}
            {faixa?.publicar && (
              <Button size="sm" variant="outline" onClick={portal.publicar} disabled={busy}>
                Publicar no Portal do Cliente
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => void portal.carregar()} disabled={loading || busy}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="sr-only">Atualizar resposta</span>
            </Button>
          </div>
        </div>
      )}

      {primeira && <PedidoDoCliente solicitacao={primeira} outras={outras.length} />}
    </section>
  );
}

const LIMITE_RESUMO = 140;

/** Pedido de negociação, ajuste ou dúvida do cliente, em destaque, com atalhos para falar com ele. */
function PedidoDoCliente({ solicitacao, outras }: { solicitacao: SolicitacaoOrcamentoInfo; outras: number }) {
  const { equipamento, busy, tratarSolicitacao, abrirPainel, abrirAcesso } = usePortalCliente();
  const [expandida, setExpandida] = useState(false);
  const tom: Tom = solicitacao.tipo === "NEGOCIAR" ? "violeta" : "ambar";
  const longa = solicitacao.mensagem.length > LIMITE_RESUMO || solicitacao.mensagem.includes("\n");
  const retorno = contatoParaRetorno(solicitacao, equipamento);
  const protocolo = protocoloSolicitacao(solicitacao);
  const texto = mensagemInicialContato(equipamento, solicitacao);
  const temAlgumContato = Boolean(retorno.telefone || retorno.email);

  async function abrir(url: string | null) {
    if (!url) return;
    try {
      await db.abrirUrl(url);
    } catch (cause) {
      toast.error(mensagemErro(cause, "Não foi possível abrir o aplicativo."));
    }
  }

  const assunto = `${equipamento.marca ?? ""} ${equipamento.modelo ?? ""} (protocolo ${protocolo})`.trim();

  return (
    <div className={cn("space-y-2 rounded-md border-2 px-3 py-2", TOM_CLASSE[tom])} role="group" aria-label="Pedido do cliente">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {TIPO_SOLICITACAO_TEXTO[solicitacao.tipo]}
          <span className="ml-2 text-xs font-normal opacity-80">
            {protocolo}{solicitacao.contato ? ` · ${solicitacao.contato}` : ""} · {formatarHora(solicitacao.criadaEm)}
          </span>
        </p>
        <div className="flex items-center gap-1">
          {outras > 0 && (
            <Button size="sm" variant="ghost" onClick={abrirPainel}>
              +{outras} {outras > 1 ? "pedidos" : "pedido"}
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => tratarSolicitacao(solicitacao.id)}>
            Marcar como tratada
          </Button>
        </div>
      </div>

      <div>
        <p
          className={cn(
            "whitespace-pre-wrap [overflow-wrap:anywhere]",
            !expandida && "line-clamp-2",
            expandida && "max-h-24 overflow-y-auto",
          )}
        >
          {solicitacao.mensagem}
        </p>
        {longa && (
          <button type="button" className="text-xs font-medium underline" onClick={() => setExpandida((v) => !v)}>
            {expandida ? "ver menos" : "ver mais"}
          </button>
        )}
      </div>

      {(solicitacao.contatoTelefone || solicitacao.contatoEmail) && (
        <p className="text-xs">
          Contato informado pelo cliente:{" "}
          <strong>{[solicitacao.contatoTelefone && telefoneParaExibir(solicitacao.contatoTelefone), solicitacao.contatoEmail].filter(Boolean).join(" · ")}</strong>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {retorno.podeWhatsapp && (
          <Button size="sm" variant="outline" className="bg-background" onClick={() => void abrir(montarLinkWhatsapp(retorno.telefone, texto))}>
            <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
          </Button>
        )}
        {retorno.podeEmail && (
          <Button size="sm" variant="outline" className="bg-background" onClick={() => void abrir(montarLinkEmail(retorno.email, `Orçamento ${assunto}`, texto))}>
            <Mail className="mr-1 h-4 w-4" /> E-mail
          </Button>
        )}
        {!retorno.podeWhatsapp && !retorno.podeEmail && (
          <>
            <span className="text-xs">
              {temAlgumContato
                ? "O telefone ou e-mail disponível não é válido."
                : "O cliente não deixou telefone nem e-mail."}
            </span>
            {equipamento.cliente_id ? (
              <Button size="sm" variant="outline" className="bg-background" onClick={abrirAcesso}>
                <KeyRound className="mr-1 h-4 w-4" /> Gerenciar contatos
              </Button>
            ) : null}
          </>
        )}
        {(retorno.podeWhatsapp || retorno.podeEmail) && !solicitacao.contatoTelefone && !solicitacao.contatoEmail && (
          <span className="text-xs opacity-80">Contato do cadastro do cliente.</span>
        )}
      </div>
    </div>
  );
}
