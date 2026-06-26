import {
  Loader2,
  Printer,
  Search,
} from "lucide-react";
import type { RefObject } from "react";
import { Input } from "@/components/ui/input";
import type { Equipamento } from "@/types";

export function EquipamentoSelectorBusca({
  dropdownRef,
  termoBusca,
  setTermoBusca,
  buscando,
  dropdownAberto,
  setDropdownAberto,
  resultados,
  onSelecionarEquipamento,
}: {
  dropdownRef: RefObject<HTMLDivElement>;
  termoBusca: string;
  setTermoBusca: (value: string) => void;
  buscando: boolean;
  dropdownAberto: boolean;
  setDropdownAberto: (value: boolean) => void;
  resultados: Equipamento[];
  onSelecionarEquipamento: (e: Equipamento) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Printer className="h-4 w-4" />
        <h3 className="font-semibold text-sm">Equipamento</h3>
      </div>
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            placeholder="Buscar equipamento por marca, modelo, serial ou patrimônio..."
            className="pl-9 pr-10"
            onFocus={() => resultados.length > 0 && setDropdownAberto(true)}
          />
          {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {dropdownAberto && resultados.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
            {resultados.map((eq) => (
              <button
                key={eq.id}
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 border-b last:border-b-0"
                onClick={() => onSelecionarEquipamento(eq)}
              >
                <Printer className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {eq.marca} {eq.modelo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {eq.serial_number}{eq.patrimonio ? ` • Pat: ${eq.patrimonio}` : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {dropdownAberto && resultados.length === 0 && termoBusca.length >= 2 && !buscando && (
          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg p-3 text-center text-sm text-muted-foreground">
            Nenhum equipamento encontrado
          </div>
        )}
      </div>
    </div>
  );
}
