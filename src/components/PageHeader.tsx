import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Cabeçalho de página da direção B: título de 26px, uma linha de apoio e as ações à direita. */
export function PageHeader({
  titulo,
  descricao,
  children,
  className,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  /** Ações da página (botões), alinhadas à direita. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
