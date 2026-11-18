import { Button } from "@/components/ui/button";
import { formatDatePtBr, parseDbTimestampUtc } from "@/lib/date-utils";
import { normalizarServicosOrcamento, pecasParaOrcamento } from "@/lib/orcamento-estoque";
import { formaPagamentoRotulo } from "@/lib/orcamento-insumos";
import { cn, formatCurrency } from "@/lib/utils";
import type { Equipamento, PecaNecessaria, ServicoNecessario, Verificacao } from "@/types";

interface LinhaOrcamento {
  chave: string;
  item: string;
  tipo: "Serviço" | "Peça";
  quantidade: number;
  valor: number;
  reprovado: boolean;
  /** Chave da peça no consumo do orçamento (serviço + produto), para o selo "baixa pendente". */
  consumo?: string;
}

function lerJson<T>(texto?: string): T[] {
  if (!texto) return [];
  try {
    const valor = JSON.parse(texto);
    return Array.isArray(valor) ? valor : [];
  } catch {
    return [];
  }
}

/** Serviços (com as peças de cada um) e peças avulsas da verificação, na ordem em que foram lançados. */
export function linhasDoOrcamento(verificacao: Verificacao | null): LinhaOrcamento[] {
  if (!verificacao) return [];
  const reprovados = new Set((verificacao.decisoes_servicos ?? []).filter((d) => d.decisao === "REPROVADO").map((d) => d.servico_id));
  const linhas: LinhaOrcamento[] = [];
  const servicos = lerJson<ServicoNecessario>(verificacao.servicos_necessarios);
  // `pecas_necessarias` também guarda as peças dos serviços (pecasParaOrcamento): só as avulsas entram aqui.
  const vinculadas = new Set(pecasParaOrcamento(normalizarServicosOrcamento(servicos)).map((peca) => peca.id));
  for (const servico of servicos) {
    const reprovado = reprovados.has(servico.id);
    linhas.push({ chave: `s-${servico.id}`, item: servico.descricao, tipo: "Serviço", quantidade: 1, valor: servico.valor, reprovado });
    for (const peca of servico.pecas ?? []) {
      linhas.push({
        chave: `s-${servico.id}-p-${peca.produto_id}`,
        item: peca.nome,
        tipo: "Peça",
        quantidade: peca.quantidade,
        valor: peca.quantidade * peca.valor_unitario,
        reprovado,
        consumo: `${servico.id}:${peca.produto_id}`,
      });
    }
  }
  for (const peca of lerJson<PecaNecessaria>(verificacao.pecas_necessarias).filter((peca) => !vinculadas.has(peca.id))) {
    linhas.push({ chave: `p-${peca.id}`, item: peca.nome, tipo: "Peça", quantidade: peca.quantidade, valor: peca.valorTotal, reprovado: false });
  }
  return linhas;
}

function Condicao({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-semibold">{children}</dd>
    </div>
  );
}

/**
 * Aba Orçamento de Detalhes da OS (decisão 25): tabela de serviços e peças → total →
 * Condições, como o cartão Itens da venda. O total é o valor do orçamento gravado na OS.
 * Só entram condições que existem (sem custo de verificação inventado).
 */
/** "09/11 às 14:02", no fuso da operação. */
function diaEHora(valor: string): string | null {
  const data = parseDbTimestampUtc(valor);
  if (!data) return null;
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(data)
    .reduce<Record<string, string>>((acc, parte) => ({ ...acc, [parte.type]: parte.value }), {});
  return `${partes.day}/${partes.month} às ${partes.hour}:${partes.minute}`;
}

export function OrcamentoDaOs({
  equipamento,
  verificacao,
  enviadoEm,
  pendentes,
  onAlterar,
}: {
  equipamento: Equipamento;
  verificacao: Verificacao | null;
  /** Quando o orçamento saiu para o cliente (última comunicação de orçamento enviada). */
  enviadoEm?: string | null;
  /** Peças com baixa pendente, como "servicoId:produtoId". */
  pendentes?: Set<string>;
  /** Abre "Alterar Orçamento" (só quando a ação existe para o perfil e o status). */
  onAlterar?: () => void;
}) {
  const linhas = linhasDoOrcamento(verificacao);
  if (equipamento.valor_orcamento == null && linhas.length === 0) {
    return <p className="text-sm text-muted-foreground">O orçamento ainda não foi elaborado. Os serviços e peças entram na verificação técnica.</p>;
  }
  const pagamento = verificacao?.forma_pagamento_codigo
    ? formaPagamentoRotulo(verificacao.forma_pagamento_codigo, verificacao.forma_pagamento_detalhe)
    : "Definida na aprovação";
  const horas = verificacao?.tempo_estimado ?? 0;

  const enviado = enviadoEm ? diaEHora(enviadoEm) : null;

  return (
    <section aria-label="Orçamento">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">{enviado ? `Orçamento enviado em ${enviado}` : "Orçamento"}</h3>
          {equipamento.prazo_aprovacao && (
            <p className="text-xs text-muted-foreground">Prazo de aprovação: {formatDatePtBr(equipamento.prazo_aprovacao)}</p>
          )}
        </div>
        {onAlterar && <Button variant="outline" size="sm" onClick={onAlterar}>Alterar Orçamento</Button>}
      </div>
      {linhas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Item</th>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 text-right font-medium">Qtd.</th>
                <th className="py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {linhas.map((linha) => (
                <tr key={linha.chave} className={cn("h-12", linha.reprovado && "text-muted-foreground line-through")}>
                  <td className={cn("py-2 pr-3", linha.tipo === "Serviço" ? "font-semibold" : "pl-4")}>
                    {linha.item}
                    {linha.consumo && pendentes?.has(linha.consumo) && !linha.reprovado && (
                      <span className="ml-2 rounded-full bg-status-wait-bg px-2 py-0.5 text-[11px] font-semibold text-status-wait">baixa pendente</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{linha.reprovado ? `${linha.tipo} · reprovado` : linha.tipo}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{linha.quantidade}</td>
                  <td className="whitespace-nowrap py-2 text-right font-semibold tabular-nums">{formatCurrency(linha.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <dl className="ml-auto mt-3 grid max-w-xs grid-cols-[1fr_auto] items-baseline gap-x-6 border-t pt-2 text-sm">
        <dt className="font-bold">Total do orçamento</dt>
        <dd className="text-right text-xl font-extrabold tabular-nums">
          {equipamento.valor_orcamento != null ? formatCurrency(equipamento.valor_orcamento) : "—"}
        </dd>
      </dl>
      <h3 className="mt-5 text-xs font-semibold text-muted-foreground">Condições</h3>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Condicao rotulo="Pagamento">{pagamento}</Condicao>
        {horas > 0 && <Condicao rotulo="Prazo de reparo">{horas === 1 ? "1 hora estimada" : `${horas} horas estimadas`}</Condicao>}
        {equipamento.valor_final != null && <Condicao rotulo="Valor final">{formatCurrency(equipamento.valor_final)}</Condicao>}
      </dl>
    </section>
  );
}
