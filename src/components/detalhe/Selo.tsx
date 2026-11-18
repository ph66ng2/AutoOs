import { cn } from "@/lib/utils";

/**
 * Selo de situação do DS, o mesmo no cabeçalho de Detalhes da OS e da venda (decisão 25).
 * `classes` traz fundo e texto da família (ex.: STATUS_COLORS da OS, STATUS_ORCAMENTO_INSUMOS_COR da venda).
 */
export function Selo({ rotulo, classes, className }: { rotulo: string; classes: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", classes, className)}>
      <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full bg-current" />
      {rotulo}
    </span>
  );
}
