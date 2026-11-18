import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionPriorityRow } from "@/components/ui/action-priority-row";
import { BarraEtapas, type EtapaDaBarra } from "@/components/detalhe/BarraEtapas";
import { CartaoCliente } from "@/components/detalhe/CartaoCliente";
import { LinhaDoTempoSimples } from "@/components/detalhe/LinhaDoTempo";
import { Selo } from "@/components/detalhe/Selo";
import { menuVenda } from "@/components/vendas/menu-venda";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { useVendaInsumos } from "@/hooks/useVendaInsumos";
import { parseTimestampPostgres, todayLocalIsoDate } from "@/lib/date-utils";
import {
  formaPagamentoRotulo,
  orcamentoInsumosVencido,
  proximaAcaoVenda,
  STATUS_ORCAMENTO_INSUMOS_COR,
  STATUS_ORCAMENTO_INSUMOS_LABEL,
} from "@/lib/orcamento-insumos";
import type { StatusFamilia } from "@/lib/status-familia";
import { cn, formatCurrency } from "@/lib/utils";
import { AcaoVendaDialog } from "@/components/vendas/AcaoVendaDialog";
import type { AcaoInicialOrcamentoInsumos } from "@/hooks/useOrcamentoInsumosEditor";
import { SENSITIVE_PERMISSIONS, type OrcamentoInsumosDetalhe, type StatusOrcamentoInsumos } from "@/types";

const FUSO = { timeZone: "America/Bahia" } as const;

