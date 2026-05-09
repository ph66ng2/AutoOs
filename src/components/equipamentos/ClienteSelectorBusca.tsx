import {
  Building2,
  Loader2,
  Search,
  User,
  Plus,
} from "lucide-react";
import type { RefObject } from "react";
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
            onChange={(e) => setTermoBusca(e.target.value)}
            placeholder="Buscar cliente por nome, CPF/CNPJ, telefone ou email..."
            className="pl-9 pr-10"
            onFocus={() => resultados.length > 0 && setDropdownAberto(true)}
          />
          {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {dropdownAberto && resultados.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
            {resultados.map((c) => (
              <button
                key={c.id}
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-accent flex items-center justify-between gap-2 border-b last:border-b-0"
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

      <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={onAbrirNovoCliente}>
        <Plus className="h-4 w-4" /> Cadastrar Novo Cliente
      </Button>
    </div>
  );
}
