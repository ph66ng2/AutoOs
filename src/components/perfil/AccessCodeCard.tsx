import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CodigoPrimeiroAcesso } from "@/types";

function formatExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "24 horas";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Código de primeiro acesso recém-gerado. Só aparece uma vez: o banco guarda apenas o hash. */
export function AccessCodeCard({ code }: { code: CodigoPrimeiroAcesso }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code.codigo);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-5 py-6 text-center">
        <span className="text-xs font-semibold tracking-wider text-primary">CÓDIGO DE PRIMEIRO ACESSO</span>
        <span className="font-mono text-4xl font-bold tracking-[0.2em] tabular-nums" aria-label={`Código ${code.codigo.split("").join(" ")}`}>
          {code.codigo}
        </span>
        <span className="text-sm text-muted-foreground">Vale até {formatExpiry(code.expira_em)} · ativa 1 computador</span>
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={() => void copy()}>
        {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
        {copied ? "Copiado" : "Copiar código"}
      </Button>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Passe o código para {code.nome}. No primeiro acesso a pessoa cria o próprio PIN e escolhe nome, ícone e tema.
        O código não é o PIN e não aparece de novo: se perder, gere outro.
      </p>
    </div>
  );
}
