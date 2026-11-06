import { useCallback, useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { OrcamentosPendentesPortal } from "@/components/configuracoes/OrcamentosPendentesPortal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { SENSITIVE_PERMISSIONS, type EstadoPortal } from "@/types";

type Chave = "portalAtivo" | "respostasAtivas";

const ITENS: Array<{ chave: Chave; titulo: string; ligado: string; desligado: string }> = [
  {
    chave: "portalAtivo",
    titulo: "Portal ligado",
    ligado: "Os contatos com acesso entram em status.bmitag.com.br e acompanham os atendimentos.",
    desligado: "Ninguém entra no portal. Links individuais de acompanhamento continuam funcionando.",
  },
  {
    chave: "respostasAtivas",
    titulo: "Clientes podem responder orçamentos",
    ligado: "Quem tem acesso de decisão aceita, recusa ou pede para negociar pelo portal.",
    desligado: "O cliente vê o orçamento no portal, mas responde pelos canais de sempre.",
  },
];

/**
 * Liga/desliga do Portal do Cliente. Desligar não apaga nada. Mostra também quando respostas
 * vencidas não estão sendo aplicadas, sinal de que o agendamento no Supabase parou.
 */
export function PortalFuncionamentoCard() {
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const [estado, setEstado] = useState<EstadoPortal | null>(null);
  const [salvando, setSalvando] = useState<Chave | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setEstado(await db.obterEstadoPortal());
      setErro(null);
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const alternar = async (chave: Chave) => {
    if (!estado) return;
    const novo = { ...estado, [chave]: !estado[chave] };
    const liberado = await ensureSensitiveAccess({
      title: novo[chave] ? `Ligar: ${ITENS.find((i) => i.chave === chave)!.titulo}` : `Desligar: ${ITENS.find((i) => i.chave === chave)!.titulo}`,
      description: chave === "respostasAtivas"
        ? "Informe o PIN. Respostas pelo portal mudam status, pagamento e estoque: exige a permissão financeira."
        : "Informe o PIN para mudar o acesso dos clientes ao portal.",
      permission: chave === "respostasAtivas" ? SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS : SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS,
    });
    if (!liberado) return;
    setSalvando(chave);
    setErro(null);
    try {
      setEstado(await db.definirEstadoPortal(novo.portalAtivo, novo.respostasAtivas));
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSalvando(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portal do Cliente: funcionamento</CardTitle>
        <CardDescription>Desligar não apaga nada: contatos, senhas e respostas continuam guardados. Vale só para a empresa do perfil ativo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
        {estado && ITENS.map((item) => {
          const ligado = estado[item.chave];
          const bloqueado = item.chave === "respostasAtivas" && !estado.portalAtivo;
          return (
            <div key={item.chave} className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {bloqueado ? "Sem efeito enquanto o portal estiver desligado." : ligado ? item.ligado : item.desligado}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={ligado}
                aria-label={item.titulo}
                disabled={salvando !== null}
                onClick={() => void alternar(item.chave)}
                className={cn(
                  "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
                  ligado ? "bg-emerald-600" : "bg-muted-foreground/30",
                )}
              >
                <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", ligado ? "translate-x-5" : "translate-x-0.5")} />
              </button>
            </div>
          );
        })}
        {estado && estado.respostasAtrasadas > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {estado.respostasAtrasadas} resposta(s) passaram do prazo de correção e não foram aplicadas.
              O agendamento automático no Supabase (Cron) pode estar parado. Elas são aplicadas quando o cliente abre o portal;
              peça a quem administra o Supabase para conferir o agendamento.
            </span>
          </p>
        )}
        <OrcamentosPendentesPortal />
      </CardContent>
    </Card>
  );
}
