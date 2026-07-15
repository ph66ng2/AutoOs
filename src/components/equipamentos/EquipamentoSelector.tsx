/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  EquipamentoSelector.tsx — Seletor de Equipamento com Busca ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Componente para buscar e selecionar equipamento no         ║
 * ║  componentes do sistema.                                     ║
 * ║                                                              ║
 * ║  MODOS DE OPERAÇÃO (type Modo):                              ║
 * ║  - "busca": campo de busca com dropdown de resultados       ║
 * ║  - "selecionado": card com dados do equipamento vinculado   ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - lib/db.ts (listarEquipamentos)                           ║
 * ║  - types/index.ts (Equipamento)                             ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/db";
import type { Equipamento } from "@/types";
import { EquipamentoSelectorBusca } from "@/components/equipamentos/EquipamentoSelectorBusca";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Printer, X } from "lucide-react";

/** Props do componente EquipamentoSelector */
interface EquipamentoSelectorProps {
  /** Equipamento já selecionado (para edição) */
  equipamentoInicial?: Equipamento | null;
  /** Callback quando um equipamento é selecionado */
  onEquipamentoSelecionado: (equipamento: Equipamento | null) => void;
  /** Modo somente leitura */
  readOnly?: boolean;
}

type Modo = "busca" | "selecionado";

/**
 * Componente de seleção de equipamento com busca e debounce.
 * 2 modos: busca + selecionado (sem criação inline).
 */
export function EquipamentoSelector({
  equipamentoInicial,
  onEquipamentoSelecionado,
  readOnly = false,
}: EquipamentoSelectorProps) {
  const [modo, setModo] = useState<Modo>(equipamentoInicial ? "selecionado" : "busca");
  const [equipamentoSelecionado, setEquipamentoSelecionado] = useState<Equipamento | null>(equipamentoInicial || null);

  const [termoBusca, setTermoBusca] = useState("");
  const [resultados, setResultados] = useState<Equipamento[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    if (!termoBusca || termoBusca.length < 2) {
      setResultados([]);
      setDropdownAberto(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setBuscando(true);
      try {
        const data = await db.listarEquipamentos(termoBusca);
        setResultados(data);
        setDropdownAberto(data.length > 0);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [termoBusca]);

  // Click-outside to close dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownAberto(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selecionarEquipamento(eq: Equipamento) {
    setEquipamentoSelecionado(eq);
    setModo("selecionado");
    setDropdownAberto(false);
    setTermoBusca("");
    onEquipamentoSelecionado(eq);
  }

  function removerEquipamento() {
    setEquipamentoSelecionado(null);
    setModo("busca");
    setTermoBusca("");
    onEquipamentoSelecionado(null);
  }

  // Mode: selected
  if (modo === "selecionado" && equipamentoSelecionado) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Printer className="h-4 w-4" />
          <h3 className="font-semibold text-sm">Equipamento</h3>
        </div>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3 min-w-0">
                <Printer className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm">
                    {equipamentoSelecionado.marca} {equipamentoSelecionado.modelo}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Serial: {equipamentoSelecionado.serial_number}
                  </p>
                  {equipamentoSelecionado.patrimonio && (
                    <p className="text-xs text-muted-foreground">
                      Patrimônio: {equipamentoSelecionado.patrimonio}
                    </p>
                  )}
                  {equipamentoSelecionado.cliente_nome && (
                    <p className="text-xs text-muted-foreground">
                      Cliente: {equipamentoSelecionado.cliente_nome}
                    </p>
                  )}
                </div>
              </div>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={removerEquipamento}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="mt-2">
              <Badge variant="outline" className="text-[10px]">
                {equipamentoSelecionado.tipo}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Mode: search
  return (
    <EquipamentoSelectorBusca
      dropdownRef={dropdownRef}
      termoBusca={termoBusca}
      setTermoBusca={setTermoBusca}
      buscando={buscando}
      dropdownAberto={dropdownAberto}
      setDropdownAberto={setDropdownAberto}
      resultados={resultados}
      onSelecionarEquipamento={selecionarEquipamento}
    />
  );
}
