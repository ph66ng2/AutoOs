import { formatDatePtBr } from "@/lib/date-utils";
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
  for (const servico of lerJson<ServicoNecessario>(verificacao.servicos_necessarios)) {
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
      });
    }
  }
  for (const peca of lerJson<PecaNecessaria>(verificacao.pecas_necessarias)) {
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
export function OrcamentoDaOs({ equipamento, verificacao }: { equipamento: Equipamento; verificacao: Verificacao | null }) {
  const linhas = linhasDoOrcamento(verificacao);
  if (equipamento.valor_orcamento == null && linhas.length === 0) {
    return <p className="text-sm text-muted-foreground">O orçamento ainda não foi elaborado. Os serviços e peças entram na verificação técnica.</p>;
  }
  const pagamento = verificacao?.forma_pagamento_codigo
    ? formaPagamentoRotulo(verificacao.forma_pagamento_codigo, verificacao.forma_pagamento_detalhe)
    : "Definida na aprovação";
  const horas = verificacao?.tempo_estimado ?? 0;

  return (
    <section aria-label="Orçamento">
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
                  <td className={cn("py-2 pr-3", linha.tipo === "Serviço" ? "font-semibold" : "pl-4")}>{linha.item}</td>
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
        <Condicao rotulo="Prazo de aprovação">{equipamento.prazo_aprovacao ? formatDatePtBr(equipamento.prazo_aprovacao) : "—"}</Condicao>
        {horas > 0 && <Condicao rotulo="Prazo de reparo">{horas === 1 ? "1 hora estimada" : `${horas} horas estimadas`}</Condicao>}
        {equipamento.valor_final != null && <Condicao rotulo="Valor final">{formatCurrency(equipamento.valor_final)}</Condicao>}
      </dl>
    </section>
  );
}
