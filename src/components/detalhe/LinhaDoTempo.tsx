import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FAMILIA_CLASSES, type StatusFamilia } from "@/lib/status-familia";

const ICONE = 28; // px; a linha passa pelo centro (ICONE / 2)

/**
 * Um item da linha do tempo (Histórico da OS e da venda, decisão 25): marcador na cor da
 * família e o trecho até o próximo item. Cada trecho vai do centro de um ícone ao centro do
 * seguinte; o último item não tem trecho e ganha o anel.
 */
export function ItemLinhaDoTempo({ familia, ultimo, children }: { familia: StatusFamilia; ultimo: boolean; children: ReactNode }) {
  return (
    <li className={cn("relative flex gap-3", !ultimo && "pb-4")}>
      {!ultimo && (
        <span aria-hidden="true" className="absolute w-0.5 bg-border" style={{ left: ICONE / 2 - 1, top: ICONE / 2, height: "100%" }} />
      )}
      <span
        aria-hidden="true"
        className={cn(
          "relative z-10 flex shrink-0 items-center justify-center rounded-full",
          FAMILIA_CLASSES[familia],
          ultimo && "ring-2 ring-primary ring-offset-2 ring-offset-card",
        )}
        style={{ width: ICONE, height: ICONE }}
      >
        <span className="h-2 w-2 rounded-full bg-current" />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

/** Linha do tempo sem expandir: título e data de cada passo (a venda só tem as datas). */
export function LinhaDoTempoSimples({ eventos }: { eventos: { titulo: string; data: string; familia: StatusFamilia }[] }) {
  return (
    <ol className="relative">
      {eventos.map((evento, indice) => (
        <ItemLinhaDoTempo key={`${evento.titulo}-${indice}`} familia={evento.familia} ultimo={indice === eventos.length - 1}>
          <p className="flex min-h-[28px] items-center justify-between gap-3 text-sm">
            <span className="font-semibold">{evento.titulo}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{evento.data}</span>
          </p>
        </ItemLinhaDoTempo>
      ))}
    </ol>
  );
}
