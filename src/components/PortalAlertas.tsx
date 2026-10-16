/**
 * Alertas do Portal das Impressoras do Cliente.
 *
 * Persistentes no banco (`portal_alertas`): respostas ao orçamento, efetivações, falhas,
 * pedidos de negociação/correção e códigos não entregues. Não dependem de WhatsApp nem de o
 * AutoOS estar aberto quando o cliente responde. Ler um alerta registra quem leu e quando.
 *
 * Fica no canto superior direito, junto dos avisos (toasts) do app: o sino abre um painel logo
 * abaixo dele e um alerta novo aparece como toast com o mesmo visual dos avisos de erro/sucesso.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import type { AlertaPortal } from "@/types";

const POLL_MS = 30_000;
const MAX_TOASTS_POR_VEZ = 3;

type Tom = "erro" | "atencao" | "sucesso" | "info";

const TOM_POR_TIPO: Record<AlertaPortal["tipo"], Tom> = {
  EFETIVACAO_FALHOU: "erro",
  CODIGO_NAO_ENTREGUE: "erro",
  RESPOSTA_RECEBIDA: "atencao",
  RESPOSTA_ALTERADA: "atencao",
  RESPOSTA_CANCELADA: "info",
  DECISAO_EFETIVADA: "sucesso",
  NEGOCIACAO_SOLICITADA: "info",
  CORRECAO_SOLICITADA: "info",
  DUVIDA_RECEBIDA: "info",
};

/** Mesmas cores do Sonner com `richColors` (avisos de erro/sucesso do app). */
const ESTILO_TOM: Record<Tom, string> = {
  erro: "border-l-red-500 bg-red-50/70",
  atencao: "border-l-amber-500 bg-amber-50/70",
  sucesso: "border-l-emerald-500 bg-emerald-50/70",
  info: "border-l-sky-500 bg-sky-50/60",
};

const quando = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

function notificar(alerta: AlertaPortal, abrir: () => void) {
  const opcoes = {
    id: `portal-alerta-${alerta.id}`,
    description: alerta.detalhe ?? undefined,
    duration: TOM_POR_TIPO[alerta.tipo] === "erro" ? Infinity : 10_000,
    action: { label: "Ver", onClick: abrir },
  };
  const tom = TOM_POR_TIPO[alerta.tipo];
  if (tom === "erro") toast.error(alerta.titulo, opcoes);
  else if (tom === "atencao") toast.warning(alerta.titulo, opcoes);
  else if (tom === "sucesso") toast.success(alerta.titulo, opcoes);
  else toast.info(alerta.titulo, opcoes);
}