function instante(valor?: string | null): Date | null {
  if (!valor) return null;
  const data = parseTimestampPostgres(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

/** "09/11" de um instante ou de uma data AAAA-MM-DD. */
function diaMes(valor?: string | null): string {
  const soData = valor?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soData) return `${soData[3]}/${soData[2]}`;
  const data = instante(valor);
  return data ? data.toLocaleDateString("pt-BR", { ...FUSO, day: "2-digit", month: "2-digit" }) : "";
}

function dataHora(valor?: string | null): string {
  const data = instante(valor);
  if (!data) return "—";
  return `${diaMes(valor)} ${data.toLocaleTimeString("pt-BR", { ...FUSO, hour: "2-digit", minute: "2-digit" })}`;
}

function diasAte(validade: string, hoje: string): number {
  const [a, b] = [new Date(`${validade}T00:00:00`), new Date(`${hoje}T00:00:00`)];
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

function SeloVenda({ status, vencido }: { status: StatusOrcamentoInsumos; vencido: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Selo rotulo={STATUS_ORCAMENTO_INSUMOS_LABEL[status]} classes={STATUS_ORCAMENTO_INSUMOS_COR[status]} />
      {vencido && <Selo rotulo="Vencido" classes="bg-status-bad-bg text-status-bad" />}
    </span>
  );
}

/**
 * Quatro etapas: Rascunho, Enviado, Aprovado, Entregue. Reprovado ocupa o lugar de
 * Aprovado; Cancelado para na etapa seguinte à última alcançada, sem data, porque o
 * banco não guarda quando foi cancelado (decisão 23).
 */
function etapasDaVenda(venda: OrcamentoInsumosDetalhe, vencido: boolean): EtapaDaBarra[] {
  const datas = [venda.criado_em, venda.enviado_em, venda.decidido_em, venda.entregue_em];
  const rotulos = ["Rascunho", "Enviado", "Aprovado", "Entregue"];
  let atual = 0;
  let cor = "bg-status-neutral";
  switch (venda.status) {
    case "RASCUNHO":
      atual = 0;
      cor = vencido ? "bg-status-bad" : "bg-status-neutral";
      break;
    case "ENVIADO":
      atual = 1;
      cor = vencido ? "bg-status-bad" : "bg-status-wait";
      break;
    case "APROVADO":
      atual = 2;
      cor = "bg-status-ok";
      break;
    case "REPROVADO":
      atual = 2;
      rotulos[2] = "Reprovado";
      cor = "bg-status-bad";
      break;
    case "ENTREGUE":
      atual = 3;
      cor = "bg-primary";
      break;
    case "CANCELADO": {
      // Aprovado e depois cancelado tem data de decisão; enviado tem data de envio.
      const ultima = venda.decidido_em ? 2 : venda.enviado_em ? 1 : 0;
      atual = Math.min(ultima + 1, 3);
      rotulos[atual] = "Cancelado";
      datas[atual] = null;
      cor = "bg-status-neutral";
      break;
    }
  }
  return rotulos.map((rotulo, indice) => ({
    rotulo,
    detalhe: indice <= atual ? diaMes(datas[indice]) : "",
    estado: indice < atual ? "feita" : indice === atual ? "atual" : "futura",
    cor: indice === atual ? cor : undefined,
  }));
}

const BOTAO_ENTRADA = "h-9 shrink-0 bg-acc-soft font-semibold text-acc-soft-foreground hover:bg-acc-soft/70 hover:text-acc-soft-foreground";

function textoFalta(item: OrcamentoInsumosDetalhe["itens"][number]): string {
  return `${item.descricao}: precisa de ${item.quantidade}, há ${Math.max(item.saldo_estoque ?? 0, 0)}`;
}

function Cartao({ titulo, acao, children, className }: { titulo?: string; acao?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5", className)}>
      {titulo && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-bold">{titulo}</h2>
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

function Condicao({ rotulo, destaque, children }: { rotulo: string; destaque?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className={cn("text-sm font-semibold", destaque && "text-status-bad")}>{children}</dd>
    </div>
  );
}

/**
 * O que aconteceu na venda (decisão 25): as mesmas datas do antigo "Registro", sem
 * "Registrado por" (não existe). Cancelado não tem data própria no banco: não entra.
 */
function eventosDaVenda(venda: OrcamentoInsumosDetalhe): { titulo: string; data: string; familia: StatusFamilia }[] {
  const eventos: { titulo: string; data: string; familia: StatusFamilia }[] = [];
  const empurrar = (titulo: string, valor: string | null | undefined, familia: StatusFamilia) => {
    if (instante(valor)) eventos.push({ titulo, data: dataHora(valor), familia });
  };
  empurrar("Criado", venda.criado_em, "neutral");
  empurrar("Enviado", venda.enviado_em, "wait");
  // Decidido e depois cancelado foi aprovado antes de cancelar.
  empurrar(venda.status === "REPROVADO" ? "Reprovado" : "Aprovado", venda.decidido_em, venda.status === "REPROVADO" ? "bad" : "ok");
  empurrar("Entregue", venda.entregue_em, "ok");
  return eventos;
}

/** Página do orçamento de insumos (OI-n): leitura e ações, como na prancheta "Orçamento como página". */
export default function VendaDetalhe() {
  const navigate = useNavigate();
  const { id } = useParams();
  const vendaId = id && /^\d+$/.test(id) ? Number(id) : null;
  const { venda, loading, error, recarregar } = useVendaInsumos(vendaId);
  const { hasPermission } = useSensitiveAccess();
  const podeAgir = hasPermission(SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS);
  const [acao, setAcao] = useState<AcaoInicialOrcamentoInsumos | null>(null);
  /** Número do orçamento excluído: depois de excluir, recarregar dá "não encontrado". */
  const [excluido, setExcluido] = useState<string | null>(null);

  function abrir(nova: AcaoInicialOrcamentoInsumos) {
    // Editar e renovar a validade são o formulário em página (V.4).
    if (nova === "editar" || nova === "renovar") {
      navigate(`/vendas/${vendaId}/editar${nova === "renovar" ? "?foco=validade" : ""}`);
      return;
    }
    setAcao(nova);
  }

  const voltar = (
    <button
      type="button"
      onClick={() => navigate("/vendas")}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors duration-rapida hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Vendas de insumos
    </button>
  );

  if (excluido) {
    return (
      <div className="space-y-4">
        {voltar}
        <p role="status" className="rounded-xl bg-muted px-4 py-3 text-sm">O orçamento {excluido} foi excluído.</p>
      </div>
    );
  }
  if (loading && !venda) {
    return (
      <div className="space-y-4">
        {voltar}
        <p className="text-muted-foreground">Carregando orçamento...</p>
      </div>
    );
  }
  if (error || !venda) {
    return (
      <div className="space-y-4">
        {voltar}
        <p role="alert" className="rounded-xl border border-status-bad/30 bg-status-bad-bg px-4 py-3 text-sm text-status-bad">
          {error ?? "Orçamento não encontrado."}
        </p>
      </div>
    );
  }

  const hoje = todayLocalIsoDate();
  const vencido = orcamentoInsumosVencido(venda, hoje);
  const aberto = venda.status === "RASCUNHO" || venda.status === "ENVIADO";
  const etapas = etapasDaVenda(venda, vencido);
  const faltas = aberto
    ? venda.itens.filter((item) => item.saldo_estoque != null && item.saldo_estoque < item.quantidade)
    : [];

  /** Leva à entrada do item em Insumos, já com a quantidade que falta; depois de salvar, volta para cá. */
  function darEntrada(item: OrcamentoInsumosDetalhe["itens"][number]) {
    const falta = item.quantidade - Math.max(item.saldo_estoque ?? 0, 0);
    const voltar = encodeURIComponent(`/vendas/${venda!.id}`);
    navigate(`/insumos?entrada=${item.produto_id}&quantidade=${falta}&voltar=${voltar}`);
  }

  // Ação principal: a da lista; nos finais, PDF; no cancelado, excluir de vez.
  let principal: { rotulo: string; acao: AcaoInicialOrcamentoInsumos; destrutiva?: boolean; contorno?: boolean };
  if (!podeAgir) principal = { rotulo: "Ver PDF", acao: "pdf", contorno: true };
  else if (venda.status === "CANCELADO") principal = { rotulo: "Excluir de vez", acao: "excluir", destrutiva: true };
  else if (venda.status === "ENTREGUE" || venda.status === "REPROVADO") principal = { rotulo: "Gerar PDF", acao: "pdf", contorno: true };
  else {
    const proxima = proximaAcaoVenda(venda.status, vencido);
    const mapa: Record<string, AcaoInicialOrcamentoInsumos> = { enviar: "email", aprovar: "aprovar", renovar: "renovar", entregar: "entregar" };
    principal = { rotulo: proxima.rotulo, acao: mapa[proxima.tipo] ?? "pdf" };
  }
  const menu = podeAgir ? menuVenda(venda.id, venda.status, principal.acao, abrir) : [];

  const validadeTexto = (() => {
    if (!aberto) return venda.status === "APROVADO" || venda.status === "ENTREGUE" ? "não se aplica depois da aprovação" : "—";
    if (!venda.validade) return "sem validade";
    const dias = diasAte(venda.validade, hoje);
    if (dias < 0) return `venceu ${diaMes(venda.validade)}`;
    if (dias === 0) return `vence ${diaMes(venda.validade)} · vence hoje`;
    return `vence ${diaMes(venda.validade)} · ${dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`}`;
  })();
  const pagamento = venda.forma_pagamento_codigo
    ? formaPagamentoRotulo(venda.forma_pagamento_codigo, venda.forma_pagamento_detalhe)
    : "Definida na aprovação";

  return (
    <div className="space-y-4">
      {voltar}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="font-mono text-[26px] font-bold leading-tight">{venda.numero_exibicao}</h1>
          <SeloVenda status={venda.status} vencido={vencido} />
          <span className="truncate text-muted-foreground">{venda.cliente_nome}</span>
        </div>
        {menu.length > 0 || !principal.contorno || principal.destrutiva ? (
          <ActionPriorityRow
            acaoDaLinha
            destaque
            menuTitulo={`${venda.numero_exibicao} · ${venda.cliente_nome ?? ""}`}
            primary={{
              id: `principal-${venda.id}`,
              label: principal.rotulo,
              onClick: () => abrir(principal.acao),
              variant: principal.destrutiva || principal.contorno ? "outline" : "default",
              className: principal.destrutiva ? "border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive" : undefined,
            }}
            overflow={menu}
          />
        ) : (
          <Button variant="outline" className="h-10" onClick={() => abrir(principal.acao)}>
            {principal.rotulo}
          </Button>
        )}
      </div>

      <section aria-label="Etapas do orçamento" className="rounded-2xl border bg-card px-5 py-4">
        <BarraEtapas rotulo="Andamento do orçamento" etapas={etapas} />
      </section>

      {/* As duas colunas terminam na mesma linha: o último cartão de cada uma estica. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {!podeAgir && (
            <p className="flex items-start gap-2 rounded-xl bg-muted px-4 py-3 text-sm">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Só leitura. Para editar, enviar ou decidir este orçamento, troque para um perfil com <strong>Ações financeiras</strong>. A prévia do PDF continua disponível.
              </span>
            </p>
          )}
          {aberto && vencido && (
            <div role="alert" className="rounded-xl border border-status-bad/30 bg-status-bad-bg px-4 py-3 text-sm text-status-bad">
              <p className="font-semibold">Orçamento vencido</p>
              <p>A validade passou em {diaMes(venda.validade)}. Para aprovar, mude a validade, salve e envie de novo ao cliente.</p>
            </div>
          )}
          {venda.status === "APROVADO" && (
            <p className="rounded-xl border border-status-ok/30 bg-status-ok-bg px-4 py-3 text-sm text-status-ok">
              Aprovado em {diaMes(venda.decidido_em)}
              {venda.forma_pagamento_codigo ? ` com pagamento ${formaPagamentoRotulo(venda.forma_pagamento_codigo)}` : ""}. Os itens já saíram do estoque.
            </p>
          )}
          {venda.status === "CANCELADO" && (
            <p className="rounded-xl bg-muted px-4 py-3 text-sm">
              {venda.decidido_em ? "Cancelado depois de aprovado: os itens voltaram ao estoque. " : "Cancelado. "}
              Só dá para ver, gerar o PDF ou excluir de vez.
            </p>
          )}
          {faltas.length > 0 && !vencido && (
            <div className="space-y-3 rounded-xl border border-status-wait/30 bg-status-wait-bg px-4 py-3 text-sm text-status-wait">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">Falta estoque para aprovar</p>
                  <p>
                    {faltas.length === 1 ? `${textoFalta(faltas[0])}. ` : ""}
                    A aprovação baixa tudo de uma vez e será recusada assim.
                  </p>
                </div>
                {podeAgir && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {faltas.length === 1 && (
                      <Button variant="ghost" size="sm" className={BOTAO_ENTRADA} onClick={() => darEntrada(faltas[0])}>
                        Dar entrada no estoque
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-9 bg-card" onClick={() => abrir("editar")}>
                      Editar quantidades
                    </Button>
                  </div>
                )}
              </div>
              {faltas.length > 1 && (
                <ul className="divide-y divide-status-wait/20 border-t border-status-wait/20">
                  {faltas.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                      <span>{textoFalta(item)}</span>
                      {podeAgir && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={BOTAO_ENTRADA}
                          aria-label={`Dar entrada no estoque: ${item.descricao}`}
                          onClick={() => darEntrada(item)}
                        >
                          Dar entrada
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Cartao
            titulo="Itens"
            className={venda.observacoes ? undefined : "flex-1"}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="py-2 pr-3 font-medium">Categoria</th>
                    <th className="py-2 pr-3 text-right font-medium">Qtd.</th>
                    <th className="py-2 pr-3 text-right font-medium">Unitário</th>
                    <th className="py-2 pr-3 text-right font-medium">Total</th>
                    {aberto && <th className="py-2 text-right font-medium">Saldo agora</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {venda.itens.map((item) => {
                    const saldo = item.saldo_estoque;
                    const falta = saldo != null && saldo < item.quantidade ? item.quantidade - Math.max(saldo, 0) : 0;
                    return (
                      <tr key={item.id} className="h-12">
                        <td className="py-2 pr-3 font-semibold">{item.descricao}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{item.categoria.toLowerCase()}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{item.quantidade}</td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{formatCurrency(item.valor_unitario)}</td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right font-semibold tabular-nums">{formatCurrency(item.valor_total)}</td>
                        {aberto && (
                          <td className={cn("whitespace-nowrap py-2 text-right tabular-nums", falta > 0 ? "font-semibold text-status-wait" : "text-muted-foreground")}>
                            {saldo == null ? "—" : falta > 0 ? `${saldo} · falta ${falta}` : saldo}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto mt-3 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="text-right tabular-nums">{formatCurrency(venda.valor_subtotal)}</dd>
              <dt className="text-muted-foreground">Desconto</dt>
              <dd className="text-right tabular-nums">− {formatCurrency(venda.desconto)}</dd>
              <dt className="border-t pt-2 font-bold">Total</dt>
              <dd className="border-t pt-2 text-right text-xl font-extrabold tabular-nums">{formatCurrency(venda.valor_total)}</dd>
            </dl>
            <h3 className="mt-5 text-xs font-semibold text-muted-foreground">Condições</h3>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
              <Condicao rotulo="Validade" destaque={aberto && vencido}>{validadeTexto}</Condicao>
              <Condicao rotulo="Pagamento">{pagamento}</Condicao>
            </dl>
          </Cartao>

          {venda.observacoes && (
            <Cartao titulo="Observações" className="flex-1">
              <p className="text-sm">{venda.observacoes}</p>
            </Cartao>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <CartaoCliente
            dados={{
              nome: venda.cliente_nome,
              documento: venda.cliente_documento,
              email: venda.cliente_email,
              telefone: venda.cliente_telefone,
              recebeEmail: venda.cliente_receber_email,
              recebeWhatsapp: venda.cliente_receber_whatsapp,
              contato: venda.contato_nome
                ? { nome: venda.contato_nome, papel: "Quem recebe o orçamento", email: venda.contato_email, telefone: venda.contato_telefone }
                : null,
            }}
          />

          <Cartao titulo="Histórico" className="flex-1">
            <LinhaDoTempoSimples eventos={eventosDaVenda(venda)} />
          </Cartao>
        </div>
      </div>

      <AcaoVendaDialog
        acao={acao}
        vendaId={venda.id}
        venda={venda}
        voltarPara={`/vendas/${venda.id}`}
        onFechar={() => setAcao(null)}
        onAlterado={() => void recarregar()}
        onExcluido={setExcluido}
      />
    </div>
  );
}
