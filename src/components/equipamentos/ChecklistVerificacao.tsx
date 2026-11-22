import { CheckCircle, Circle } from "lucide-react";
import type { ItemVerificacao } from "@/types";

/**
 * Checklist da verificação técnica em modo leitura. O item só guarda "marcado ou não":
 * desmarcado quer dizer não conferido ou não se aplica, nunca reprovado. Por isso
 * fica neutro (círculo vazio, texto apagado), sem X vermelho.
 */
export function ChecklistVerificacao({ itens }: { itens: ItemVerificacao[] }) {
  if (itens.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-medium mb-2">Checklist</p>
      <ul className="space-y-1">
        {itens.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            {item.verificado ? (
              <CheckCircle className="h-4 w-4 text-status-ok" aria-label="Conferido" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground/60" aria-label="Não marcado" />
            )}
            <span className={item.verificado ? "" : "text-muted-foreground"}>{item.nome}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
