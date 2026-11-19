import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useBuscaGlobal, type ResultadoBusca, type TelaBuscavel } from "@/hooks/useBuscaGlobal";

/**
 * Ctrl+K: uma caixa só para achar OS, cliente, insumo ou tela. Setas escolhem, Enter abre.
 */
export function BuscaGlobal({ aberta, onAbertaChange, telas }: { aberta: boolean; onAbertaChange: (aberta: boolean) => void; telas: TelaBuscavel[] }) {
  const navigate = useNavigate();
  const [termo, setTermo] = useState("");
  const [ativo, setAtivo] = useState(0);
  const { resultados, buscando } = useBuscaGlobal(aberta ? termo : "", telas);
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => { if (!aberta) setTermo(""); }, [aberta]);
  useEffect(() => { setAtivo(0); }, [resultados]);
  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-indice="${ativo}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [ativo]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, { item: ResultadoBusca; indice: number }[]>();
    resultados.forEach((item, indice) => mapa.set(item.grupo, [...(mapa.get(item.grupo) ?? []), { item, indice }]));
    return [...mapa.entries()];
  }, [resultados]);

  const abrir = (item: ResultadoBusca | undefined) => {
    if (!item) return;
    onAbertaChange(false);
    navigate(item.destino.path, item.destino.state ? { state: item.destino.state } : undefined);
  };

  const curto = termo.trim().length < 2;
  const vazio = !buscando && resultados.length === 0;

  return (
    <Dialog open={aberta} onOpenChange={onAbertaChange}>
      <DialogContent tamanho="m" className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-top-0 [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">Buscar no sistema</DialogTitle>
        <DialogDescription className="sr-only">Equipamentos, clientes, insumos e telas. Setas para escolher, Enter para abrir.</DialogDescription>
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            role="combobox"
            aria-expanded={resultados.length > 0}
            aria-controls="busca-global-lista"
            aria-activedescendant={resultados[ativo] ? `busca-global-${ativo}` : undefined}
            aria-label="Buscar equipamento, cliente, insumo ou tela"
            placeholder="Série, cliente, CPF/CNPJ, insumo ou tela"
            value={termo}
            onChange={(event) => setTermo(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setAtivo((i) => Math.min(i + 1, resultados.length - 1)); }
              else if (event.key === "ArrowUp") { event.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)); }
              else if (event.key === "Enter") { event.preventDefault(); abrir(resultados[ativo]); }
            }}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          {buscando && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Buscando" />}
          <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 text-[11px] font-medium text-muted-foreground sm:inline">Esc</kbd>
        </div>
        <ul id="busca-global-lista" role="listbox" ref={lista} aria-label="Resultados" className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
          {grupos.map(([grupo, itens]) => (
            <li key={grupo} role="presentation">
              <p className="px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground">{grupo}</p>
              <ul role="group" aria-label={grupo}>
                {itens.map(({ item, indice }) => (
                  <li
                    key={item.chave}
                    id={`busca-global-${indice}`}
                    data-indice={indice}
                    role="option"
                    aria-selected={indice === ativo}
                    onMouseMove={() => setAtivo(indice)}
                    onClick={() => abrir(item)}
                    className={cn("flex cursor-pointer flex-col rounded-lg px-3 py-2", indice === ativo ? "bg-muted" : "")}
                  >
                    <span className="truncate text-sm font-semibold">{item.titulo}</span>
                    {item.detalhe && <span className="truncate text-xs text-muted-foreground">{item.detalhe}</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {vazio && (
            <li role="presentation" className="px-3 py-6 text-center text-sm text-muted-foreground">
              {curto ? "Digite ao menos 2 letras para buscar equipamentos, clientes e insumos." : "Nada encontrado."}
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
