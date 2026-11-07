import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValorDecimalInput } from "@/components/ui/valor-decimal-input";
import { formatCurrency, formatCurrencyOrMissing } from "@/lib/utils";
import type { EquipamentoId, ServicoCatalogo, ServicoNecessario } from "@/types";
import { PecasDoServico } from "@/components/equipamentos/PecasDoServico";

interface AjusteOrcamentoServicosProps {
  servicos: ServicoNecessario[];
  catalogo: ServicoCatalogo<EquipamentoId>[];
  carregandoCatalogo?: boolean;
  onChange: (servicos: ServicoNecessario[]) => void;
  onRemoverTodos?: () => void;
  saasMode?: boolean;
  /** false enquanto algum preço de serviço ou de peça estiver com texto inválido. */
  onPecasValidityChange?: (valido: boolean) => void;
}

export function AjusteOrcamentoServicos({
  servicos,
  catalogo,
  carregandoCatalogo = false,
  onChange,
  onRemoverTodos,
  saasMode = false,
  onPecasValidityChange,
}: AjusteOrcamentoServicosProps) {
  const [linhaSugestaoAberta, setLinhaSugestaoAberta] = useState<string | null>(null);
  const [pecasInvalidasPorServico, setPecasInvalidasPorServico] = useState<Record<string, boolean>>({});
  const [valoresInvalidosPorServico, setValoresInvalidosPorServico] = useState<Record<string, boolean>>({});
  const validadeRef = useRef(onPecasValidityChange);
  validadeRef.current = onPecasValidityChange;
  const algumaInvalida = servicos.some((s) => pecasInvalidasPorServico[s.id] || valoresInvalidosPorServico[s.id]);
  useEffect(() => {
    validadeRef.current?.(!algumaInvalida);
  }, [algumaInvalida]);
  useEffect(() => () => validadeRef.current?.(true), []);

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

  function selecionarServicoCatalogo(servicoId: string, item: ServicoCatalogo<EquipamentoId>) {
    atualizarServico(servicoId, {
      descricao: item.nome,
      catalogo_id: item.id,
      valor: Number(item.preco_padrao) || 0,
      pecas: item.pecas_sugeridas ?? [],
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
          <div key={s.id} className="min-w-0 rounded-md border p-2">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.25rem] gap-2">
            <div className="relative col-span-2 min-w-0">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nome do serviço"
                title={s.descricao || undefined}
                value={s.descricao}
                onFocus={() => setLinhaSugestaoAberta(s.id)}
                onBlur={() => window.setTimeout(() => setLinhaSugestaoAberta(null), 120)}
                onChange={(e) => {
                  atualizarServico(s.id, { descricao: e.target.value, catalogo_id: undefined });
                  setLinhaSugestaoAberta(s.id);
                }}
                className="w-full min-w-0 pl-8 text-sm"
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
                          — {formatCurrencyOrMissing(Number(item.preco_padrao))}
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
            <ValorDecimalInput
              min={0}
              placeholder="Valor"
              aria-label="Valor do serviço"
              value={Number(s.valor) || 0}
              onValueChange={(valor) => atualizarServico(s.id, { valor })}
              onValidityChange={(valido) => setValoresInvalidosPorServico((atual) => (atual[s.id] === !valido ? atual : { ...atual, [s.id]: !valido }))}
              className="col-start-1 w-full min-w-0 text-sm"
            />
            <Button
              variant="ghost"
              size="icon"
              className="col-start-2 row-start-2 h-9 w-9 shrink-0"
              onClick={() => removerServico(s.id)}
              aria-label="Remover serviço"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
          <PecasDoServico pecas={s.pecas ?? []} saasMode={saasMode} onChange={(pecas) => atualizarServico(s.id, { pecas })} onValidityChange={(valido) => setPecasInvalidasPorServico((atual) => (atual[s.id] === !valido ? atual : { ...atual, [s.id]: !valido }))} />
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
          <span>{formatCurrency(total)}</span>
        </div>
      )}
    </div>
  );
}
