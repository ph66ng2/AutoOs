import { useState } from "react";
import { Check, ChevronLeft, Loader2 } from "lucide-react";
import { Selo } from "@/components/detalhe/Selo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { useVendaRetirada } from "@/hooks/useVendaRetirada";
import { parseTimestampPostgres } from "@/lib/date-utils";
import { formaPagamentoRotulo, STATUS_ORCAMENTO_INSUMOS_COR, STATUS_ORCAMENTO_INSUMOS_LABEL } from "@/lib/orcamento-insumos";
import { formatCurrency } from "@/lib/utils";
import { formatarTelefone } from "@/lib/validations";
import { SENSITIVE_PERMISSIONS } from "@/types";
import { CarregandoSkeleton, SkeletonPagina, SkeletonTabela } from "@/components/ui/skeleton";

function dataHora(valor?: string | null): string {
  if (!valor) return "—";
  const instante = parseTimestampPostgres(valor);
  if (Number.isNaN(instante.getTime())) return "—";
  const opcoes = { timeZone: "America/Bahia" } as const;
  const dia = instante.toLocaleDateString("pt-BR", { ...opcoes, day: "2-digit", month: "2-digit" });
  const hora = instante.toLocaleTimeString("pt-BR", { ...opcoes, hour: "2-digit", minute: "2-digit" });
  return `${dia} ${hora}`;
}

/**
 * Venda de insumos aprovada sendo entregue no Balcão: o que o cliente leva, o total e
 * a forma de pagamento. Entregar confirma, pede o PIN (ensureSensitiveAccess com
 * Ações financeiras) e chama o mesmo "marcar entregue" de Vendas de insumos.
 */
