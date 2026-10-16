/**
 * Central de notificações (sino no canto superior direito).
 *
 * Duas fontes, uma lista:
 * - Portal do Cliente: alertas persistentes no banco (`portal_alertas`) — respostas ao orçamento,
 *   efetivações, falhas, pedidos e códigos não entregues. Ler registra quem leu e quando.
 * - Erros do app: o que apareceu como aviso de erro (`notificarErro`), guardado neste computador
 *   para o operador copiar o relatório técnico depois.
 *
 * Abas: Todos, Erros (erros do app + alertas do portal que pedem ação) e Portal do Cliente.
 */

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Bell,
  Check,
  CheckCheck,
  CircleAlert,
  CircleX,
  Copy,
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
import { copyErrorDetails } from "@/lib/error-utils";
import { marcarErrosLidos, useErrosRegistrados, type ErroRegistrado } from "@/lib/error-log";
import { PREFIXO_TOAST_ERRO } from "@/hooks/useNotification";
import { cn } from "@/lib/utils";
import type { AlertaPortal } from "@/types";

const POLL_MS = 30_000;

/** Disparado quando chegam alertas novos do portal; a tela de Equipamentos reordena a lista. */
export const EVENTO_ALERTAS_PORTAL = "autoos:alertas-portal-novos";
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

function notificar(alerta: AlertaPortal, ver: () => void) {
  const visual = visualDoAlerta(alerta);
  const opcoes = {
    id: `portal-alerta-${alerta.id}`,
    description: alerta.detalhe ?? undefined,
    icon: <visual.Icone className="h-4 w-4" />,
    // Erro fica até alguém fechar, como os avisos de erro do app.
    duration: visual.erro ? Infinity : 10_000,
    action: { label: "Ver", onClick: ver },
    classNames: { description: "!whitespace-pre-line", toast: visual.toast },
  };
  if (visual.erro) toast.error(alerta.titulo, opcoes);
  else toast(alerta.titulo, opcoes);
}

