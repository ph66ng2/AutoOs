import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { enviarLinkOrcamento, envioOrcamentoDisponivel } from "@/lib/orcamento-link-envio";
import type { OpcoesEnvioWhatsapp } from "@/lib/whatsapp-service";
import { montarMensagemLinkOrcamento } from "@/lib/orcamento-link-message";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import {
  SENSITIVE_PERMISSIONS,
  type DecisaoOrcamentoInfo,
  type Equipamento,
  type RespostaOrcamentoInfo,
} from "@/types";

type Props = {
  equipamento: Equipamento;
  /** Id da resposta exibida; vai junto da aprovação para detectar tela desatualizada. */
  onRespostaVista: (respostaId: number) => void;
  /** Abre o fluxo atual de pagamento e aprovação já com a decisão do cliente. */
  onAplicar: (decisao: "aprovar" | "reprovar") => void;
};

const DECISAO_TEXTO: Record<RespostaOrcamentoInfo["decisao"], string> = {
  APROVAR: "aprovou",
  RECUSAR: "recusou",
  DESFEITA: "retirou a resposta",
};

function formatarHora(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

function formatarValor(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function mensagemErro(cause: unknown, fallback: string) {
  return typeof cause === "string" && cause.trim() ? cause : fallback;
}

export function DecisaoOrcamentoCard({ equipamento, onRespostaVista, onAplicar }: Props) {
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const [info, setInfo] = useState<DecisaoOrcamentoInfo | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [confirmacaoEnvio, setConfirmacaoEnvio] = useState<{ texto: string; opcoes: OpcoesEnvioWhatsapp } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const equipamentoId = equipamento.id;

  const carregar = useCallback(async () => {
    if (!equipamentoId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await db.obterDecisaoOrcamento(equipamentoId);
      setInfo(next);
      onRespostaVista(next?.encerradaMotivo ? 0 : next?.resposta?.id ?? 0);
    } catch (cause) {
      setError(mensagemErro(cause, "Não foi possível consultar a resposta do cliente."));
    } finally {
      setLoading(false);
    }
  }, [equipamentoId, onRespostaVista]);

  useEffect(() => {
    setLink(null);
    void carregar();
  }, [carregar, equipamento.atualizado_em]);

  if (!equipamentoId) return null;
  const aberta = info != null && !info.encerradaMotivo;
  async function executar(
    permission: (typeof SENSITIVE_PERMISSIONS)[keyof typeof SENSITIVE_PERMISSIONS],
    title: string,
    description: string,
    acao: () => Promise<void>,
  ) {
    const liberado = await ensureSensitiveAccess({ title, description, permission });
    if (!liberado) return;
    setBusy(true);
    setError(null);
    try {
      await acao();
      await carregar();
    } catch (cause) {
      setError(mensagemErro(cause, "A operação não foi concluída."));
    } finally {
      setBusy(false);
    }
  }

  function gerarLink() {
    void executar(
      SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS,
      "Link de decisão do orçamento",
      "Confirme o acesso para congelar o orçamento atual e gerar um link de decisão. O link anterior deixa de funcionar.",
      async () => {
        const created = await db.criarLinkDecisaoOrcamento(equipamentoId!);
        setLink({ url: created.url, expiresAt: created.expiresAt });
      },
    );
  }

  function revogarLink() {
    void executar(
      SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS,
      "Encerrar link de decisão",
      "Confirme o acesso para encerrar o link de decisão deste orçamento.",
      async () => {
        await db.revogarLinkDecisaoOrcamento(equipamentoId!);
        setLink(null);
      },
    );
  }

  function registrarInformada(decisao: "APROVAR" | "RECUSAR") {
    const texto = decisao === "APROVAR" ? "aprovou" : "recusou";
    void executar(
      SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
      "Decisão informada à equipe",
      `Confirme com o PIN para registrar que o cliente ${texto} o orçamento por telefone ou WhatsApp. O link público será encerrado.`,
      async () => {
        await db.registrarDecisaoInformada(equipamentoId!, decisao);
        setLink(null);
      },
    );
  }

  async function copiar(texto: string, rotulo: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${rotulo} copiado.`);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  /**
   * Envio pela fila do backend: ele congela o orçamento, gera o link e evita duplicidade.
   * Se este orçamento já foi solicitado, a tela pede confirmação antes de enviar de novo.
   */
  async function enviarPorWhatsApp(opcoes: OpcoesEnvioWhatsapp = {}) {
    const liberado = await ensureSensitiveAccess({
      title: "Enviar link do orçamento",
      description: "Confirme o acesso para enviar o link de decisão ao cliente por WhatsApp.",
      permission: SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS,
    });
    if (!liberado) return;
    setBusy(true);
    setError(null);
    setConfirmacaoEnvio(null);
    try {
      const resultado = await enviarLinkOrcamento("whatsapp", { equipamentoId: equipamentoId! }, opcoes);
      if (resultado.jaSolicitado) {
        setConfirmacaoEnvio({
          texto: "Este orçamento já foi enviado por WhatsApp. Enviar o link de novo?",
          opcoes: { reenvioManual: true },
        });
      } else if (resultado.requerConfirmacao) {
        setConfirmacaoEnvio({
          texto: resultado.mensagem || "O envio anterior tem resultado incerto: a mensagem pode já ter chegado. Enviar de novo?",
          opcoes: { reenvioManual: true, confirmarIncerto: true },
        });
      } else if (resultado.sucesso) {
        toast.success(
          resultado.enfileirada
            ? "Link na fila de envio. O resultado aparece no histórico de comunicações."
            : "Link aceito pelo provedor de WhatsApp. A entrega não é confirmada neste momento.",
        );
        await carregar();
      } else {
        setError(resultado.erro || "O envio por WhatsApp não foi concluído.");
      }
    } catch (cause) {
      setError(mensagemErro(cause instanceof Error ? cause.message : cause, "O envio por WhatsApp não foi concluído."));
    } finally {
      setBusy(false);
    }
  }

  function tratarSolicitacao(id: number) {
    void executar(
      SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS,
      "Mensagem do cliente",
      "Confirme o acesso para marcar a mensagem do cliente como tratada.",
      async () => {
        await db.marcarSolicitacaoOrcamentoTratada(id);
      },
    );
  }

  const mensagem = link && info
    ? montarMensagemLinkOrcamento({
        clienteNome: equipamento.cliente_nome,
        equipamento: [equipamento.tipo, equipamento.marca, equipamento.modelo].filter(Boolean).join(" "),
        valorTotal: info.valorTotal,
        url: link.url,
        validoAte: link.expiresAt,
      })
    : null;

  const resposta = aberta ? info?.resposta : null;
  const respostaFinal = resposta && resposta.decisao !== "DESFEITA" && !resposta.aplicadaEm ? resposta : null;
  const aceiteAtivo = info?.aceiteOnlineAtivo ?? false;
  const podeEmitir = aceiteAtivo || aberta;

  if (!loading && !error && !info && !aceiteAtivo && equipamento.status !== "AGUARDANDO_APROVACAO") return null;

  return (
    <section
      className="space-y-3 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm"
      aria-label="Resposta do cliente ao orçamento"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-amber-950">Resposta do cliente ao orçamento</h4>
        <Button size="sm" variant="ghost" onClick={() => void carregar()} disabled={loading || busy}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="sr-only">Atualizar resposta</span>
        </Button>
      </div>

      {error && <p role="alert" className="text-destructive">{error}</p>}

      {info && (
        <p className="text-muted-foreground">
          Versão {info.versao} enviada em {formatarHora(info.criadaEm)} · {formatarValor(info.valorTotal)}
          {info.validoAte ? ` · válida até ${formatarHora(info.validoAte)}` : ""}
          {info.encerradaMotivo ? " · encerrada (o orçamento ou a etapa mudou; envie uma nova versão)" : ""}
        </p>
      )}

      {respostaFinal ? (
        <div className="space-y-1">
          <p className="font-medium text-amber-950">
            Cliente respondeu: {DECISAO_TEXTO[respostaFinal.decisao]} — aguardando conferência
          </p>
          <p className="text-muted-foreground">
            {respostaFinal.origem === "PORTAL" ? "Pelo link" : `Informado à equipe por ${respostaFinal.registradaPor ?? "—"}`}
            {" "}em {formatarHora(respostaFinal.registradaEm)}.
            {respostaFinal.origem === "PORTAL" && !info?.podeAplicar && info?.aplicavelAPartirDe
              ? ` O cliente ainda pode corrigir; a equipe aplica a partir de ${formatarHora(info.aplicavelAPartirDe)}.`
              : ""}
          </p>
          <Button
            size="sm"
            disabled={!info?.podeAplicar || busy}
            onClick={() => onAplicar(respostaFinal.decisao === "APROVAR" ? "aprovar" : "reprovar")}
          >
            Revisar e aplicar decisão
          </Button>
        </div>
      ) : (
        resposta?.decisao === "DESFEITA" && (
          <p className="text-muted-foreground">O cliente retirou a resposta em {formatarHora(resposta.registradaEm)}.</p>
        )
      )}

      {podeEmitir && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={gerarLink} disabled={busy || !aceiteAtivo}>
              <Link2 className="mr-2 h-4 w-4" />
              {info?.linkStatus === "ativo" ? "Gerar novo link" : "Gerar link de decisão"}
            </Button>
            {envioOrcamentoDisponivel("whatsapp") && (
              <Button size="sm" variant="outline" onClick={() => void enviarPorWhatsApp()} disabled={busy || !aceiteAtivo}>
                Enviar por WhatsApp
              </Button>
            )}
            {info?.linkStatus === "ativo" && (
              <Button size="sm" variant="outline" onClick={revogarLink} disabled={busy}>Encerrar link</Button>
            )}
          </div>
          {confirmacaoEnvio && (
            <div role="alertdialog" className="space-y-2 rounded border border-amber-300 bg-amber-100/60 p-2 text-xs">
              <p>{confirmacaoEnvio.texto}</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => void enviarPorWhatsApp(confirmacaoEnvio.opcoes)}>Enviar mesmo assim</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmacaoEnvio(null)}>Cancelar</Button>
              </div>
            </div>
          )}
          {!aceiteAtivo && (
            <p className="text-xs text-muted-foreground">O aceite online ainda não foi ativado para esta instalação.</p>
          )}
          {link && mensagem && (
            <div className="space-y-2">
              <label className="block text-xs font-medium" htmlFor="mensagem-link-orcamento">Mensagem pronta</label>
              <textarea
                id="mensagem-link-orcamento"
                readOnly
                rows={7}
                value={mensagem.texto}
                className="w-full rounded border bg-background px-2 py-1 text-xs"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void copiar(mensagem.texto, "Mensagem")}>
                  <Copy className="mr-1 h-4 w-4" /> Copiar mensagem
                </Button>
                <Button size="sm" variant="outline" onClick={() => void copiar(link.url, "Link")}>
                  <Copy className="mr-1 h-4 w-4" /> Copiar só o link
                </Button>
                <Button size="sm" variant="outline" disabled={!envioOrcamentoDisponivel("email")}>Enviar por email</Button>
              </div>
              {!envioOrcamentoDisponivel("email") && (
                <p className="text-xs text-muted-foreground">
                  O envio por email ainda não está configurado: copie a mensagem e envie pelo canal do cliente.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Este link aparece só agora; para reenviar depois, gere outro (o anterior é encerrado).
              </p>
            </div>
          )}
        </div>
      )}

      {equipamento.status === "AGUARDANDO_APROVACAO" && !respostaFinal && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          <span className="text-xs text-muted-foreground">Resposta por telefone ou WhatsApp:</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => registrarInformada("APROVAR")}>Cliente aprovou</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => registrarInformada("RECUSAR")}>Cliente recusou</Button>
        </div>
      )}

      {info && info.solicitacoes.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <p className="text-xs font-medium text-amber-950">Mensagens do cliente</p>
          <ul className="space-y-1 text-xs">
            {info.solicitacoes.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-2">
                <span className={item.tratadaEm ? "text-muted-foreground" : ""}>
                  <strong>{item.tipo === "MUDANCA" ? "Pedido de mudança" : "Dúvida"}</strong> · {formatarHora(item.criadaEm)} · {item.mensagem}
                </span>
                {item.tratadaEm ? (
                  <span className="shrink-0 text-muted-foreground">tratada</span>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => tratarSolicitacao(item.id)}>Marcar como tratada</Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {info && info.historico.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">Histórico de respostas ({info.historico.length})</summary>
          <ul className="mt-1 space-y-1 text-xs">
            {info.historico.map((item) => (
              <li key={item.id}>
                {formatarHora(item.registradaEm)} · {item.origem === "PORTAL" ? "Cliente (link)" : `Equipe (${item.registradaPor ?? "—"})`} {DECISAO_TEXTO[item.decisao]}
                {item.aplicadaEm ? ` · aplicada em ${formatarHora(item.aplicadaEm)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