export function VendaRetirada({
  vendaId,
  onVoltar,
  onInicio,
  onTrocarPerfil,
}: {
  vendaId: number;
  onVoltar: () => void;
  onInicio: () => void;
  onTrocarPerfil: () => void;
}) {
  const { venda, loading, error, entregar } = useVendaRetirada(vendaId);
  const { ensureSensitiveAccess, hasPermission } = useSensitiveAccess();
  const podeEntregar = hasPermission(SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEntrega, setErroEntrega] = useState<string | null>(null);
  const [entregueEm, setEntregueEm] = useState<string | null>(null);

  async function confirmarEntrega() {
    setConfirmando(false);
    const liberado = await ensureSensitiveAccess({
      title: "Confirmar retirada",
      description: "Informe o PIN para marcar como entregue.",
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
    });
    if (!liberado) {
      setErroEntrega("A entrega não foi autorizada.");
      return;
    }
    setEnviando(true);
    setErroEntrega(null);
    const falha = await entregar();
    setEnviando(false);
    if (falha) setErroEntrega(falha);
    else setEntregueEm(new Date().toISOString());
  }

  const voltar = (
    <Button variant="ghost" className="-ml-3 min-h-12 gap-1 text-base text-muted-foreground" onClick={onVoltar}>
      <ChevronLeft /> Entregar ao cliente
    </Button>
  );

  if (loading) {
    return (
      <section>
        {voltar}
        <CarregandoSkeleton rotulo="Carregando venda..." className="mt-6">
          <SkeletonPagina><SkeletonTabela linhas={3} colunas={3} /></SkeletonPagina>
        </CarregandoSkeleton>
      </section>
    );
  }
  if (error || !venda) {
    return (
      <section>
        {voltar}
        <p role="alert" className="mt-6 text-destructive">{error ?? "Venda não encontrada."}</p>
      </section>
    );
  }

  const quantidadeItens = venda.itens.reduce((soma, item) => soma + item.quantidade, 0);
  const resumoItens = venda.itens.map((item) => `${item.quantidade} ${item.descricao}`).join(", ");
  const pagamento = venda.forma_pagamento_codigo
    ? `${formaPagamentoRotulo(venda.forma_pagamento_codigo, venda.forma_pagamento_detalhe)} · escolhido na aprovação`
    : "Definido na aprovação";

  if (entregueEm) {
    return (
      <section>
        {voltar}
        <div className="flex flex-col items-center px-4 py-20 text-center">
          <span aria-hidden="true" className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-status-ok-bg text-status-ok">
            <Check className="h-7 w-7" />
          </span>
          <h1 className="text-2xl font-bold">{venda.numero_exibicao} entregue</h1>
          <p className="mt-2 text-muted-foreground">
            {venda.cliente_nome} · {dataHora(entregueEm).replace(" ", " às ")} · {venda.itens.length} {venda.itens.length === 1 ? "item" : "itens"}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button variant="outline" className="min-h-12 px-5 text-base" onClick={onVoltar}>
              Ver próximo da fila
            </Button>
            <Button className="min-h-12 px-5 text-base" onClick={onInicio}>
              Voltar ao início
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const aprovado = venda.status === "APROVADO";
  const contato = venda.contato_nome || "—";
  const telefone = venda.contato_telefone || venda.cliente_telefone;

  return (
    <section className="-m-4 flex min-h-[calc(100vh-72px)] flex-col lg:-m-8">
      <div className="flex-1 space-y-5 p-4 lg:p-8">
        {voltar}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{venda.cliente_nome}</h1>
          <span className="inline-flex items-center rounded-full bg-acc-soft px-2.5 py-0.5 text-xs font-bold text-acc-soft-foreground">Insumos</span>
          <Selo rotulo={STATUS_ORCAMENTO_INSUMOS_LABEL[venda.status]} classes={STATUS_ORCAMENTO_INSUMOS_COR[venda.status]} />
          <span className="font-mono text-sm text-muted-foreground">{venda.numero_exibicao}</span>
        </div>

        {!podeEntregar && aprovado && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-bad/30 bg-status-bad-bg px-4 py-3">
            <div className="text-sm text-status-bad">
              <p className="font-semibold">Este perfil não pode registrar entregas</p>
              <p>A entrega usa a permissão Ações financeiras. Peça para quem tem a permissão ou troque de perfil.</p>
            </div>
            <Button variant="outline" className="min-h-12 bg-card" onClick={onTrocarPerfil}>
              Trocar perfil
            </Button>
          </div>
        )}
        {!aprovado && (
          <p role="status" className="rounded-xl bg-muted px-4 py-3 text-sm">
            {venda.status === "ENTREGUE"
              ? "Esta venda já foi entregue."
              : "Ainda não dá para entregar: o cliente não aprovou este orçamento."}
          </p>
        )}
        {erroEntrega && (
          <p role="alert" className="rounded-xl border border-status-bad/30 bg-status-bad-bg px-4 py-3 text-sm text-status-bad">
            {erroEntrega}
          </p>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-bold">O que o cliente leva</h2>
            <ul className="mt-3 divide-y">
              {venda.itens.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3 py-3 text-base">
                  <span>
                    {item.quantidade} × {item.descricao}
                  </span>
                  <span className="whitespace-nowrap font-semibold tabular-nums">{formatCurrency(item.valor_total)}</span>
                </li>
              ))}
            </ul>
            {venda.desconto > 0 && (
              <p className="flex justify-between border-t py-2 text-sm text-muted-foreground">
                <span>Desconto</span>
                <span className="tabular-nums">− {formatCurrency(venda.desconto)}</span>
              </p>
            )}
            <p className="flex items-baseline justify-between border-t pt-3 text-lg font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(venda.valor_total)}</span>
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">Contato</dt>
              <dd className="font-semibold">{contato}</dd>
              <dt className="text-muted-foreground">Telefone</dt>
              <dd className="font-semibold">{telefone ? formatarTelefone(telefone) : "—"}</dd>
              <dt className="text-muted-foreground">Pagamento</dt>
              <dd className="font-semibold">{pagamento}</dd>
              <dt className="text-muted-foreground">Aprovado</dt>
              <dd className="font-semibold tabular-nums">{dataHora(venda.decidido_em)}</dd>
            </dl>
            <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm">
              O AutoOS não registra se o pagamento foi recebido. Confira antes de entregar.
            </p>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 flex gap-3 border-t bg-card px-4 py-4 lg:px-8">
        <Button variant="outline" className={`min-h-14 text-base ${aprovado && podeEntregar ? "w-1/3" : "w-full"}`} onClick={onVoltar}>
          Voltar
        </Button>
        {aprovado && podeEntregar && (
          <Button className="min-h-14 flex-1 text-base" disabled={enviando} onClick={() => setConfirmando(true)}>
            {enviando && <Loader2 className="animate-spin" />}
            Registrar entrega
          </Button>
        )}
      </div>

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent tamanho="m">
          <DialogHeader>
            <DialogTitle>
              Entregar {venda.numero_exibicao} para {venda.cliente_nome}?
            </DialogTitle>
            <DialogDescription>
              Confirma que os itens foram entregues. Depois disso o orçamento não pode mais ser cancelado.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-muted px-4 py-3 text-sm">
            <dt className="text-muted-foreground">Itens</dt>
            <dd className="font-semibold">{resumoItens || `${quantidadeItens} itens`}</dd>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-semibold tabular-nums">
              {formatCurrency(venda.valor_total)}
              {venda.forma_pagamento_codigo ? ` · ${formaPagamentoRotulo(venda.forma_pagamento_codigo)}` : ""}
            </dd>
          </dl>
          <DialogFooter>
            <Button variant="outline" className="min-h-12 px-5 text-base" onClick={() => setConfirmando(false)}>
              Voltar
            </Button>
            <Button className="min-h-12 px-5 text-base" onClick={() => void confirmarEntrega()}>
              Confirmar entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
