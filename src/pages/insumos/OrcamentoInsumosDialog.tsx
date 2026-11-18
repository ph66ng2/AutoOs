/**
 * Diálogo do orçamento de venda avulsa de insumos (OI-<n>): criar, editar e conduzir o orçamento
 * (PDF, e-mail, WhatsApp, aprovar, reprovar, cancelar, entregar).
 *
 * O total mostrado aqui é só uma prévia. O backend recalcula tudo, confere o estoque e baixa os
 * itens na aprovação. Toda ação de escrita pede a permissão financeira (PIN, conforme o perfil).
 */
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
  Trash2,
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
import type { AcaoInicialOrcamentoInsumos } from "@/hooks/useOrcamentoInsumosEditor";
import { useOrcamentoInsumosEditor } from "@/hooks/useOrcamentoInsumosEditor";
import {
  STATUS_ORCAMENTO_INSUMOS_COR,
  STATUS_ORCAMENTO_INSUMOS_LABEL,
  formaPagamentoRotulo,
} from "@/lib/orcamento-insumos";
import { formatCurrency } from "@/lib/utils";
import { ValorDecimalInput } from "@/components/ui/valor-decimal-input";
import { OrcamentoInsumosItensEditor } from "@/pages/insumos/OrcamentoInsumosItensEditor";

interface OrcamentoInsumosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vazio = novo orçamento. */
  orcamentoId?: number | null;
  /** Chamado depois de qualquer alteração gravada, para a lista recarregar. */
  onChanged?: () => void;
  /**
   * Ação escolhida na lista (ação principal ou ⋯). Quando o orçamento termina de carregar,
   * a janela chama a mesma função do botão de dentro, com o mesmo PIN e a mesma confirmação.
   */
  acaoInicial?: AcaoInicialOrcamentoInsumos | null;
}

export type { AcaoInicialOrcamentoInsumos } from "@/hooks/useOrcamentoInsumosEditor";


const botaoGrupo = "rounded-none active:scale-[0.96] [transition-property:scale,background-color,color]";

const botaoNegativo = "text-destructive hover:bg-status-bad-bg hover:text-destructive";

const rotuloSecao = "text-sm font-medium";

export function OrcamentoInsumosDialog({
  open,
  onOpenChange,
  orcamentoId = null,
  onChanged,
  acaoInicial = null,
}: OrcamentoInsumosDialogProps) {
  const {
    detalhe,
    cliente,
    setCliente,
    contato,
    setContato,
    linhas,
    setLinhas,
    setDesconto,
    validade,
    setValidade,
    observacoes,
    setObservacoes,
    alterado,
    setAlterado,
    carregando,
    ocupado,
    erro,
    pdf,
    setPdf,
    pagamentoAberto,
    setPagamentoAberto,
    erroAprovacao,
    confirmando,
    setConfirmando,
    podeSalvarPdf,
    status,
    acoes,
    descontoNumero,
    totais,
    faltas,
    podeSalvar,
    bloqueadoPorEdicao,
    vencido,
    motivoSemSalvar,
    titulo,
    editavel,
    textoConfirmacao,
    editar,
    salvar,
    gerarPdf,
    salvarPdf,
    enviar,
    iniciarAprovacao,
    aprovar,
    confirmar,
  } = useOrcamentoInsumosEditor({ open, onOpenChange, orcamentoId, onChanged, acaoInicial });
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
                {vencido && (
                  <Badge variant="outline" className="border-destructive/30 bg-status-bad-bg text-destructive">Vencido</Badge>
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
                  <p role="alert" className="whitespace-pre-line rounded-md border border-destructive/30 bg-status-bad-bg px-3 py-2 text-sm text-destructive">
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
                      <p className="text-xs text-status-wait">Este cliente pediu para não receber e-mails.</p>
                    )}
                    {cliente && cliente.receber_whatsapp === false && (
                      <p className="text-xs text-status-wait">Este cliente pediu para não receber WhatsApp.</p>
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
                    <p className="text-xs text-status-wait" role="status">
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
                    {vencido && !alterado && (
                      <p className="text-xs text-status-wait">
                        Validade vencida. Altere a validade e salve para renovar antes de aprovar.
                      </p>
                    )}
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
                      <p className="text-xs text-destructive" role="alert">O desconto passa do total dos itens.</p>
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
                  <p className="text-xs text-status-wait">
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
              {acoes.excluir && detalhe && (
                <Button type="button" variant="ghost" size="sm" className={botaoNegativo} disabled={ocupado} onClick={() => setConfirmando("excluir")}>
                  <Trash2 className="mr-1.5 h-4 w-4" />Excluir
                </Button>
              )}
              {motivoSemSalvar && (
                <p className="flex items-center gap-1.5 text-sm text-status-wait" data-testid="motivo-sem-salvar">
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
                <Button
                  type="button"
                  size="sm"
                  disabled={ocupado || bloqueadoPorEdicao || vencido}
                  title={vencido ? "Orçamento vencido: altere a validade e salve antes de aprovar." : undefined}
                  onClick={() => void iniciarAprovacao()}
                >
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
        onDownload={podeSalvarPdf ? salvarPdf : undefined}
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
