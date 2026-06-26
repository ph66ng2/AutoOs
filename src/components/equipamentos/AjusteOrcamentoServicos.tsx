import { useState } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ServicoCatalogo, ServicoNecessario } from "@/types";

interface AjusteOrcamentoServicosProps {
  servicos: ServicoNecessario[];
  catalogo: ServicoCatalogo[];
  carregandoCatalogo?: boolean;
  onChange: (servicos: ServicoNecessario[]) => void;
  onRemoverTodos?: () => void;
}

export function AjusteOrcamentoServicos({
  servicos,
  catalogo,
  carregandoCatalogo = false,
  onChange,
  onRemoverTodos,
}: AjusteOrcamentoServicosProps) {
  const [linhaSugestaoAberta, setLinhaSugestaoAberta] = useState<string | null>(null);

  function adicionarServico() {
    const novo: ServicoNecessario = {
      id: crypto.randomUUID(),
      descricao: "",
      valor: 0,
    };
    onChange([...servicos, novo]);
  }

  function removerServico(id: string) {
    if (servicos.length === 1 && onRemoverTodos) {
      onRemoverTodos();
      return;
    }
    onChange(servicos.filter((s) => s.id !== id));
  }

  function atualizarServico(id: string, patch: Partial<ServicoNecessario>) {
    onChange(servicos.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function selecionarServicoCatalogo(servicoId: string, item: ServicoCatalogo) {
    atualizarServico(servicoId, {
      descricao: item.nome,
      catalogo_id: item.id,
      valor: Number(item.preco_padrao) || 0,
    });
  }

  const total = servicos.reduce((sum, s) => sum + (Number(s.valor) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">Serviços</p>
        <Button type="button" variant="outline" size="sm" onClick={adicionarServico}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Adicionar Serviço
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Digite para buscar no catálogo e selecionar o serviço pré-cadastrado com preço automático.
      </p>
      <div className="space-y-2">
        {servicos.map((s) => (
          <div key={s.id} className="flex gap-2 items-start">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nome do serviço"
                value={s.descricao}
                onFocus={() => setLinhaSugestaoAberta(s.id)}
                onBlur={() => window.setTimeout(() => setLinhaSugestaoAberta(null), 120)}
                onChange={(e) => {
                  atualizarServico(s.id, { descricao: e.target.value, catalogo_id: undefined });
                  setLinhaSugestaoAberta(s.id);
                }}
                className="pl-8 text-sm"
              />
              {linhaSugestaoAberta === s.id && (
                <div className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-md border bg-popover shadow">
                  {catalogo
                    .filter((item) =>
                      item.nome.toLowerCase().includes((s.descricao || "").toLowerCase()),
                    )
                    .slice(0, 8)
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selecionarServicoCatalogo(s.id, item)}
                      >
                        <span className="font-medium">{item.nome}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          — R$ {Number(item.preco_padrao || 0).toFixed(2)}
                        </span>
                      </button>
                    ))}
                  {!carregandoCatalogo &&
                    catalogo.filter((item) =>
                      item.nome.toLowerCase().includes((s.descricao || "").toLowerCase()),
                    ).length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Nenhum serviço pré-cadastrado encontrado.
                      </div>
                    )}
                </div>
              )}
            </div>
            <Input
              type="number"
              min={0.01}
              step="0.01"
              placeholder="Valor"
              value={Number.isFinite(Number(s.valor)) ? Number(s.valor) : ""}
              onChange={(e) => atualizarServico(s.id, { valor: Number(e.target.value) })}
              className="w-28 text-sm"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => removerServico(s.id)}
              aria-label="Remover serviço"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ))}
        {servicos.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-3">
            Nenhum serviço adicionado.
          </p>
        )}
      </div>
      {servicos.length > 0 && (
        <div className="flex justify-between text-sm font-medium pt-1 border-t">
          <span>Total serviços</span>
          <span>R$ {total.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
