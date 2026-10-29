/**
 * Diálogo do orçamento de venda avulsa de insumos (OI-<n>): criar, editar e conduzir o orçamento
 * (PDF, e-mail, WhatsApp, aprovar, reprovar, cancelar, entregar).
 *
 * O total mostrado aqui é só uma prévia. O backend recalcula tudo, confere o estoque e baixa os
 * itens na aprovação. Toda ação de escrita pede a permissão financeira (PIN, conforme o perfil).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  FileText,
  Info,
  Mail,
  MessageCircle,
  PackageCheck,
  Save,
  ThumbsDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateIsoInput } from "@/components/ui/date-iso-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClienteSelector } from "@/components/equipamentos/ClienteSelector";
import { ContatoResponsavelSelector } from "@/components/equipamentos/ContatoResponsavelSelector";
import { PagamentoOrcamentoDialog } from "@/components/equipamentos/PagamentoOrcamentoDialog";
import { PdfPreviewDialog } from "@/components/equipamentos/PdfPreviewDialog";
import { documentoExibicaoCliente } from "@/components/clientes/cliente-display-utils";
import { useNotification } from "@/hooks/useNotification";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { db } from "@/lib/db";
import {
  STATUS_ORCAMENTO_INSUMOS_COR,
  STATUS_ORCAMENTO_INSUMOS_LABEL,
  acoesOrcamentoInsumos,
  calcularTotaisOrcamentoInsumos,
  formaPagamentoRotulo,
  linhasSemSaldo,
  validadePadraoOrcamentoInsumos,
  type LinhaOrcamentoInsumos,
} from "@/lib/orcamento-insumos";
import { OrcamentoInsumosService } from "@/lib/orcamento-insumos-service";
import { PdfService, type PdfArtifact } from "@/lib/pdf-service";
import { formatCurrency } from "@/lib/utils";
import { ValorDecimalInput } from "@/components/ui/valor-decimal-input";
import { OrcamentoInsumosItensEditor } from "@/pages/insumos/OrcamentoInsumosItensEditor";
import {
  SENSITIVE_PERMISSIONS,
  type Cliente,
  type ClienteContato,
  type FormaPagamento,
  type OrcamentoInsumosDetalhe,
} from "@/types";

interface OrcamentoInsumosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vazio = novo orçamento. */
  orcamentoId?: number | null;
  /** Chamado depois de qualquer alteração gravada, para a lista recarregar. */
  onChanged?: () => void;
}

type AcaoConfirmada = "reprovar" | "cancelar" | "entregar";

const botaoGrupo = "rounded-none active:scale-[0.96] [transition-property:scale,background-color,color]";

const botaoNegativo = "text-red-600 hover:bg-red-50 hover:text-red-700";

const rotuloSecao = "text-sm font-medium";

function linhasDoDetalhe(detalhe: OrcamentoInsumosDetalhe): LinhaOrcamentoInsumos[] {
  return detalhe.itens.map((item) => ({
    produto_id: item.produto_id,
    descricao: item.descricao,
    categoria: item.categoria,
    quantidade: item.quantidade,
    valor_unitario: item.valor_unitario,
    saldo: item.saldo_estoque ?? null,
  }));
}

function contatoDoDetalhe(detalhe: OrcamentoInsumosDetalhe): ClienteContato | null {
  if (!detalhe.contato_id) return null;
  return {
    id: detalhe.contato_id,
    empresa_id: detalhe.empresa_id,
    cliente_id: detalhe.cliente_id,
    nome: detalhe.contato_nome ?? "",
    email: detalhe.contato_email ?? undefined,
    telefone: detalhe.contato_telefone ?? undefined,
    ativo: true,
  };
}

