import { Card, CardContent } from "@/components/ui/card";
import { parseDbTimestampUtc } from "@/lib/date-utils";
import type { Comunicacao } from "@/types";

const TITULO_POR_TIPO: Record<string, string> = {
  ORCAMENTO: "Orçamento enviado",
  PRONTO: "Aviso de equipamento pronto",
  LEMBRETE: "Lembrete enviado",
};

function diaMes(valor?: string) {
  const data = parseDbTimestampUtc(valor ?? null);
  return data ? data.toLocaleDateString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit" }) : "";
}

/** Cartão "Comunicação" da lateral de Detalhes da OS: as três mais recentes; a aba tem todas. */
export function ResumoComunicacoes({ comunicacoes, onVerTodas }: { comunicacoes: Comunicacao[]; onVerTodas: () => void }) {
  const recentes = [...comunicacoes]
    .sort((a, b) => String(b.data_envio || b.criado_em || "").localeCompare(String(a.data_envio || a.criado_em || "")))
    .slice(0, 3);
  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">Comunicação</h2>
          {comunicacoes.length > 3 && (
            <button type="button" onClick={onVerTodas} className="text-sm font-semibold text-primary hover:underline">
              Ver todas
            </button>
          )}
        </div>
        {recentes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma mensagem enviada ao cliente.</p>
        ) : (
          <ul className="divide-y">
            {recentes.map((com, indice) => (
              <li key={com.id ?? indice} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{TITULO_POR_TIPO[com.tipo] ?? (com.assunto || "Mensagem enviada")}</p>
                  <p className="text-xs text-muted-foreground">
                    {com.canal === "WHATSAPP" ? "WhatsApp" : "E-mail"}
                    {com.enviado === false && <span className="text-status-bad"> · falhou</span>}
                  </p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{diaMes(com.data_envio || com.criado_em)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
