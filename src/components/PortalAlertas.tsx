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

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Bell,
  CheckCheck,
  CircleX,
  Hourglass,
  MailX,
  MessageCircleQuestion,
  MessagesSquare,
  RotateCcw,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import type { AlertaPortal } from "@/types";

const POLL_MS = 30_000;
const MAX_TOASTS_POR_VEZ = 3;

/**
 * Uma família de cor por significado, a mesma no aviso (toast) e no painel:
 * verde = dinheiro entrou (aprovado); cinza = encerrado sem ação (recusado, desfeito);
 * azul = aguardando o prazo; violeta = conversa com o cliente; âmbar = pedido de correção;
 * vermelho = a equipe precisa agir (igual aos avisos de erro do app).
 */
type Visual = {
  Icone: ComponentType<{ className?: string }>;
  /** Fundo e cor do ícone no painel. */
  chip: string;
  /** Faixa lateral no painel. */
  borda: string;
  /** Cores do aviso (toast); vazio = usa o toast de erro padrão do app. */
  toast: string;
  erro?: boolean;
};

const VERDE = { chip: "bg-emerald-100 text-emerald-700", borda: "border-l-emerald-500", toast: "!border-emerald-200 !bg-emerald-50 !text-emerald-900 [&_[data-icon]]:!text-emerald-600" };
const CINZA = { chip: "bg-slate-100 text-slate-600", borda: "border-l-slate-400", toast: "!border-slate-200 !bg-slate-50 !text-slate-800 [&_[data-icon]]:!text-slate-500" };
const AZUL = { chip: "bg-sky-100 text-sky-700", borda: "border-l-sky-500", toast: "!border-sky-200 !bg-sky-50 !text-sky-900 [&_[data-icon]]:!text-sky-600" };
const VIOLETA = { chip: "bg-violet-100 text-violet-700", borda: "border-l-violet-500", toast: "!border-violet-200 !bg-violet-50 !text-violet-900 [&_[data-icon]]:!text-violet-600" };
const AMBAR = { chip: "bg-amber-100 text-amber-700", borda: "border-l-amber-500", toast: "!border-amber-200 !bg-amber-50 !text-amber-900 [&_[data-icon]]:!text-amber-600" };
const VERMELHO = { chip: "bg-red-100 text-red-700", borda: "border-l-red-500", toast: "", erro: true };

export function visualDoAlerta(alerta: Pick<AlertaPortal, "tipo" | "decisao">): Visual {
  const recusa = alerta.decisao === "RECUSAR";
  switch (alerta.tipo) {
    case "DECISAO_EFETIVADA":
      return recusa ? { Icone: CircleX, ...CINZA } : { Icone: BadgeCheck, ...VERDE };
    case "RESPOSTA_RECEBIDA":
    case "RESPOSTA_ALTERADA":
      return { Icone: Hourglass, ...AZUL };
    case "RESPOSTA_CANCELADA":
      return { Icone: Undo2, ...CINZA };
    case "NEGOCIACAO_SOLICITADA":
      return { Icone: MessagesSquare, ...VIOLETA };
    case "DUVIDA_RECEBIDA":
      return { Icone: MessageCircleQuestion, ...VIOLETA };
    case "CORRECAO_SOLICITADA":
      return { Icone: RotateCcw, ...AMBAR };
    case "CODIGO_NAO_ENTREGUE":
      return { Icone: MailX, ...VERMELHO };
    case "EFETIVACAO_FALHOU":
    default:
      return { Icone: TriangleAlert, ...VERMELHO };
  }
}

function quando(value: string) {
  const data = new Date(value);
  const minutos = Math.round((Date.now() - data.getTime()) / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  if (minutos < 24 * 60) return `há ${Math.floor(minutos / 60)} h`;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
}

function notificar(alerta: AlertaPortal, abrir: () => void) {
  const visual = visualDoAlerta(alerta);
  const opcoes = {
    id: `portal-alerta-${alerta.id}`,
    description: alerta.detalhe ?? undefined,
    icon: <visual.Icone className="h-4 w-4" />,
    // Erro fica até alguém fechar, como os avisos de erro do app.
    duration: visual.erro ? Infinity : 10_000,
    action: { label: "Ver", onClick: abrir },
    classNames: { description: "!whitespace-pre-line", toast: visual.toast },
  };
  if (visual.erro) toast.error(alerta.titulo, opcoes);
  else toast(alerta.titulo, opcoes);
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
          <p className="text-xs text-muted-foreground">“Confirma às…”: o cliente ainda pode desfazer. Só inicie o serviço depois.</p>
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
        {alertas.map((alerta) => {
          const visual = visualDoAlerta(alerta);
          return (
            <article
              key={alerta.id}
              className={cn("flex gap-3 rounded-md border border-l-4 bg-background px-3 py-2.5", visual.borda, alerta.lidoEm && "opacity-75")}
            >
              <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", visual.chip)} aria-hidden="true">
                <visual.Icone className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-snug">{alerta.titulo}</h3>
                  <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={alerta.criadoEm}>{quando(alerta.criadoEm)}</time>
                </div>
                {alerta.detalhe && (
                  <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{alerta.detalhe}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {alerta.equipamentoId && (
                    <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => void abrir(alerta)}>
                      Abrir atendimento
                    </button>
                  )}
                  {!alerta.lidoEm ? (
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => void marcar(alerta.id)}>
                      Marcar como lido
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      Lido {alerta.lidoPor ? `por ${alerta.lidoPor} ` : ""}{quando(alerta.lidoEm)}
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
