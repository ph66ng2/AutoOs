import { Button } from "@/components/ui/button";
import { visiblePaginationItems } from "@/lib/pagination";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label: string;
}

export function PaginationControls({ page, totalPages, onPageChange, label }: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className="flex justify-end pb-3" aria-label={label}>
      <div className="flex h-8 items-center gap-1">
        {visiblePaginationItems(totalPages, page).map((item) =>
          typeof item === "number" ? (
            <Button
              key={item}
              type="button"
              variant={item === page ? "secondary" : "ghost"}
              className="h-8 min-w-8 px-2 text-xs tabular-nums"
              aria-label={item === page ? `Página ${item}, atual` : `Ir para página ${item}`}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ) : (
            <span
              key={item}
              className="flex h-8 w-5 items-center justify-center text-xs text-muted-foreground"
              aria-hidden="true"
            >
              ...
            </span>
          ),
        )}
      </div>
    </nav>
  );
}
