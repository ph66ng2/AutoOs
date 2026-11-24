import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Bloco cinza que ocupa o lugar do conteúdo enquanto ele carrega.
 * Decorativo: quem anuncia o carregamento é o `CarregandoSkeleton` em volta.
 * Com movimento reduzido (sistema ou Configurações › Geral) o pulso para.
 */
function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      data-skeleton=""
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

type CarregandoSkeletonProps = {
  /** Texto lido pelo leitor de tela, ex.: "Carregando equipamentos". */
  rotulo: string;
  className?: string;
  children: ReactNode;
};

/** Região de carregamento acessível: `role="status"` com o rótulo, e os skeletons dentro. */
function CarregandoSkeleton({ rotulo, className, children }: CarregandoSkeletonProps) {
  return (
    <div role="status" aria-label={rotulo} aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{rotulo}</span>
      {children}
    </div>
  );
}

const LARGURAS = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-2/5"];

/** Linhas de texto de larguras variadas. */
function SkeletonTexto({ linhas = 3, className }: { linhas?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: linhas }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", LARGURAS[i % LARGURAS.length])} />
      ))}
    </div>
  );
}

/** Lista de itens (avatar/ícone + duas linhas), para listas, painéis e menus. */
function SkeletonLista({ itens = 4, className, compacta = false }: { itens?: number; className?: string; compacta?: boolean }) {
  return (
    <ul aria-hidden="true" className={cn(compacta ? "space-y-2" : "space-y-3", className)}>
      {Array.from({ length: itens }, (_, i) => (
        <li key={i} className="flex items-center gap-3">
          {!compacta && <Skeleton className="h-9 w-9 shrink-0 rounded-full" />}
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={cn("h-4", LARGURAS[i % LARGURAS.length])} />
            {!compacta && <Skeleton className="h-3 w-1/3" />}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Tabela: cabeçalho e linhas com o número de colunas da tela. */
function SkeletonTabela({ linhas = 6, colunas = 5, className }: { linhas?: number; colunas?: number; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border", className)}>
      <div className="flex h-11 items-center gap-4 bg-muted/60 px-3">
        {Array.from({ length: colunas }, (_, c) => (
          <Skeleton key={c} className={cn("h-3 bg-muted-foreground/15", c === 0 ? "flex-[2]" : "flex-1")} />
        ))}
      </div>
      {Array.from({ length: linhas }, (_, l) => (
        <div key={l} className="flex h-14 items-center gap-4 border-t px-3">
          {Array.from({ length: colunas }, (_, c) => (
            <div key={c} className={cn("min-w-0", c === 0 ? "flex-[2] space-y-1.5" : "flex-1")}>
              <Skeleton className={cn("h-4", c === 0 ? LARGURAS[l % LARGURAS.length] : "w-3/4")} />
              {c === 0 && <Skeleton className="h-3 w-1/3" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Grade de cartões de indicador (título, número, rodapé). */
function SkeletonCartoes({ quantidade = 4, className }: { quantidade?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: quantidade }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border p-5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** Formulário: pares rótulo + campo. */
function SkeletonFormulario({ campos = 6, className }: { campos?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {Array.from({ length: campos }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Página inteira: título, subtítulo e um bloco de conteúdo. */
function SkeletonPagina({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {children ?? <SkeletonTabela />}
    </div>
  );
}

export {
  CarregandoSkeleton,
  Skeleton,
  SkeletonCartoes,
  SkeletonFormulario,
  SkeletonLista,
  SkeletonPagina,
  SkeletonTabela,
  SkeletonTexto,
};
