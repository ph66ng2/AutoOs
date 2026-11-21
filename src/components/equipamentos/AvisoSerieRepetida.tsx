import { useState } from "react";
import { Check, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Equipamento } from "@/types";
import { formatDatePtBr } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/pages/equipamentos/EquipamentosStatusBadge";
import {
  atendimentoEncerrado,
  retornoNaGarantia,
  rotuloStatusEquipamento,
  ultimaPassagem,
} from "@/pages/equipamentos/equipamento-anterior";

/**
 * Série que já passou pela assistência, na Nova entrada. Não é alerta: é uma linha que pergunta
 * se é mesmo uma nova manutenção. Enquanto ninguém responde, o cadastro fica travado.
 *
 * - Última passagem encerrada: "Sim, nova manutenção" (preenche só o que está vazio).
 * - Ainda em atendimento: "Abrir OS #n" e, menor, "Começar outra mesmo assim".
 */
export function AvisoSerieRepetida({
  registros,
  confirmado,
  garantiaDias,
  hojeIso,
  onNovaManutencao,
  onAbrir,
}: {
  registros: Equipamento[];
  confirmado: boolean;
  garantiaDias: number | null;
  hojeIso: string;
  onNovaManutencao: (ultima: Equipamento) => void;
  onAbrir: (equipamento: Equipamento) => void;
}) {
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const ultima = ultimaPassagem(registros);
  if (!ultima) return null;
  const vezes = registros.length === 1 ? "1 vez" : `${registros.length} vezes`;
  const emAtendimento = !atendimentoEncerrado(ultima);
  const garantia = retornoNaGarantia(ultima, garantiaDias, hojeIso);
  const quando = ultima.status === "ENTREGUE" && ultima.data_saida
    ? `entregue em ${formatDatePtBr(ultima.data_saida)}`
    : `${rotuloStatusEquipamento(ultima.status).toLowerCase()} desde ${formatDatePtBr(ultima.data_entrada)}`;

  return (
    <section
      aria-label="Passagens anteriores desta série"
      className="rounded-xl border border-l-[3px] border-l-primary bg-muted/40 px-4 py-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 basis-80">
          {confirmado ? (
            <>
              <Check className="mr-1.5 inline h-4 w-4 align-[-3px] text-status-ok" aria-hidden="true" />
              <span className="font-semibold">Nova manutenção desta impressora.</span>{" "}
              <span className="text-muted-foreground">Já veio {vezes}; a última foi a OS #{ultima.id}.</span>
            </>
          ) : emAtendimento ? (
            <>
              <History className="mr-1.5 inline h-4 w-4 align-[-3px] text-primary" aria-hidden="true" />
              <span className="font-semibold">Essa impressora ainda está em atendimento</span>{" "}
              <span className="text-muted-foreground">na OS #{ultima.id} ({rotuloStatusEquipamento(ultima.status).toLowerCase()}).</span>
            </>
          ) : (
            <>
              <History className="mr-1.5 inline h-4 w-4 align-[-3px] text-primary" aria-hidden="true" />
              <span className="font-semibold">Essa impressora já passou por aqui</span>{" "}
              <span className="text-muted-foreground">({vezes} · última: OS #{ultima.id}, {quando}).</span>{" "}
              Vai começar uma nova manutenção nela?
            </>
          )}
          {garantia && (
            <span className="mt-1 block text-xs font-semibold text-status-ok">
              Entregue há {garantia.diasDesdeEntrega === 1 ? "1 dia" : `${garantia.diasDesdeEntrega} dias`}: ainda na garantia de {garantiaDias} dias dos serviços.
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {!confirmado && (emAtendimento ? (
            <>
              <Button type="button" size="sm" onClick={() => onAbrir(ultima)}>Abrir OS #{ultima.id}</Button>
              <button
                type="button"
                className="text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => onNovaManutencao(ultima)}
              >
                Começar outra mesmo assim
              </button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => onNovaManutencao(ultima)}>Sim, nova manutenção</Button>
          ))}
          <button
            type="button"
            aria-expanded={historicoAberto}
            className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
            onClick={() => setHistoricoAberto((aberto) => !aberto)}
          >
            {historicoAberto ? "Esconder histórico" : "Ver histórico"}
          </button>
        </div>
      </div>
      {historicoAberto && (
        <ul className="mt-3 space-y-1.5">
          {[...registros]
            .sort((a, b) => (b.data_entrada ?? "").localeCompare(a.data_entrada ?? "") || (b.id ?? 0) - (a.id ?? 0))
            .map((r) => (
              <li key={r.id} className={cn("rounded-lg bg-card px-3 py-2 text-xs")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold tabular-nums">OS #{r.id}</span>
                  <StatusBadge status={r.status} />
                  <span className="text-muted-foreground">
                    Entrada {formatDatePtBr(r.data_entrada)}
                    {r.data_saida ? ` · saída ${formatDatePtBr(r.data_saida)}` : ""}
                  </span>
                  {r.id != null && (
                    <button type="button" onClick={() => onAbrir(r)} className="ml-auto font-semibold text-primary underline-offset-2 hover:underline">
                      Ver OS
                    </button>
                  )}
                </div>
                {r.defeito_relatado?.trim() && (
                  <p className="mt-1 line-clamp-2 text-muted-foreground">Defeito: {r.defeito_relatado.trim()}</p>
                )}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
