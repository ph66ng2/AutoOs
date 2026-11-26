import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeSalvador } from "@/lib/date-utils";
import { statusFamilia } from "@/lib/status-familia";
import { ItemLinhaDoTempo } from "@/components/detalhe/LinhaDoTempo";
import { STATUS_LABELS, type EquipamentoHistoricoEvento, type StatusEquipamento } from "@/types";

function rotulo(status?: string) {
  return status ? STATUS_LABELS[status as StatusEquipamento] ?? status : "";
}

/**
 * Linha do tempo do histórico da OS (Acabamento do DS):
 * - cada trecho da linha vai do centro de um ícone ao centro do seguinte, então não sobra
 *   nem falta linha; o último item não tem trecho;
 * - o cabeçalho do item é um botão só (aria-expanded/aria-controls), com o texto visível como nome;
 * - abrir anima a altura em dur-lenta/ease-saida (zero com movimento reduzido).
 */
export function HistoricoOs({ eventos }: { eventos: EquipamentoHistoricoEvento[] }) {
  const base = useId();
  // O evento mais recente (último da lista) começa aberto: o motivo atual fica à vista.
  const [abertos, setAbertos] = useState<Set<number>>(() => new Set(eventos.length ? [eventos.length - 1] : []));
  const alternar = (indice: number) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(indice)) novo.delete(indice);
      else novo.add(indice);
      return novo;
    });

  return (
    <ol className="relative">
      {eventos.map((ev, indice) => {
        const ultimo = indice === eventos.length - 1;
        const aberto = abertos.has(indice);
        const corpoId = `${base}-evento-${indice}`;
        const data = ev.data_confiavel !== false ? formatDateTimeSalvador(ev.data) : "Horário legado inconsistente";
        const titulo = ev.status_anterior ? `${rotulo(ev.status_anterior)} → ${rotulo(ev.status)}` : rotulo(ev.status);
        return (
          <ItemLinhaDoTempo key={`${ev.data}-${ev.status}-${indice}`} familia={statusFamilia(ev.status)} ultimo={ultimo}>
              <button
                type="button"
                aria-expanded={aberto}
                aria-controls={corpoId}
                onClick={() => alternar(indice)}
                className="flex min-h-[28px] w-full items-center gap-2 rounded-md text-left transition-colors duration-rapida hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold">{titulo}</span>
                  {ev.tipo === "CORRECAO_STATUS" && <span className="ml-2 text-xs font-semibold text-status-wait">Correção</span>}
                  <span className="ml-2 text-xs text-muted-foreground">{data}</span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-lenta ease-saida", aberto && "rotate-180")}
                />
              </button>
              <div
                id={corpoId}
                className={cn("grid transition-[grid-template-rows] duration-lenta ease-saida", aberto ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
              >
                <div className="min-h-0 overflow-hidden" hidden={!aberto}>
                  <p className="pt-1 text-sm">{ev.motivo}</p>
                  {ev.autor && <p className="text-xs text-muted-foreground">Registrado por {ev.autor}</p>}
                </div>
              </div>
          </ItemLinhaDoTempo>
        );
      })}
    </ol>
  );
}
