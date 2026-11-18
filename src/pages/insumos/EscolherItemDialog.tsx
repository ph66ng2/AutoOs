import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useInsumos } from "@/hooks/useInsumos";
import type { Produto } from "@/types";

/** "Movimentar estoque" do cabeçalho: escolhe o item antes de abrir a movimentação. */
export function EscolherItemDialog({
  open,
  onOpenChange,
  onEscolher,
}: {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  onEscolher: (produto: Produto) => void;
}) {
  const [busca, setBusca] = useState("");
  const { produtos, loading, recarregar } = useInsumos({ busca: busca || undefined, page: 1 });
  // O diálogo fica montado com a página; sem isto, a lista fica com o estoque da primeira carga.
  useEffect(() => {
    if (open) void recarregar();
  }, [open, recarregar]);

  return (
    <Dialog open={open} onOpenChange={(aberto) => { onOpenChange(aberto); if (!aberto) setBusca(""); }}>
      <DialogContent tamanho="m">
        <DialogHeader>
          <DialogTitle>Movimentar estoque</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            aria-label="Buscar item para movimentar"
            placeholder="Nome ou código do item"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <ul aria-label="Itens" aria-busy={loading} className="max-h-80 space-y-1 overflow-y-auto">
          {!loading && produtos.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">{busca ? `Nenhum item com "${busca}".` : "Nenhum item cadastrado."}</li>
          )}
          {produtos.map((produto) => (
            <li key={produto.id}>
              <button
                type="button"
                onClick={() => onEscolher(produto)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-rapida hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{produto.nome}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{produto.codigo}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{produto.quantidade_estoque} un</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
