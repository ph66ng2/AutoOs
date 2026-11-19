import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Botão pequeno de copiar ao lado de um dado (série, CPF/CNPJ, telefone, e-mail, nº da OS).
 * Mostra um ✓ por um instante; se a área de transferência falhar, avisa no próprio botão.
 */
export function BotaoCopiar({ valor, rotulo, className }: { valor: string; rotulo: string; className?: string }) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "falhou">("parado");
  const espera = useRef<number | null>(null);
  useEffect(() => () => { if (espera.current != null) window.clearTimeout(espera.current); }, []);

  async function copiar(event: React.MouseEvent) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(valor);
      setEstado("copiado");
    } catch {
      setEstado("falhou");
    }
    if (espera.current != null) window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => setEstado("parado"), 1500);
  }

  const titulo = estado === "copiado" ? "Copiado" : estado === "falhou" ? "Não deu para copiar" : `Copiar ${rotulo}`;
  return (
    <button
      type="button"
      onClick={(event) => void copiar(event)}
      aria-label={titulo}
      title={titulo}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-rapida hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        estado === "copiado" && "text-status-ok",
        estado === "falhou" && "text-status-bad",
        className,
      )}
    >
      {estado === "copiado" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  );
}