export function OrcamentoInsumosDialog({
  open,
  onOpenChange,
  orcamentoId = null,
  onChanged,
}: OrcamentoInsumosDialogProps) {
  const { success, warning, error: showError } = useNotification();
  const { ensureSensitiveAccess } = useSensitiveAccess();

  const [detalhe, setDetalhe] = useState<OrcamentoInsumosDetalhe | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [contato, setContato] = useState<ClienteContato | null>(null);
  const [linhas, setLinhas] = useState<LinhaOrcamentoInsumos[]>([]);
  const [desconto, setDesconto] = useState("");
  const [validade, setValidade] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [alterado, setAlterado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PdfArtifact | null>(null);
  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [erroAprovacao, setErroAprovacao] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<AcaoConfirmada | null>(null);

  const aplicarDetalhe = useCallback((novo: OrcamentoInsumosDetalhe) => {
    setDetalhe(novo);
    setLinhas(linhasDoDetalhe(novo));
    setDesconto(novo.desconto > 0 ? String(novo.desconto) : "");
    setValidade(novo.validade ?? "");
    setObservacoes(novo.observacoes ?? "");
    setContato(contatoDoDetalhe(novo));
    setAlterado(false);
  }, []);

  // Abre em branco (novo) ou carrega o orçamento e o cliente (existente).
  useEffect(() => {
    if (!open) return;
    let ativo = true;
    setErro(null);
    setErroAprovacao(null);
    setPdf(null);
    setConfirmando(null);
    setPagamentoAberto(false);
    if (orcamentoId == null) {
      setDetalhe(null);
      setCliente(null);
      setContato(null);
      setLinhas([]);
      setDesconto("");
      setValidade(validadePadraoOrcamentoInsumos());
      setObservacoes("");
      setAlterado(false);
      return;
    }
    setCarregando(true);
    db.obterOrcamentoInsumos(orcamentoId)
      .then(async (carregado) => {
        const clienteCarregado = await db.buscarCliente(carregado.cliente_id).catch(() => null);
        if (!ativo) return;
        setCliente(clienteCarregado);
        aplicarDetalhe(carregado);
      })
      .catch((causa) => {
        if (ativo) setErro(String(causa));
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [open, orcamentoId, aplicarDetalhe]);

  const status = detalhe?.status ?? null;
  const acoes = acoesOrcamentoInsumos(status);
  const descontoNumero = Number(desconto) || 0;
  const totais = useMemo(
    () => calcularTotaisOrcamentoInsumos(linhas, descontoNumero),
    [linhas, descontoNumero],
  );
  const faltas = useMemo(() => linhasSemSaldo(linhas), [linhas]);
  const quantidadesValidas = linhas.every((linha) => Number.isInteger(linha.quantidade) && linha.quantidade > 0);
  const podeSalvar =
    acoes.salvar
    && !ocupado
    && cliente?.id != null
    && linhas.length > 0
    && quantidadesValidas
    && !totais.descontoExcedido
    && Boolean(validade);
  const bloqueadoPorEdicao = alterado || !detalhe;
  /** Explica por que o Salvar está desabilitado (o aviso de desconto já aparece junto ao campo). */
  const motivoSemSalvar = (() => {
    if (!acoes.salvar || ocupado || podeSalvar) return null;
    if (cliente?.id == null) return "Escolha o cliente para salvar.";
    if (linhas.length === 0) return "Inclua ao menos um item para salvar.";
    if (!quantidadesValidas) return "Informe uma quantidade maior que zero em todos os itens.";
    if (!validade) return "Informe a validade do orçamento.";
    return null;
  })();

  function editar<T>(definir: (valor: T) => void) {
    return (valor: T) => {
      definir(valor);
      setAlterado(true);
      setErro(null);
    };
  }

  async function liberar(titulo: string, descricao: string): Promise<boolean> {
    return ensureSensitiveAccess({
      title: titulo,
      description: descricao,
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
    });
  }

  /** Roda uma ação do backend, aplica o orçamento devolvido e avisa a lista. Devolve a mensagem de erro, se houver. */
  async function executar(
    acao: () => Promise<OrcamentoInsumosDetalhe>,
    mensagem: string,
    contexto: string,
  ): Promise<string | null> {
    setOcupado(true);
    setErro(null);
    try {
      const novo = await acao();
      aplicarDetalhe(novo);
      onChanged?.();
      success("Orçamento de insumos", mensagem);
      return null;
    } catch (causa) {
      const texto = typeof causa === "string" ? causa : String((causa as Error)?.message ?? causa);
      setErro(texto);
      showError("Orçamento de insumos", contexto, causa);
      return texto;
    } finally {
      setOcupado(false);
    }
  }

  async function salvar() {
    if (!podeSalvar || cliente?.id == null) return;
    if (!(await liberar("Salvar orçamento de insumos", "Informe o PIN para salvar valores do orçamento."))) return;
    const entrada = {
      cliente_id: cliente.id,
      contato_id: contato?.id ?? null,
      validade,
      observacoes: observacoes.trim() || null,
      desconto: totais.desconto,
      itens: linhas.map((linha) => ({
        produto_id: linha.produto_id,
        quantidade: linha.quantidade,
        valor_unitario: linha.valor_unitario,
      })),
    };
    await executar(
      () =>
        detalhe
          ? db.atualizarOrcamentoInsumos(detalhe.id, { ...entrada, atualizado_em: detalhe.atualizado_em })
          : db.criarOrcamentoInsumos(entrada),
      "Orçamento salvo.",
      "Salvar orçamento",
    );
  }

  async function gerarPdf() {
    if (!detalhe || bloqueadoPorEdicao) return;
    try {
      setPdf(await PdfService.construirOrcamentoInsumos(detalhe));
    } catch (causa) {
      showError("Orçamento de insumos", "Gerar PDF", causa);
    }
  }

  /** Baixar/salvar o PDF é o momento em que o orçamento sai da empresa: marca como enviado. */
  async function salvarPdf(artifact: PdfArtifact) {
    if (!detalhe) return;
    await PdfService.salvarOrcamentoInsumos(artifact, detalhe);
    if (detalhe.status === "RASCUNHO" && (await liberar("Marcar como enviado", "Informe o PIN para marcar o orçamento como enviado."))) {
      await executar(
        () => db.marcarOrcamentoInsumosEnviado(detalhe.id, detalhe.atualizado_em, "PDF"),
        "PDF salvo e orçamento marcado como enviado.",
        "Marcar como enviado",
      );
    }
  }

  async function enviar(canal: "EMAIL" | "WHATSAPP") {
    if (!detalhe || bloqueadoPorEdicao) return;
    if (!(await liberar("Enviar orçamento", "Informe o PIN para enviar o orçamento ao cliente."))) return;
    setOcupado(true);
    setErro(null);
    const resultado =
      canal === "EMAIL"
        ? await OrcamentoInsumosService.enviarEmail(detalhe)
        : await OrcamentoInsumosService.enviarWhatsapp(detalhe);
    setOcupado(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro ?? "Não foi possível enviar o orçamento.");
      return;
    }
    const falha = await executar(
      () => db.marcarOrcamentoInsumosEnviado(detalhe.id, detalhe.atualizado_em, canal),
      canal === "EMAIL" ? "Orçamento enviado por e-mail." : "Orçamento enviado por WhatsApp.",
      "Marcar como enviado",
    );
    if (falha) {
      warning("Orçamento de insumos", "A mensagem foi enviada, mas o status não foi atualizado. Recarregue o orçamento.");
    }
  }

  async function iniciarAprovacao() {
    if (!detalhe || bloqueadoPorEdicao) return;
    if (!(await liberar("Aprovar orçamento de insumos", "Informe o PIN para aprovar e baixar o estoque."))) return;
    setErroAprovacao(null);
    setPagamentoAberto(true);
  }

  async function aprovar(pagamento: FormaPagamento): Promise<boolean> {
    if (!detalhe) return false;
    setErroAprovacao(null);
    const falha = await executar(
      () => db.aprovarOrcamentoInsumos(detalhe.id, detalhe.atualizado_em, pagamento),
      "Orçamento aprovado e estoque baixado.",
      "Aprovar orçamento",
    );
    if (falha) {
      setErroAprovacao(falha);
      return false;
    }
    return true;
  }

  async function confirmar() {
    const acao = confirmando;
    setConfirmando(null);
    if (!detalhe || !acao) return;
    if (!(await liberar("Confirmar ação financeira", "Informe o PIN para continuar com o orçamento de insumos."))) return;
    if (acao === "reprovar") {
      await executar(() => db.reprovarOrcamentoInsumos(detalhe.id, detalhe.atualizado_em), "Orçamento reprovado.", "Reprovar orçamento");
    } else if (acao === "cancelar") {
      await executar(
        () => db.cancelarOrcamentoInsumos(detalhe.id, detalhe.atualizado_em, acoes.cancelarDevolveEstoque),
        acoes.cancelarDevolveEstoque ? "Orçamento cancelado e estoque devolvido." : "Orçamento cancelado.",
        "Cancelar orçamento",
      );
    } else {
      await executar(() => db.marcarOrcamentoInsumosEntregue(detalhe.id, detalhe.atualizado_em), "Entrega registrada.", "Marcar como entregue");
    }
  }

  const titulo = detalhe ? `Orçamento de insumos ${detalhe.numero_exibicao}` : "Novo orçamento de insumos";
  const editavel = acoes.editar;
  const textoConfirmacao: Record<AcaoConfirmada, { titulo: string; descricao: string; botao: string }> = {
    reprovar: {
      titulo: "Reprovar orçamento?",
      descricao: "O orçamento fica como reprovado e não poderá mais ser aprovado.",
      botao: "Reprovar",
    },
    cancelar: {
      titulo: "Cancelar orçamento?",
      descricao: acoes.cancelarDevolveEstoque
        ? "Este orçamento já foi aprovado e baixou o estoque. Ao cancelar, todos os itens voltam para o estoque."
        : "O orçamento fica como cancelado e não poderá mais ser aprovado.",
      botao: acoes.cancelarDevolveEstoque ? "Cancelar e devolver ao estoque" : "Cancelar orçamento",
    },
    entregar: {
      titulo: "Marcar como entregue?",
      descricao: "Confirma que os itens foram entregues ao cliente. Depois disso o orçamento não pode mais ser cancelado.",
      botao: "Marcar entregue",
    },
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-4 sm:max-w-5xl">
          <div className="flex items-start justify-between gap-4 pr-8">
            <DialogHeader className="min-w-0 space-y-1.5">
              <DialogTitle className="flex items-center gap-2">
                {titulo}
                {status && (
                  <Badge variant="outline" className={STATUS_ORCAMENTO_INSUMOS_COR[status]}>
                    {STATUS_ORCAMENTO_INSUMOS_LABEL[status]}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                Venda avulsa de etiquetas, ribbons, peças e outros itens do estoque, sem equipamento em manutenção.
              </DialogDescription>
            </DialogHeader>
            {(acoes.gerarPdf || acoes.enviar) && (
              <div role="group" aria-label="Compartilhar" className="inline-flex shrink-0 divide-x overflow-hidden rounded-md border bg-background">
                {acoes.gerarPdf && (
                  <Button type="button" variant="ghost" size="sm" className={botaoGrupo} aria-label="Gerar PDF" title={bloqueadoPorEdicao ? "Salve as alterações primeiro" : undefined} disabled={ocupado || bloqueadoPorEdicao} onClick={() => void gerarPdf()}>
                    <FileText className="mr-1.5 h-4 w-4" aria-hidden />PDF
                  </Button>
                )}
                {acoes.enviar && (
                  <>
                    <Button type="button" variant="ghost" size="sm" className={botaoGrupo} aria-label="Enviar por e-mail" title={bloqueadoPorEdicao ? "Salve as alterações primeiro" : undefined} disabled={ocupado || bloqueadoPorEdicao} onClick={() => void enviar("EMAIL")}>
                      <Mail className="mr-1.5 h-4 w-4" aria-hidden />E-mail
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className={botaoGrupo} aria-label="Enviar por WhatsApp" title={bloqueadoPorEdicao ? "Salve as alterações primeiro" : undefined} disabled={ocupado || bloqueadoPorEdicao} onClick={() => void enviar("WHATSAPP")}>
                      <MessageCircle className="mr-1.5 h-4 w-4" aria-hidden />WhatsApp
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-1">
            {carregando ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando orçamento...</p>
            ) : (
              <>
                {erro && (
                  <p role="alert" className="whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {erro}
                  </p>
                )}

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className={rotuloSecao}>Cliente</Label>
                    {editavel ? (
                      <ClienteSelector
                        clienteInicial={cliente}
                        touchMode={false}
                        onClienteSelecionado={editar(setCliente)}
                        onClienteRemovido={() => {
                          setCliente(null);
                          setContato(null);
                          setAlterado(true);
                        }}
                      />
                    ) : (
                      <p className="rounded-md border px-3 py-2 text-sm">
                        <span className="font-medium">{detalhe?.cliente_nome ?? "—"}</span>
                        <span className="ml-2 text-muted-foreground">
                          {cliente ? documentoExibicaoCliente(cliente) : (detalhe?.cliente_documento ?? "")}
                        </span>
                      </p>
                    )}
                    {cliente && cliente.receber_email === false && (
                      <p className="text-xs text-amber-700">Este cliente pediu para não receber e-mails.</p>
                    )}
                    {cliente && cliente.receber_whatsapp === false && (
                      <p className="text-xs text-amber-700">Este cliente pediu para não receber WhatsApp.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className={rotuloSecao}>Contato</Label>
                    {editavel ? (
                      <ContatoResponsavelSelector
                        key={`${detalhe?.id ?? "novo"}-${cliente?.id ?? "sem"}`}
                        cliente={cliente}
                        empresaId={cliente?.empresa_id ?? detalhe?.empresa_id}
                        value={contato}
                        onChange={editar(setContato)}
                        disabled={ocupado}
                        titulo="Quem recebe o orçamento"
                      />
                    ) : (
                      <p className="rounded-md border px-3 py-2 text-sm">{detalhe?.contato_nome ?? "—"}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className={rotuloSecao}>Itens</Label>
                  <OrcamentoInsumosItensEditor
                    linhas={linhas}
                    totais={totais}
                    onChange={editar(setLinhas)}
                    disabled={!editavel || ocupado}
                  />
                  {faltas.length > 0 && editavel && (
                    <p className="text-xs text-amber-700" role="status">
                      Saldo menor que o pedido em: {faltas.map((linha) => `${linha.descricao} (saldo ${linha.saldo})`).join(", ")}.
                      Dá para salvar, mas a aprovação só passa quando houver estoque.
                    </p>
                  )}
                </div>

                <div className="grid items-start gap-5 md:grid-cols-[1fr_1fr_1.1fr]">
                  <div className="space-y-2">
                    <Label htmlFor="oi-validade" className={rotuloSecao}>Validade</Label>
                    <DateIsoInput
                      id="oi-validade"
                      value={validade}
                      disabled={!editavel || ocupado}
                      onValueChange={editar(setValidade)}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="oi-desconto" className={rotuloSecao}>Desconto (R$)</Label>
                    <ValorDecimalInput
                      id="oi-desconto"
                      min={0}
                      value={descontoNumero}
                      disabled={!editavel || ocupado}
                      onValueChange={(valor) => editar(setDesconto)(String(valor))}
                      className="h-10"
                    />
                    {totais.descontoExcedido && (
                      <p className="text-xs text-red-600" role="alert">O desconto passa do total dos itens.</p>
                    )}
                  </div>
                  <div className="space-y-1.5 rounded-lg bg-muted/50 px-4 py-3 text-sm tabular-nums" aria-label="Totais">
                    <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(totais.subtotal)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>Desconto</span><span>- {formatCurrency(totais.desconto)}</span></div>
                    <div className="flex justify-between border-t pt-2 text-lg font-semibold" data-testid="total-geral">
                      <span>Total</span><span>{formatCurrency(totais.total)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="oi-observacoes" className={rotuloSecao}>Observações</Label>
                  <Textarea
                    id="oi-observacoes"
                    rows={2}
                    value={observacoes}
                    disabled={!editavel || ocupado}
                    onChange={(event) => editar(setObservacoes)(event.target.value)}
                    className="min-h-0 resize-none"
                  />
                </div>

                {detalhe && !editavel && (
                  <p className="text-sm text-muted-foreground">
                    Pagamento: {formaPagamentoRotulo(detalhe.forma_pagamento_codigo, detalhe.forma_pagamento_detalhe)}
                  </p>
                )}
                {status === "ENVIADO" && alterado && (
                  <p className="text-xs text-amber-700">
                    Ao salvar, o orçamento volta para rascunho e precisa ser enviado de novo ao cliente.
                  </p>
                )}
                {detalhe && alterado && (acoes.gerarPdf || acoes.enviar) && (
                  <p className="text-xs text-muted-foreground">Salve as alterações para gerar o PDF ou enviar.</p>
                )}
              </>
            )}
          </div>

          <DialogFooter className="flex-wrap items-center gap-3 border-t pt-4 sm:justify-between sm:space-x-0">
            <div className="flex flex-wrap items-center gap-1">
              {acoes.reprovar && (
                <Button type="button" variant="ghost" size="sm" className={botaoNegativo} disabled={ocupado} onClick={() => setConfirmando("reprovar")}>
                  <ThumbsDown className="mr-1.5 h-4 w-4" />Reprovar
                </Button>
              )}
              {acoes.cancelar && (
                <Button type="button" variant="ghost" size="sm" className={botaoNegativo} disabled={ocupado} onClick={() => setConfirmando("cancelar")}>
                  <Ban className="mr-1.5 h-4 w-4" />Cancelar orçamento
                </Button>
              )}
              {motivoSemSalvar && (
                <p className="flex items-center gap-1.5 text-sm text-amber-700" data-testid="motivo-sem-salvar">
                  <Info className="h-4 w-4 shrink-0" aria-hidden />
                  {motivoSemSalvar}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {acoes.salvar && (
                <Button type="button" size="sm" variant={acoes.aprovar && detalhe ? "outline" : "default"} disabled={!podeSalvar} onClick={() => void salvar()}>
                  <Save className="mr-1.5 h-4 w-4" />Salvar
                </Button>
              )}
              {acoes.aprovar && (
                <Button type="button" size="sm" disabled={ocupado || bloqueadoPorEdicao} onClick={() => void iniciarAprovacao()}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />Aprovar
                </Button>
              )}
              {acoes.entregar && (
                <Button type="button" size="sm" disabled={ocupado} onClick={() => setConfirmando("entregar")}>
                  <PackageCheck className="mr-1.5 h-4 w-4" />Marcar entregue
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PagamentoOrcamentoDialog
        open={pagamentoAberto}
        loading={ocupado}
        error={erroAprovacao}
        onOpenChange={setPagamentoAberto}
        onConfirm={aprovar}
      />
      <PdfPreviewDialog
        artifact={pdf}
        onOpenChange={(aberto) => {
          if (!aberto) setPdf(null);
        }}
        onDownload={salvarPdf}
      />
      <ConfirmDialog
        open={confirmando !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setConfirmando(null);
        }}
        title={confirmando ? textoConfirmacao[confirmando].titulo : ""}
        description={confirmando ? textoConfirmacao[confirmando].descricao : undefined}
        confirmLabel={confirmando ? textoConfirmacao[confirmando].botao : "Confirmar"}
        cancelLabel="Voltar"
        variant={confirmando === "entregar" ? "default" : "destructive"}
        onConfirm={() => void confirmar()}
      />
    </>
  );
}
