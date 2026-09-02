import {
  Building2,
  Loader2,
  Search,
  User,
  Plus,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { nomeExibicaoCliente } from "@/components/clientes/cliente-display-utils";
import type { Cliente } from "@/types";
import { formatarDocumento, formatarTelefone } from "@/lib/validations";

export function ClienteSelectorBusca({
  dropdownRef,
  termoBusca,
  setTermoBusca,
  buscando,
  dropdownAberto,
  setDropdownAberto,
  resultados,
  onSelecionarCliente,
  onAbrirNovoCliente,
}: {
  dropdownRef: RefObject<HTMLDivElement>;
  termoBusca: string;
  setTermoBusca: (value: string) => void;
  buscando: boolean;
  dropdownAberto: boolean;
  setDropdownAberto: (value: boolean) => void;
  resultados: Cliente[];
  onSelecionarCliente: (c: Cliente) => void;
  onAbrirNovoCliente: () => void;
}) {
  const [indiceAtivo, setIndiceAtivo] = useState(-1);
  const opcoesRef = useRef<Array<HTMLButtonElement | null>>([]);
  const listaId = "cliente-selector-resultados";

  useEffect(() => {
    setIndiceAtivo(-1);
  }, [termoBusca, resultados]);

  useEffect(() => {
    if (indiceAtivo >= 0) {
      opcoesRef.current[indiceAtivo]?.scrollIntoView?.({ block: "nearest" });
    }
  }, [indiceAtivo]);

  function selecionarResultadoAtivo() {
    const indice = indiceAtivo >= 0 ? indiceAtivo : 0;
    const cliente = resultados[indice];
    if (cliente) onSelecionarCliente(cliente);
  }

  function navegarResultados(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setDropdownAberto(false);
      setIndiceAtivo(-1);
      return;
    }

    if (resultados.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setDropdownAberto(true);
      setIndiceAtivo((atual) => atual >= resultados.length - 1 ? 0 : atual + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setDropdownAberto(true);
      setIndiceAtivo((atual) => atual <= 0 ? resultados.length - 1 : atual - 1);
      return;
    }

    if (event.key === "Enter" && dropdownAberto) {
      event.preventDefault();
      selecionarResultadoAtivo();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <User className="h-4 w-4" />
        <h3 className="font-semibold text-sm">Dados do Cliente</h3>
      </div>
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={termoBusca}
            onChange={(e) => {
              setIndiceAtivo(-1);
              setTermoBusca(e.target.value);
            }}
            placeholder="Buscar cliente por nome, CPF/CNPJ, telefone ou email..."
            className="min-h-12 pl-10 pr-12 text-base"
            onFocus={() => resultados.length > 0 && setDropdownAberto(true)}
            onKeyDown={navegarResultados}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={dropdownAberto && resultados.length > 0 ? listaId : undefined}
            aria-activedescendant={indiceAtivo >= 0 ? `${listaId}-${resultados[indiceAtivo]?.id}` : undefined}
            aria-expanded={dropdownAberto}
          />
          {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {dropdownAberto && resultados.length > 0 && (
          <div id={listaId} role="listbox" className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
            {resultados.map((c, indice) => (
              <button
                ref={(element) => { opcoesRef.current[indice] = element; }}
                id={`${listaId}-${c.id}`}
                key={c.id}
                type="button"
                role="option"
                aria-selected={indice === indiceAtivo}
                className="flex min-h-12 w-full items-center justify-between gap-2 border-b px-4 py-3 text-left hover:bg-accent aria-selected:bg-accent last:border-b-0"
                onMouseEnter={() => setIndiceAtivo(indice)}
                onClick={() => onSelecionarCliente(c)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {c.tipo_pessoa === "PJ" ? (
                    <Building2 className="h-4 w-4 text-purple-600 shrink-0" />
                  ) : (
                    <User className="h-4 w-4 text-blue-600 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{nomeExibicaoCliente(c)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatarDocumento(c.documento || c.cpf_cnpj || "")}
                      {c.telefone ? ` • ${formatarTelefone(c.telefone)}` : ""}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {c.tipo_pessoa === "PJ" ? "PJ" : "PF"}
                </Badge>
              </button>
            ))}
          </div>
        )}

        {dropdownAberto && resultados.length === 0 && termoBusca.length >= 2 && !buscando && (
          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg p-3 text-center text-sm text-muted-foreground">
            Nenhum cliente encontrado
          </div>
        )}
      </div>

      <Button type="button" variant="outline" className="min-h-12 w-full gap-2 text-base" onClick={onAbrirNovoCliente}>
        <Plus className="h-4 w-4" /> Cadastrar Novo Cliente
      </Button>
    </div>
  );
}
