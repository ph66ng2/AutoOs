/**
 * Alertas do Portal das Impressoras do Cliente.
 *
 * Persistentes no banco (`portal_alertas`): respostas ao orçamento, efetivações, falhas,
 * pedidos de negociação/correção e códigos não entregues. Não dependem de WhatsApp nem de o
 * AutoOS estar aberto quando o cliente responde. Ler um alerta registra quem leu e quando.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import type { AlertaPortal } from "@/types";

const POLL_MS = 60_000;

const TOM: Partial<Record<AlertaPortal["tipo"], string>> = {
  EFETIVACAO_FALHOU: "border-l-red-500 bg-red-50",
  CODIGO_NAO_ENTREGUE: "border-l-red-500 bg-red-50",
  RESPOSTA_RECEBIDA: "border-l-amber-500 bg-amber-50",
  RESPOSTA_ALTERADA: "border-l-amber-500 bg-amber-50",
  NEGOCIACAO_SOLICITADA: "border-l-sky-500 bg-sky-50",
  CORRECAO_SOLICITADA: "border-l-sky-500 bg-sky-50",
  DECISAO_EFETIVADA: "border-l-emerald-500 bg-emerald-50",
};

const quando = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export function PortalAlertasBotao({ collapsed }: { collapsed: boolean }) {
  const [naoLidos, setNaoLidos] = useState(0);
  const [aberto, setAberto] = useState(false);

  const contar = useCallback(async () => {
    try {
      setNaoLidos(Number(await db.contarAlertasPortalNaoLidos()) || 0);
    } catch {
      // Sessão bloqueada ou banco sem a migration 0034: o botão fica sem contador.
      setNaoLidos(0);
    }
  }, []);

  useEffect(() => {
    void contar();
    const timer = window.setInterval(() => void contar(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [contar]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white/90"
        aria-label={naoLidos > 0 ? `Alertas do portal: ${naoLidos} não lido(s)` : "Alertas do portal"}
      >
        <BellRing className="h-5 w-5 shrink-0" />
        {!collapsed && <span>Alertas do portal</span>}
        {naoLidos > 0 && (
          <span className={cn(
            "rounded-full bg-amber-400 px-1.5 text-xs font-bold text-slate-900",
            collapsed ? "absolute right-1 top-1" : "ml-auto",
          )}>
            {naoLidos > 99 ? "99+" : naoLidos}
          </span>
        )}
      </button>
      <PortalAlertasDialog open={aberto} onOpenChange={setAberto} onChanged={contar} />
    </>
  );
}

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
};

export function PortalAlertasDialog({ open, onOpenChange, onChanged }: DialogProps) {
  const navigate = useNavigate();
  const [aba, setAba] = useState<"nao-lidos" | "historico">("nao-lidos");
  const [alertas, setAlertas] = useState<AlertaPortal[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setAlertas(await db.listarAlertasPortal(aba === "nao-lidos", aba === "nao-lidos" ? 100 : 200));
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [aba]);

  useEffect(() => {
    if (open) void carregar();
  }, [open, carregar]);

  const marcar = async (id?: number) => {
    try {
      await db.marcarAlertasPortalLidos(id);
      onChanged();
      await carregar();
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const abrirAtendimento = async (alerta: AlertaPortal) => {
    if (!alerta.equipamentoId) return;
    if (!alerta.lidoEm) await marcar(alerta.id);
    onOpenChange(false);
    navigate("/equipamentos", { state: { equipamentoId: alerta.equipamentoId } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Alertas do Portal do Cliente</DialogTitle>
          <DialogDescription>
            Respostas a orçamentos, negociações e falhas. Uma resposta “em prazo de correção” ainda pode mudar:
            não inicie o serviço antes de ela ser efetivada.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={aba} onValueChange={(value) => setAba(value as typeof aba)}>
            <TabsList>
              <TabsTrigger value="nao-lidos">Não lidos</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>
          </Tabs>
          {aba === "nao-lidos" && alertas.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => void marcar()}>Marcar todos como lidos</Button>
          )}
        </div>
        {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {loading && alertas.length === 0 && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!loading && alertas.length === 0 && !erro && (
            <p className="text-sm text-muted-foreground">
              {aba === "nao-lidos" ? "Nenhum alerta novo." : "Nenhum alerta registrado."}
            </p>
          )}
          {alertas.map((alerta) => (
            <article key={alerta.id} className={cn("rounded-md border border-l-4 p-3", TOM[alerta.tipo] ?? "border-l-slate-400")}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{alerta.titulo}</h3>
                <time className="text-xs text-muted-foreground" dateTime={alerta.criadoEm}>{quando(alerta.criadoEm)}</time>
              </div>
              {alerta.detalhe && <p className="mt-1 text-sm text-slate-700">{alerta.detalhe}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {alerta.equipamentoId && (
                  <Button size="sm" variant="secondary" onClick={() => void abrirAtendimento(alerta)}>Abrir atendimento</Button>
                )}
                {!alerta.lidoEm ? (
                  <Button size="sm" variant="ghost" onClick={() => void marcar(alerta.id)}>Marcar como lido</Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Lido {alerta.lidoPor ? `por ${alerta.lidoPor} ` : ""}em {quando(alerta.lidoEm)}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
