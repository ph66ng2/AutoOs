import { visiblePaginationItems, ITEMS_PER_PAGE } from "@/lib/pagination";
import { cn } from "@/lib/utils";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label: string;
  /** Total de itens; com ele aparece "Mostrando X–Y de N" à esquerda. */
  totalItems?: number;
  pageSize?: number;
  className?: string;
}

export function PaginationControls({
  page,
  totalPages,
  onPageChange,
  label,
  totalItems,
  pageSize = ITEMS_PER_PAGE,
  className,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;
  const primeiro = (page - 1) * pageSize + 1;
  const ultimo = totalItems != null ? Math.min(page * pageSize, totalItems) : null;

  return (
    <nav className={cn("flex flex-wrap items-center gap-3 pb-3", totalItems != null ? "justify-between" : "justify-end", className)} aria-label={label}>
      {totalItems != null && ultimo != null && (
        <span className="text-[13px] text-muted-foreground tabular-nums">
          Mostrando {primeiro}–{ultimo} de {totalItems}
        </span>
      )}
      <ol className="flex min-h-11 min-w-0 max-w-full flex-wrap items-center gap-1 md:min-h-8">
        {visiblePaginationItems(totalPages, page).map((item) =>
          typeof item === "number" ? (
            <li key={item}>
              <button
                type="button"
                className={cn(
                  "h-11 min-w-11 rounded-lg px-2 text-[13px] md:h-8 md:min-w-8 font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  item === page ? "bg-acc-soft font-extrabold text-acc-soft-foreground" : "text-foreground hover:bg-muted",
                )}
                aria-label={item === page ? `Página ${item}, atual` : `Ir para página ${item}`}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPageChange(item)}
              >
                {item}
              </button>
            </li>
          ) : (
            <li
              key={item}
              className="flex h-11 w-5 items-center justify-center text-xs text-muted-foreground md:h-8"
              aria-hidden="true"
            >
              …
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}
