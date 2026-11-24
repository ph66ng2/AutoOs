import { useEffect } from "react";
import { Selo } from "@/components/detalhe/Selo";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Info, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateIsoInput } from "@/components/ui/date-iso-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ValorDecimalInput } from "@/components/ui/valor-decimal-input";
import { ClienteSelector } from "@/components/equipamentos/ClienteSelector";
import { ContatoResponsavelSelector } from "@/components/equipamentos/ContatoResponsavelSelector";
import { useOrcamentoInsumosEditor } from "@/hooks/useOrcamentoInsumosEditor";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { STATUS_ORCAMENTO_INSUMOS_COR, STATUS_ORCAMENTO_INSUMOS_LABEL } from "@/lib/orcamento-insumos";
import { cn, formatCurrency } from "@/lib/utils";
import { OrcamentoInsumosItensEditor } from "@/pages/insumos/OrcamentoInsumosItensEditor";
import { SENSITIVE_PERMISSIONS } from "@/types";
import { useAvisoAoSair } from "@/hooks/useAvisoAoSair";
import { useEscSai } from "@/hooks/useEscSai";
import { TeclaNoBotao } from "@/components/ui/tecla-no-botao";
import { CarregandoSkeleton, SkeletonFormulario, SkeletonPagina, SkeletonTabela } from "@/components/ui/skeleton";