export function PortalAlertasSino() {
  const navigate = useNavigate();
  const [naoLidos, setNaoLidos] = useState(0);
  const [aberto, setAberto] = useState(false);
  const ultimoVisto = useRef<number | null>(null);
  const notificados = useRef<string[]>([]);
  const raiz = useRef<HTMLDivElement>(null);

  const abrirAtendimento = useCallback((equipamentoId: number) => {
    setAberto(false);
    navigate("/equipamentos", { state: { equipamentoId } });
  }, [navigate]);

  const verificar = useCallback(async () => {
    try {
      const total = Number(await db.contarAlertasPortalNaoLidos()) || 0;
      setNaoLidos(total);
      if (total === 0) {
        ultimoVisto.current ??= 0;
        return;
      }
      const recentes = await db.listarAlertasPortal(true, 10);
      const maior = recentes.reduce((max, alerta) => Math.max(max, alerta.id), 0);
      // Na primeira consulta só o contador aparece; toasts são para o que chegar depois.
      if (ultimoVisto.current !== null) {
        recentes
          .filter((alerta) => alerta.id > (ultimoVisto.current ?? 0))
          .slice(0, MAX_TOASTS_POR_VEZ)
          .reverse()
          .forEach((alerta) => {
            notificados.current.push(`portal-alerta-${alerta.id}`);
            notificar(alerta, () => (alerta.equipamentoId ? abrirAtendimento(alerta.equipamentoId) : setAberto(true)));
          });
      }
      ultimoVisto.current = Math.max(ultimoVisto.current ?? 0, maior);
    } catch {
      // Sessão bloqueada ou banco sem a migration 0034: o sino fica sem contador.
      setNaoLidos(0);
    }
  }, [abrirAtendimento]);

  useEffect(() => {
    void verificar();
    const timer = window.setInterval(() => void verificar(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [verificar]);

  // Fecha ao clicar fora ou com Esc, como os menus do app.
  useEffect(() => {
    if (!aberto) return;
    // Os avisos do portal já estão no painel: some com eles para não cobrir a lista.
    notificados.current.forEach((id) => toast.dismiss(id));
    notificados.current = [];
    const fora = (event: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(event.target as Node)) setAberto(false);
    };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("relative h-9 w-9 rounded-full", aberto && "bg-muted")}
        onClick={() => setAberto((valor) => !valor)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={naoLidos > 0 ? `Alertas do portal: ${naoLidos} não lido(s)` : "Alertas do portal"}
      >
        <Bell className="h-5 w-5" />
        {naoLidos > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-background">
            {naoLidos > 99 ? "99+" : naoLidos}
          </span>
        )}
      </Button>
      {aberto && (
        <PortalAlertasPainel
          onFechar={() => setAberto(false)}
          onAbrirAtendimento={abrirAtendimento}
          onChanged={() => void verificar()}
        />
      )}
    </div>
  );
}

type PainelProps = {
  onFechar: () => void;
  onAbrirAtendimento: (equipamentoId: number) => void;
  onChanged: () => void;
};

export function PortalAlertasPainel({ onFechar, onAbrirAtendimento, onChanged }: PainelProps) {
  const [aba, setAba] = useState<"nao-lidos" | "historico">("nao-lidos");
  const [alertas, setAlertas] = useState<AlertaPortal[]>([]);
  const [loading, setLoading] = useState(true);
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
    void carregar();
  }, [carregar]);

  const marcar = async (id?: number) => {
    try {
      await db.marcarAlertasPortalLidos(id);
      onChanged();
      await carregar();
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const abrir = async (alerta: AlertaPortal) => {
    if (!alerta.equipamentoId) return;
    if (!alerta.lidoEm) await marcar(alerta.id);
    onAbrirAtendimento(alerta.equipamentoId);
  };

  return (
    <div
      role="dialog"
      aria-label="Alertas do Portal do Cliente"
      className="absolute right-0 top-11 z-[1000000000] flex max-h-[min(70vh,40rem)] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-lg"
    >
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Alertas do portal</h2>
          <p className="text-xs text-muted-foreground">Resposta “em prazo de correção” ainda pode mudar: não inicie o serviço.</p>
        </div>
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onFechar} aria-label="Fechar alertas">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex gap-1 rounded-md bg-muted p-0.5" role="tablist" aria-label="Filtro de alertas">
          {(["nao-lidos", "historico"] as const).map((valor) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={aba === valor}
              onClick={() => setAba(valor)}
              className={cn("rounded px-2.5 py-1 text-xs font-medium", aba === valor ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {valor === "nao-lidos" ? "Não lidos" : "Histórico"}
            </button>
          ))}
        </div>
        {aba === "nao-lidos" && alertas.length > 0 && (
          <button type="button" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => void marcar()}>
            <CheckCheck className="h-3.5 w-3.5" /> Marcar todos como lidos
          </button>
        )}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
        {loading && alertas.length === 0 && <p className="px-1 text-sm text-muted-foreground">Carregando…</p>}
        {!loading && alertas.length === 0 && !erro && (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            {aba === "nao-lidos" ? "Nenhum alerta novo." : "Nenhum alerta registrado."}
          </p>
        )}
        {alertas.map((alerta) => (
          <article key={alerta.id} className={cn("rounded-md border border-l-4 px-3 py-2.5", ESTILO_TOM[TOM_POR_TIPO[alerta.tipo]])}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold leading-snug">{alerta.titulo}</h3>
              <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={alerta.criadoEm}>{quando(alerta.criadoEm)}</time>
            </div>
            {alerta.detalhe && <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-700">{alerta.detalhe}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {alerta.equipamentoId && (
                <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => void abrir(alerta)}>Abrir atendimento</Button>
              )}
              {!alerta.lidoEm ? (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void marcar(alerta.id)}>Marcar como lido</Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Lido {alerta.lidoPor ? `por ${alerta.lidoPor} ` : ""}em {quando(alerta.lidoEm)}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