export function PortalAlertasSino() {
  const navigate = useNavigate();
  const erros = useErrosRegistrados();
  const [naoLidosPortal, setNaoLidosPortal] = useState(0);
  const [aberto, setAberto] = useState(false);
  const ultimoVisto = useRef<number | null>(null);
  const notificados = useRef<string[]>([]);
  const raiz = useRef<HTMLDivElement>(null);
  const errosNaoLidos = erros.filter((item) => !item.lido).length;
  const naoLidos = naoLidosPortal + errosNaoLidos;
  const errosAbertos = useRef<string[]>([]);
  errosAbertos.current = erros.filter((item) => !item.lido).map((item) => item.id);

  const abrirAtendimento = useCallback((equipamentoId: number) => {
    setAberto(false);
    navigate("/equipamentos", { state: { equipamentoId } });
  }, [navigate]);

  const verificar = useCallback(async () => {
    try {
      const total = Number(await db.contarAlertasPortalNaoLidos()) || 0;
      setNaoLidosPortal(total);
      if (total === 0) {
        ultimoVisto.current ??= 0;
        return;
      }
      const recentes = await db.listarAlertasPortal(true, 10);
      const maior = recentes.reduce((max, alerta) => Math.max(max, alerta.id), 0);
      // Na primeira consulta só o contador aparece; toasts são para o que chegar depois.
      if (ultimoVisto.current !== null) {
        const novos = recentes.filter((alerta) => alerta.id > (ultimoVisto.current ?? 0));
        novos
          .slice(0, MAX_TOASTS_POR_VEZ)
          .reverse()
          .forEach((alerta) => {
            notificados.current.push(`portal-alerta-${alerta.id}`);
            notificar(alerta, () => {
              // "Ver" conta como leitura, igual a abrir pelo painel.
              void db.marcarAlertasPortalLidos(alerta.id).then(() => verificarRef.current()).catch(() => undefined);
              if (alerta.equipamentoId) abrirAtendimento(alerta.equipamentoId);
              else setAberto(true);
            });
          });
        const equipamentoIds = [...new Set(novos.map((alerta) => alerta.equipamentoId).filter((id): id is number => id != null))];
        if (novos.length > 0) {
          window.dispatchEvent(new CustomEvent(EVENTO_ALERTAS_PORTAL, { detail: { equipamentoIds } }));
        }
      }
      ultimoVisto.current = Math.max(ultimoVisto.current ?? 0, maior);
    } catch {
      // Sessão bloqueada ou banco sem a migration 0034: só os erros do app contam.
      setNaoLidosPortal(0);
    }
  }, [abrirAtendimento]);
  const verificarRef = useRef(verificar);
  verificarRef.current = verificar;

  useEffect(() => {
    void verificar();
    const timer = window.setInterval(() => void verificar(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [verificar]);

  // Fecha ao clicar fora ou com Esc, como os menus do app.
  useEffect(() => {
    if (!aberto) return;
    // O que já está no painel não precisa continuar cobrindo a tela como aviso.
    notificados.current.forEach((id) => toast.dismiss(id));
    notificados.current = [];
    errosAbertos.current.forEach((id) => toast.dismiss(`${PREFIXO_TOAST_ERRO}${id}`));
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
        aria-label={naoLidos > 0 ? `Notificações: ${naoLidos} não lida(s)` : "Notificações"}
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
          erros={erros}
          onFechar={() => setAberto(false)}
          onAbrirAtendimento={abrirAtendimento}
          onChanged={() => void verificar()}
        />
      )}
    </div>
  );
}

type Aba = "todos" | "erros" | "portal";

type Item =
  | { tipo: "portal"; chave: string; quando: string; alerta: AlertaPortal }
  | { tipo: "erro"; chave: string; quando: string; registro: ErroRegistrado };

type PainelProps = {
  erros: ErroRegistrado[];
  onFechar: () => void;
  onAbrirAtendimento: (equipamentoId: number) => void;
  onChanged: () => void;
};

const ROTULO_ABA: Record<Aba, string> = { todos: "Todos", erros: "Erros", portal: "Portal do Cliente" };

export function PortalAlertasPainel({ erros, onFechar, onAbrirAtendimento, onChanged }: PainelProps) {
  const [aba, setAba] = useState<Aba>("todos");
  const [historico, setHistorico] = useState(false);
  const [alertas, setAlertas] = useState<AlertaPortal[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setAlertas(await db.listarAlertasPortal(!historico, historico ? 200 : 100));
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [historico]);

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

  const errosVisiveis = historico ? erros : erros.filter((item) => !item.lido);
  const portalErro = (alerta: AlertaPortal) => visualDoAlerta(alerta).erro === true;
  const contagem: Record<Aba, number> = {
    todos: alertas.filter((a) => !a.lidoEm).length + erros.filter((e) => !e.lido).length,
    erros: alertas.filter((a) => !a.lidoEm && portalErro(a)).length + erros.filter((e) => !e.lido).length,
    portal: alertas.filter((a) => !a.lidoEm).length,
  };

  const itens: Item[] = [
    ...(aba === "portal" || aba === "todos" ? alertas : aba === "erros" ? alertas.filter(portalErro) : [])
      .map((alerta): Item => ({ tipo: "portal", chave: `p-${alerta.id}`, quando: alerta.criadoEm, alerta })),
    ...(aba === "portal" ? [] : errosVisiveis)
      .map((registro): Item => ({ tipo: "erro", chave: `e-${registro.id}`, quando: registro.erro.timestamp.toISOString(), registro })),
  ].sort((a, b) => b.quando.localeCompare(a.quando));

  const marcarTodos = async () => {
    if (aba !== "portal") marcarErrosLidos();
    if (aba === "erros") {
      for (const alerta of alertas.filter((a) => !a.lidoEm && portalErro(a))) await db.marcarAlertasPortalLidos(alerta.id).catch(() => undefined);
      onChanged();
      await carregar();
    } else {
      await marcar();
    }
  };
  const haNaoLidos = itens.some((item) => (item.tipo === "portal" ? !item.alerta.lidoEm : !item.registro.lido));

  return (
    <div
      role="dialog"
      aria-label="Notificações"
      className="absolute right-0 top-11 z-[1000000000] flex max-h-[min(75vh,42rem)] w-[min(27rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-lg"
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Notificações</h2>
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onFechar} aria-label="Fechar notificações">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-4 border-b px-4" role="tablist" aria-label="Tipo de notificação">
        {(["todos", "erros", "portal"] as const).map((valor) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={aba === valor}
            onClick={() => setAba(valor)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 py-2 text-xs font-medium",
              aba === valor ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {ROTULO_ABA[valor]}
            {contagem[valor] > 0 && (
              <span className={cn(
                "rounded-full px-1.5 text-[10px] font-semibold leading-4",
                valor === "erros" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground",
              )}>
                {contagem[valor]}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <div className="flex gap-1 rounded-md bg-muted p-0.5" aria-label="Lidas ou histórico">
          {([false, true] as const).map((valor) => (
            <button
              key={String(valor)}
              type="button"
              aria-pressed={historico === valor}
              onClick={() => setHistorico(valor)}
              className={cn("rounded px-2.5 py-1 text-xs font-medium", historico === valor ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {valor ? "Histórico" : "Não lidas"}
            </button>
          ))}
        </div>
        {haNaoLidos && (
          <button type="button" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => void marcarTodos()}>
            <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
          </button>
        )}
      </div>
      {aba === "erros" && (
        <p className="mx-4 mb-1 rounded bg-muted/60 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
          “Copiar relatório” leva código, descrição técnica e referência do log — é o que você manda para o suporte.
        </p>
      )}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3 pt-1">
        {erro && aba !== "erros" && <p className="text-sm text-destructive" role="alert">{erro}</p>}
        {loading && itens.length === 0 && <p className="px-1 text-sm text-muted-foreground">Carregando…</p>}
        {!loading && itens.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            {historico ? "Nada registrado." : aba === "erros" ? "Nenhum erro novo." : "Nenhuma notificação nova."}
          </p>
        )}
        {itens.map((item) => item.tipo === "portal"
          ? <ItemPortal key={item.chave} alerta={item.alerta} onAbrir={() => void abrir(item.alerta)} onMarcar={() => void marcar(item.alerta.id)} />
          : <ItemErro key={item.chave} registro={item.registro} />)}
      </div>
      {aba !== "erros" && (
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          Portal: “confirma às…” significa que o cliente ainda pode desfazer. Só inicie o serviço depois.
        </p>
      )}
    </div>
  );
}

function ItemPortal({ alerta, onAbrir, onMarcar }: { alerta: AlertaPortal; onAbrir: () => void; onMarcar: () => void }) {
  const visual = visualDoAlerta(alerta);
  return (
    <article className={cn("flex gap-3 rounded-md border border-l-4 bg-background px-3 py-2.5", visual.borda, alerta.lidoEm && "opacity-75")}>
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
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Portal</span>
          {alerta.equipamentoId && (
            <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={onAbrir}>
              Abrir atendimento
            </button>
          )}
          {!alerta.lidoEm ? (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={onMarcar}>
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
}

function ItemErro({ registro }: { registro: ErroRegistrado }) {
  const { erro } = registro;
  const [copiado, setCopiado] = useState<"ok" | "falhou" | null>(null);
  const copiar = async () => {
    const ok = await copyErrorDetails(erro);
    setCopiado(ok ? "ok" : "falhou");
    window.setTimeout(() => setCopiado(null), 2500);
  };
  return (
    <article className={cn("flex gap-3 rounded-md border border-l-4 border-l-red-500 bg-background px-3 py-2.5", registro.lido && "opacity-75")}>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700" aria-hidden="true">
        <CircleAlert className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold leading-snug">{erro.context} — {erro.action}</h3>
          <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={erro.timestamp.toISOString()}>{quando(erro.timestamp.toISOString())}</time>
        </div>
        <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{erro.message}</p>
        {erro.codigo && (
          <p className="mt-1 font-mono text-[11px] text-foreground/80">
            {erro.codigo}{erro.referencia && <span className="text-muted-foreground"> · ref {erro.referencia}</span>}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">AutoOS</span>
          <button type="button" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => void copiar()}>
            {copiado === "ok" ? <><Check className="h-3.5 w-3.5" /> Copiado</> : <><Copy className="h-3.5 w-3.5" /> Copiar relatório</>}
          </button>
          {copiado === "falhou" && <span className="text-[11px] text-destructive">Não foi possível copiar.</span>}
          {!registro.lido && (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => marcarErrosLidos(registro.id)}>
              Marcar como lido
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