function Secao({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">{titulo}</h2>
        {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * Criar (/vendas/novo) e editar (/vendas/:id/editar) um orçamento de insumos. Salvar chama
 * os mesmos comandos de sempre, com o mesmo PIN (useOrcamentoInsumosEditor).
 */
export default function VendaFormulario() {
  const { id } = useParams();
  const orcamentoId = id && /^\d+$/.test(id) ? Number(id) : null;
  return <FormularioDaVenda key={orcamentoId ?? "novo"} orcamentoId={orcamentoId} />;
}

function FormularioDaVenda({ orcamentoId }: { orcamentoId: number | null }) {
  const navigate = useNavigate();
  const { hasPermission } = useSensitiveAccess();
  const podeAgir = hasPermission(SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS);
  const editor = useOrcamentoInsumosEditor({ orcamentoId });
  const {
    detalhe, cliente, setCliente, contato, setContato, setAlterado, linhas, setLinhas, validade, setValidade,
    observacoes, setObservacoes, descontoNumero, setDesconto, alterado, carregando, ocupado, erro, status,
    totais, faltas, editavel, podeSalvar, motivoSemSalvar, salvar, editar,
  } = editor;
  const destino = orcamentoId != null ? `/vendas/${orcamentoId}` : "/vendas";
  // Menu, Ctrl+K ou voltar com a venda pela metade: pergunta antes. Voltar/Cancelar também avisa.
  const aviso = useAvisoAoSair(alterado && editavel);
  // Esc volta como o botão "(Esc)"; com alterações, o aviso de saída pergunta antes.
  useEscSai(true, () => navigate(destino));

  // "Renovar validade" chega com ?foco=validade.
  useEffect(() => {
    if (carregando) return;
    if (new URLSearchParams(window.location.search).get("foco") === "validade") {
      document.getElementById("oi-validade")?.focus();
    }
  }, [carregando]);

  async function salvarEVoltar() {
    if (!podeSalvar || (detalhe?.id ?? null) !== orcamentoId) return;
    const salvo = await salvar();
    if (!salvo) return;
    aviso.liberarProximaSaida();
    navigate(`/vendas/${salvo.id}`);
  }

  const voltar = (
    <button
      type="button"
      onClick={() => navigate(destino)}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors duration-rapida hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {detalhe ? detalhe.numero_exibicao : "Vendas de insumos"}
    </button>
  );

  if (!podeAgir) {
    return (
      <div className="space-y-4">
        {voltar}
        <p className="flex items-start gap-2 rounded-xl bg-muted px-4 py-3 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Para criar ou editar orçamentos, troque para um perfil com <strong>Ações financeiras</strong>.
          </span>
        </p>
      </div>
    );
  }
  if (carregando) {
    return (
      <div className="space-y-4">
        {voltar}
        <CarregandoSkeleton rotulo="Carregando orçamento...">
          <SkeletonPagina><div className="space-y-4 rounded-xl border p-5"><SkeletonFormulario campos={4} /><SkeletonTabela linhas={3} colunas={4} /></div></SkeletonPagina>
        </CarregandoSkeleton>
      </div>
    );
  }
  if (orcamentoId != null && detalhe?.id !== orcamentoId) {
    return (
      <div className="space-y-4">
        {voltar}
        <p role="alert" className="rounded-xl border border-status-bad/30 bg-status-bad-bg px-4 py-3 text-sm text-status-bad">
          {erro ?? "Orçamento não encontrado."}
        </p>
      </div>
    );
  }
  if (detalhe && !editavel) {
    return (
      <div className="space-y-4">
        {voltar}
        <p role="status" className="rounded-xl bg-muted px-4 py-3 text-sm">
          O orçamento {detalhe.numero_exibicao} está {STATUS_ORCAMENTO_INSUMOS_LABEL[detalhe.status].toLowerCase()} e não pode mais ser editado.
        </p>
      </div>
    );
  }

  return (
    <div className="-mb-4 flex min-h-[calc(100vh-8rem)] flex-col gap-4 lg:-mb-8">
      {aviso.dialogo}
      {voltar}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight">
          {detalhe ? (
            <>
              Editar orçamento <span className="font-mono">{detalhe.numero_exibicao}</span>
            </>
          ) : (
            "Novo orçamento"
          )}
        </h1>
        {status && (
          <Selo rotulo={STATUS_ORCAMENTO_INSUMOS_LABEL[status]} classes={STATUS_ORCAMENTO_INSUMOS_COR[status]} />
        )}
      </div>

      {status === "ENVIADO" && (
        <div role="status" className="rounded-xl border border-status-wait/30 bg-status-wait-bg px-4 py-3 text-sm text-status-wait">
          <p className="font-semibold">Este orçamento já foi enviado</p>
          <p>Ao salvar, ele volta para Rascunho e precisa ser enviado de novo ao cliente.</p>
        </div>
      )}
      {erro && (
        <p role="alert" className="whitespace-pre-line rounded-xl border border-status-bad/30 bg-status-bad-bg px-4 py-3 text-sm text-status-bad">
          {erro}
        </p>
      )}

      <div className="max-w-5xl space-y-4">
        <Secao titulo="Cliente e contato">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Cliente *</Label>
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
              {cliente && cliente.receber_email === false && (
                <p className="text-xs text-status-wait">Este cliente pediu para não receber e-mails.</p>
              )}
              {cliente && cliente.receber_whatsapp === false && (
                <p className="text-xs text-status-wait">Este cliente pediu para não receber WhatsApp.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Contato</Label>
              <ContatoResponsavelSelector
                key={`${detalhe?.id ?? "novo"}-${cliente?.id ?? "sem"}`}
                cliente={cliente}
                empresaId={cliente?.empresa_id ?? detalhe?.empresa_id}
                value={contato}
                onChange={editar(setContato)}
                disabled={ocupado}
                titulo="Quem recebe o orçamento"
              />
              <p className="text-xs text-muted-foreground">Opcional. Recebe o PDF e as mensagens.</p>
            </div>
          </div>
        </Secao>

        <Secao titulo="Itens" nota="Impressoras não entram em venda de insumos">
          <OrcamentoInsumosItensEditor linhas={linhas} totais={totais} onChange={editar(setLinhas)} disabled={ocupado} />
          {faltas.length > 0 && (
            <p className="mt-3 text-xs text-status-wait" role="status">
              Saldo menor que o pedido em: {faltas.map((linha) => `${linha.descricao} (saldo ${linha.saldo})`).join(", ")}. Dá para
              salvar, mas a aprovação só passa quando houver estoque.
            </p>
          )}
        </Secao>

        <Secao titulo="Condições">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="oi-validade" className="text-sm font-medium">Validade *</Label>
              <DateIsoInput atalhos="prazo" id="oi-validade" value={validade} disabled={ocupado} onValueChange={editar(setValidade)} className="h-10" />
              <p className="text-xs text-muted-foreground">Vence se passar desta data em Rascunho ou Enviado.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="oi-desconto" className="text-sm font-medium">Desconto (R$)</Label>
              <ValorDecimalInput
                id="oi-desconto"
                min={0}
                value={descontoNumero}
                disabled={ocupado}
                onValueChange={(valor) => editar(setDesconto)(String(valor))}
                className="h-10"
              />
              {totais.descontoExcedido ? (
                <p className="text-xs text-destructive" role="alert">O desconto passa do total dos itens.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Não pode passar do subtotal.</p>
              )}
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <Label htmlFor="oi-observacoes" className="text-sm font-medium">Observações</Label>
            <Textarea id="oi-observacoes" value={observacoes} disabled={ocupado} onChange={(e) => editar(setObservacoes)(e.target.value)} className="min-h-24" />
          </div>
          <dl className="mb-5 ml-auto mt-5 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm tabular-nums" aria-label="Totais">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="text-right">{formatCurrency(totais.subtotal)}</dd>
            <dt className="text-muted-foreground">Desconto</dt>
            <dd className="text-right">− {formatCurrency(totais.desconto)}</dd>
            <dt className="border-t pt-2 font-bold">Total</dt>
            <dd className="border-t pt-2 text-right text-xl font-extrabold">{formatCurrency(totais.total)}</dd>
          </dl>
        </Secao>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-auto flex flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-3 lg:-mx-8 lg:px-8">
        <p className={cn("flex items-center gap-1.5 text-sm", motivoSemSalvar ? "text-status-wait" : "text-muted-foreground")}>
          {motivoSemSalvar ? (
            <>
              <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
              {motivoSemSalvar}
            </>
          ) : alterado ? (
            "Alterações não salvas"
          ) : (
            ""
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="h-10" onClick={() => navigate(destino)}>
            {alterado ? "Descartar alterações" : "Voltar"}
            <TeclaNoBotao tecla="Esc" />
          </Button>
          <Button className="h-10" disabled={!podeSalvar} onClick={() => void salvarEVoltar()}>
            Salvar orçamento
          </Button>
        </div>
      </div>
    </div>
  );
}
