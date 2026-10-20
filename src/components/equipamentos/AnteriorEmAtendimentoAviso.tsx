import { Button } from "@/components/ui/button";
import { rotuloStatusEquipamento } from "@/pages/equipamentos/equipamento-anterior";
import type { Equipamento } from "@/types";

/** Cadastro novo: o equipamento anterior clicado ainda está em atendimento, então nada foi preenchido. */
export function AnteriorEmAtendimentoAviso({
  equipamento,
  onAbrirAtendimento,
}: {
  equipamento: Equipamento;
  onAbrirAtendimento: (equipamento: Equipamento) => void;
}) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400 bg-amber-100 p-3 text-sm text-amber-900">
      <p>
        Este equipamento ({equipamento.marca} {equipamento.modelo}, série …{equipamento.serial_number.slice(-4)}) ainda está em atendimento: <strong>{rotuloStatusEquipamento(equipamento.status)}</strong>. Os dados não foram preenchidos.
      </p>
      <Button type="button" size="sm" variant="outline" onClick={() => onAbrirAtendimento(equipamento)}>
        Abrir atendimento
      </Button>
    </div>
  );
}
