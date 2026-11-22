/**
 * Central de notificações (sino no cabeçalho do celular ou no pé do menu no computador).
 *
 * Duas fontes, uma lista:
 * - Portal do Cliente: alertas persistentes no banco (`portal_alertas`) — respostas ao orçamento,
 *   efetivações, falhas, pedidos e códigos não entregues. Ler registra quem leu e quando.
 * - Erros do app: o que apareceu como aviso de erro (`notificarErro`), guardado neste computador
 *   para o operador copiar o relatório técnico depois.
 *
 * Abas: Todos, Erros (erros do app + alertas do portal que pedem ação) e Portal do Cliente.
 */

import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Bell,
  Check,
  CheckCheck,
  CircleAlert,
  CircleX,
  Copy,
  Headphones,
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
import { copyErrorDetails, formatErrorForCopy, versaoDoApp } from "@/lib/error-utils";
import { enviarErroAoSuporte, suporteDisponivel } from "@/lib/suporte-ponte";
import { marcarErrosLidos, useErrosRegistrados, type ErroRegistrado } from "@/lib/error-log";
import { PREFIXO_TOAST_ERRO } from "@/hooks/useNotification";
import { cn } from "@/lib/utils";
import { destinoDoAviso, ROTULO_ABRIR_AVISO, VISUAL_AVISO } from "@/lib/avisos-internos";
import { notificarSistema } from "@/lib/notificacao-sistema";
import { contarNovos } from "@/lib/sino-visto";
import { useVistoDoSino } from "@/hooks/useVistoDoSino";
import type { AvisoInterno } from "@/types";
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
  /** Fundo e cor do ícone (painel e aviso rápido). A cor da família fica só aqui. */
  chip: string;
  /** Classes do aviso (toast): só pintam o ícone; vazio = usa o toast de erro padrão do app. */
  toast: string;
  erro?: boolean;
};

const VERDE = { chip: "bg-status-ok-bg text-status-ok", toast: "[&_[data-icon]]:!text-status-ok" };
const CINZA = { chip: "bg-status-neutral-bg text-status-neutral", toast: "[&_[data-icon]]:!text-status-neutral" };
const AZUL = { chip: "bg-status-work-bg text-status-work", toast: "[&_[data-icon]]:!text-status-work" };
const CONVERSA = { chip: "bg-acc-soft text-acc-soft-foreground", toast: "[&_[data-icon]]:!text-acc-soft-foreground" };
const AMBAR = { chip: "bg-status-wait-bg text-status-wait", toast: "[&_[data-icon]]:!text-status-wait" };
const VERMELHO = { chip: "bg-status-bad-bg text-status-bad", toast: "", erro: true };

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
      return { Icone: MessagesSquare, ...CONVERSA };
    case "DUVIDA_RECEBIDA":
      return { Icone: MessageCircleQuestion, ...CONVERSA };
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
    icon: (
      <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-lg", visual.chip)}>
        <visual.Icone className="h-4 w-4" />
      </span>
    ),
    // Erro fica até alguém fechar, como os avisos de erro do app.
    duration: visual.erro ? Infinity : 10_000,
    action: { label: "Ver", onClick: ver },
    classNames: { description: "!whitespace-pre-line", icon: "!m-0 !h-7 !w-7", toast: visual.toast },
  };
  if (visual.erro) toast.error(alerta.titulo, opcoes);
  else toast(alerta.titulo, opcoes);
}

/** Posição `fixed` para o painel caber na janela, seja o sino no topo (celular) ou no pé do menu. */
export function encaixePainelNotificacoes(
  ancora: Pick<DOMRect, "top" | "bottom" | "left" | "right">,
  viewport: { width: number; height: number },
): CSSProperties {
  const margem = 8;
  const gap = 8;
  const largura = Math.min(27 * 16, viewport.width - margem * 2);
  const paraDireita = ancora.right + gap + largura <= viewport.width - margem;
  const left = paraDireita
    ? ancora.right + gap
    : Math.max(margem, Math.min(ancora.right - largura, viewport.width - margem - largura));
  const maxPainel = Math.min(viewport.height * 0.75, viewport.height - margem * 2);
  const abaixo = viewport.height - ancora.bottom - gap - margem;
  const acima = ancora.top - gap - margem;
  const abrirAcima = abaixo < 240 && acima > abaixo;
  if (abrirAcima) {
    return {
      position: "fixed",
      left,
      bottom: viewport.height - ancora.top + gap,
      width: largura,
      maxHeight: Math.max(0, Math.min(maxPainel, acima)),
    };
  }
  return {
    position: "fixed",
    left,
    top: ancora.bottom + gap,
    width: largura,
    maxHeight: Math.max(0, Math.min(maxPainel, abaixo)),
  };
}

/** Maior id de alerta do portal ainda não lido (o que o painel mostra no topo). */
async function buscarMaiorAlertaNaoLido(): Promise<number> {
  const lista = await db.listarAlertasPortal(true, 1);
  return lista[0]?.id ?? 0;
}

/**
 * `perfilId`: perfil ativo. Ao trocar de perfil, o sino esquece os avisos e o "lido" do anterior
 * e consulta de novo; respostas de consultas da sessão anterior são descartadas.
 */
export function PortalAlertasSino({ perfilId = null, portalDesligado = false }: {
  perfilId?: number | null;
  /** Perfil › Notificações desligou o portal: some do número, dos avisos e do painel. As
   *  mudanças continuam sendo detectadas (a lista de equipamentos e a OS aberta dependem disso). */
  portalDesligado?: boolean;
} = {}) {
  const navigate = useNavigate();
  const erros = useErrosRegistrados();
  const [naoLidosPortal, setNaoLidosPortal] = useState(0);
  /** Maior id de alerta do portal não lido: vira a marca do "visto" ao abrir o sino. */
  const [portalMaiorId, setPortalMaiorId] = useState(0);
  const [avisos, setAvisos] = useState<AvisoInterno[]>([]);
  const avisosVistos = useRef<Set<string> | null>(null);
  /** A lista de avisos internos já veio do banco com sucesso (falha não conta como lista vazia). */
  const avisosCarregadosOk = useRef(false);
  /** Muda a cada troca de perfil: resposta que volta com outro número é da sessão anterior. */
  const geracao = useRef(0);
  const [aberto, setAberto] = useState(false);
  const [encaixe, setEncaixe] = useState<CSSProperties>({});
  const ultimoVisto = useRef<number | null>(null);
  const notificados = useRef<string[]>([]);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const errosNaoLidos = erros.filter((item) => !item.lido).length;
  // Só avisos contam no número; erros do app ficam na aba Sistema (um ponto discreto no sino).
  const avisosNaoLidos = avisos.filter((aviso) => !aviso.lido).length;
  const naoLidos = (portalDesligado ? 0 : naoLidosPortal) + avisosNaoLidos;
  // O número do sino conta só o não lido que chegou depois da última abertura (visto ≠ lido).
  // Regras e proteções do "visto" ficam em useVistoDoSino / sino-visto.ts.
  const chavesNaoLidasAvisos = avisos.filter((aviso) => !aviso.lido).map((aviso) => `aviso:${aviso.chave}`);
  const chavesErrosNaoLidos = erros.filter((item) => !item.lido).map((item) => `erro:${item.id}`);
  const visto = useVistoDoSino({
    perfilId,
    aberto,
    chavesNaoLidas: [...chavesNaoLidasAvisos, ...chavesErrosNaoLidos],
    buscarMaiorPortal: portalDesligado ? null : buscarMaiorAlertaNaoLido,
  });
  const novos = contarNovos(chavesNaoLidasAvisos, visto.vistos) + (portalDesligado ? 0 : visto.novosPortal);
  const errosNovos = contarNovos(chavesErrosNaoLidos, visto.vistos);
  const abrirSino = () => {
    visto.abrir({ avisosCarregados: avisosCarregadosOk.current, portalMaiorId });
    setAberto(true);
  };
  const abrirSinoRef = useRef(abrirSino);
  abrirSinoRef.current = abrirSino;
  const portalDesligadoRef = useRef(portalDesligado);
  portalDesligadoRef.current = portalDesligado;
  const errosAbertos = useRef<string[]>([]);
  errosAbertos.current = erros.filter((item) => !item.lido).map((item) => item.id);

  const abrirAtendimento = useCallback((equipamentoId: number) => {
    setAberto(false);
    navigate("/equipamentos", { state: { equipamentoId } });
  }, [navigate]);

  /** Avisos internos: contam no sino; os que aparecem depois da primeira consulta viram aviso rápido. */
  const verificarAvisos = useCallback(async () => {
    const minhaGeracao = geracao.current;
    let lista: AvisoInterno[] = [];
    let ok = false;
    try {
      lista = (await db.listarAvisosInternos()) ?? [];
      ok = true;
    } catch {
      // Sem sessão ou banco sem a migration 0053: nenhum aviso interno.
    }
    if (minhaGeracao !== geracao.current) return;
    if (ok) avisosCarregadosOk.current = true;
    setAvisos(lista);
    const vistos = avisosVistos.current;
    const novos = vistos ? lista.filter((aviso) => !aviso.lido && !vistos.has(aviso.chave)) : [];
    avisosVistos.current = new Set([...(vistos ?? []), ...lista.map((aviso) => aviso.chave)]);
    novos.slice(0, MAX_TOASTS_POR_VEZ).forEach((aviso) => {
      // Minimizado ou sem foco, o aviso também vai para a central de notificações do Windows.
      void notificarSistema(aviso.titulo, aviso.detalhe);
      const visual = VISUAL_AVISO[aviso.tipo];
      toast(aviso.titulo, {
        id: `aviso-${aviso.chave}`,
        description: aviso.detalhe ?? undefined,
        icon: (
          <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-lg", visual.chip)}>
            <visual.Icone className="h-4 w-4" />
          </span>
        ),
        duration: 10_000,
        action: { label: "Ver", onClick: () => abrirAvisoRef.current(aviso) },
        classNames: { icon: "!m-0 !h-7 !w-7" },
      });
    });
  }, []);

  const abrirAviso = useCallback((aviso: AvisoInterno) => {
    // Abrir conta como leitura, igual aos alertas do portal.
    void db.marcarAvisosLidos([aviso.chave]).then(() => verificarAvisos()).catch(() => undefined);
    const destino = destinoDoAviso(aviso);
    setAberto(false);
    if (destino) navigate(destino.path, destino.state ? { state: destino.state } : undefined);
  }, [navigate, verificarAvisos]);
  const abrirAvisoRef = useRef(abrirAviso);
  abrirAvisoRef.current = abrirAviso;

  const verificar = useCallback(async () => {
    void verificarAvisos();
    const minhaGeracao = geracao.current;
    try {
      const consulta = visto.iniciarConsultaPortal();
      const [total, depoisDaMarca] = await Promise.all([
        db.contarAlertasPortalNaoLidos(),
        db.contarAlertasPortalNaoLidos(consulta.portalAte),
      ]);
      if (minhaGeracao !== geracao.current) return;
      setNaoLidosPortal(Number(total) || 0);
      visto.registrarContaPortal(consulta, Number(depoisDaMarca) || 0);
      if (!total) setPortalMaiorId(0);
      if (!total) {
        ultimoVisto.current ??= 0;
        return;
      }
      const recentes = await db.listarAlertasPortal(true, 10);
      // Trocou de perfil enquanto a lista chegava: a resposta é do perfil anterior.
      if (minhaGeracao !== geracao.current) return;
      const maior = recentes.reduce((max, alerta) => Math.max(max, alerta.id), 0);
      setPortalMaiorId(recentes.filter((alerta) => !alerta.lidoEm).reduce((max, alerta) => Math.max(max, alerta.id), 0));
      // Na primeira consulta só o contador aparece; toasts são para o que chegar depois.
      if (ultimoVisto.current !== null) {
        const novos = recentes.filter((alerta) => alerta.id > (ultimoVisto.current ?? 0));
        (portalDesligadoRef.current ? [] : novos)
          .slice(0, MAX_TOASTS_POR_VEZ)
          .reverse()
          .forEach((alerta) => {
            notificados.current.push(`portal-alerta-${alerta.id}`);
            void notificarSistema(alerta.titulo, alerta.detalhe);
            notificar(alerta, () => {
              // "Ver" conta como leitura, igual a abrir pelo painel.
              void db.marcarAlertasPortalLidos(alerta.id).then(() => verificarRef.current()).catch(() => undefined);
              if (alerta.equipamentoId) abrirAtendimento(alerta.equipamentoId);
              else abrirSinoRef.current();
            });
          });
        const equipamentoIds = [...new Set(novos.map((alerta) => alerta.equipamentoId).filter((id): id is number => id != null))];
        if (novos.length > 0) {
          window.dispatchEvent(new CustomEvent(EVENTO_ALERTAS_PORTAL, { detail: { equipamentoIds } }));
        }
      }
      ultimoVisto.current = Math.max(ultimoVisto.current ?? 0, maior);
    } catch {
      // Sessão bloqueada ou banco sem a migration 0035: só os erros do app contam.
      setNaoLidosPortal(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as funções do `visto` são estáveis
  }, [abrirAtendimento, verificarAvisos]);
  const verificarRef = useRef(verificar);
  verificarRef.current = verificar;

  // Troca de perfil: o que o sino mostrava era do perfil anterior (permissões e "lido").
  const perfilAnterior = useRef(perfilId);
  useEffect(() => {
    if (perfilAnterior.current === perfilId) return;
    perfilAnterior.current = perfilId;
    geracao.current += 1;
    setAvisos([]);
    setNaoLidosPortal(0);
    setPortalMaiorId(0);
    // O "visto" do perfil novo já foi carregado por useVistoDoSino (efeito declarado antes deste).
    avisosVistos.current = null;
    avisosCarregadosOk.current = false;
    ultimoVisto.current = null;
    setAberto(false);
    void verificarRef.current();
  }, [perfilId]);

  useEffect(() => {
    void verificar();
    const timer = window.setInterval(() => void verificar(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [verificar]);

  const atualizarEncaixe = useCallback(() => {
    const alvo = botao.current;
    if (!alvo) return;
    setEncaixe(encaixePainelNotificacoes(alvo.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    }));
  }, []);

  useLayoutEffect(() => {
    if (!aberto) return;
    atualizarEncaixe();
    window.addEventListener("resize", atualizarEncaixe);
    window.addEventListener("scroll", atualizarEncaixe, true);
    return () => {
      window.removeEventListener("resize", atualizarEncaixe);
      window.removeEventListener("scroll", atualizarEncaixe, true);
    };
  }, [aberto, atualizarEncaixe]);

  // Fecha ao clicar fora ou com Esc, como os menus do app.
  useEffect(() => {
    if (!aberto) return;
    // O que já está no painel não precisa continuar cobrindo a tela como aviso.
    notificados.current.forEach((id) => toast.dismiss(id));
    notificados.current = [];
    errosAbertos.current.forEach((id) => toast.dismiss(`${PREFIXO_TOAST_ERRO}${id}`));
    const fora = (event: MouseEvent) => {
      const alvo = event.target as Node;
      if (raiz.current?.contains(alvo) || painel.current?.contains(alvo)) return;
      setAberto(false);
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
        ref={botao}
        type="button"
        variant="ghost"
        size="icon"
        className={cn("relative h-10 w-10 rounded-lg", aberto && "bg-acc-soft text-acc-soft-foreground hover:bg-acc-soft")}
        onClick={() => (aberto ? setAberto(false) : abrirSino())}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={novos > 0 ? `Notificações: ${novos} nova(s)` : errosNovos > 0 ? "Notificações: erros novos em Sistema" : naoLidos + errosNaoLidos > 0 ? "Notificações (há itens não lidos)" : "Notificações"}
      >
        <Bell className="h-5 w-5" />
        {novos > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-extrabold leading-none text-primary-foreground ring-2 ring-card">
            {novos > 99 ? "99+" : novos}
          </span>
        ) : errosNovos > 0 ? (
          <span aria-hidden="true" title="Há erros novos em Sistema" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-muted-foreground ring-2 ring-card" />
        ) : null}
      </Button>
      {aberto && createPortal(
        <PortalAlertasPainel
          ref={painel}
          erros={erros}
          portalDesligado={portalDesligado}
          avisos={avisos}
          onAbrirAviso={abrirAviso}
          encaixe={encaixe}
          onFechar={() => setAberto(false)}
          onAbrirAtendimento={abrirAtendimento}
          onChanged={() => void verificar()}
        />,
        document.body,
      )}
    </div>
  );
}

/** Avisos: o que a equipe precisa fazer (portal e, depois, avisos internos). Sistema: erros do app. */
type Aba = "avisos" | "sistema";

type Item =
  | { tipo: "portal"; chave: string; quando: string; alerta: AlertaPortal }
  | { tipo: "aviso"; chave: string; quando: string; aviso: AvisoInterno }
  | { tipo: "erro"; chave: string; quando: string; registro: ErroRegistrado };

type PainelProps = {
  erros: ErroRegistrado[];
  portalDesligado?: boolean;
  avisos: AvisoInterno[];
  onAbrirAviso: (aviso: AvisoInterno) => void;
  encaixe: CSSProperties;
  onFechar: () => void;
  onAbrirAtendimento: (equipamentoId: number) => void;
  onChanged: () => void;
};

const ROTULO_ABA: Record<Aba, string> = { avisos: "Avisos", sistema: "Sistema" };

export const PortalAlertasPainel = forwardRef<HTMLDivElement, PainelProps>(function PortalAlertasPainel({ erros, portalDesligado = false, avisos, onAbrirAviso, encaixe, onFechar, onAbrirAtendimento, onChanged }, ref) {
  const [aba, setAba] = useState<Aba>("avisos");
  const [historico, setHistorico] = useState(false);
  const [alertas, setAlertas] = useState<AlertaPortal[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setAlertas((await db.listarAlertasPortal(!historico, historico ? 200 : 100)) ?? []);
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
  const avisosVisiveis = historico ? avisos : avisos.filter((aviso) => !aviso.lido);
  const contagem: Record<Aba, number> = {
    avisos: (portalDesligado ? 0 : alertas.filter((a) => !a.lidoEm).length) + avisos.filter((a) => !a.lido).length,
    sistema: erros.filter((e) => !e.lido).length,
  };

  const itens: Item[] = aba === "avisos"
    ? [
      ...(portalDesligado ? [] : alertas).map((alerta): Item => ({ tipo: "portal", chave: `p-${alerta.id}`, quando: alerta.criadoEm, alerta })),
      ...avisosVisiveis.map((aviso): Item => ({ tipo: "aviso", chave: `a-${aviso.chave}`, quando: aviso.quando ?? "", aviso })),
    ].sort((a, b) => b.quando.localeCompare(a.quando))
    : errosVisiveis
      .map((registro): Item => ({ tipo: "erro", chave: `e-${registro.id}`, quando: registro.erro.timestamp.toISOString(), registro }))
      .sort((a, b) => b.quando.localeCompare(a.quando));

  const marcarAvisos = async (chaves: string[]) => {
    if (chaves.length === 0) return;
    try {
      await db.marcarAvisosLidos(chaves);
      onChanged();
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const marcarTodos = async () => {
    if (aba === "sistema") {
      marcarErrosLidos();
      return;
    }
    await marcarAvisos(avisos.filter((aviso) => !aviso.lido).map((aviso) => aviso.chave));
    if (!portalDesligado) await marcar();
  };
  const haNaoLidos = itens.some((item) => (item.tipo === "portal" ? !item.alerta.lidoEm : item.tipo === "aviso" ? !item.aviso.lido : !item.registro.lido));

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Notificações"
      className="z-[1000000000] flex animate-in fade-in-0 slide-in-from-top-1 duration-padrao ease-saida flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
      style={encaixe}
    >
      <div className="flex items-center justify-between gap-3 pb-1 pl-4 pr-3 pt-3">
        <h2 className="text-base font-extrabold">Notificações</h2>
        <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onFechar} aria-label="Fechar notificações">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-5 border-b px-4" role="tablist" aria-label="Tipo de notificação">
        {(["avisos", "sistema"] as const).map((valor) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={aba === valor}
            onClick={() => setAba(valor)}
            className={cn(
              "-mb-px flex h-10 items-center gap-1.5 border-b-2 text-[13px] font-bold",
              aba === valor ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {ROTULO_ABA[valor]}
            {contagem[valor] > 0 && (
              <span className={cn(
                "rounded-full px-[7px] text-[11px] font-semibold leading-[18px]",
                valor === "sistema" ? "bg-status-bad-bg text-status-bad" : "bg-secondary text-muted-foreground",
              )}>
                {contagem[valor]}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex gap-0.5 rounded-lg border border-border bg-card p-0.5" aria-label="Lidas ou histórico">
          {([false, true] as const).map((valor) => (
            <button
              key={String(valor)}
              type="button"
              aria-pressed={historico === valor}
              onClick={() => setHistorico(valor)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                historico === valor ? "bg-acc-soft text-acc-soft-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {valor ? "Histórico" : "Não lidas"}
            </button>
          ))}
        </div>
        {haNaoLidos && (
          <button type="button" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline" onClick={() => void marcarTodos()}>
            <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {erro && aba === "avisos" && <p className="px-4 py-2 text-sm text-destructive" role="alert">{erro}</p>}
        {loading && itens.length === 0 && <p className="px-4 py-2 text-sm text-muted-foreground">Carregando…</p>}
        {!loading && itens.length === 0 && (
          <p className="border-t px-4 py-10 text-center text-sm text-muted-foreground">
            {historico ? "Nada registrado." : aba === "sistema" ? "Nenhum erro novo." : "Nenhum aviso novo."}
          </p>
        )}
        {itens.map((item) => item.tipo === "portal"
          ? <ItemPortal key={item.chave} alerta={item.alerta} onAbrir={() => void abrir(item.alerta)} onMarcar={() => void marcar(item.alerta.id)} />
          : item.tipo === "aviso"
            ? <ItemAviso key={item.chave} aviso={item.aviso} onAbrir={() => onAbrirAviso(item.aviso)} onMarcar={() => void marcarAvisos([item.aviso.chave])} />
            : <ItemErro key={item.chave} registro={item.registro} />)}
      </div>
      {aba === "avisos" && itens.some((item) => item.tipo === "portal") && (
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          Portal: “confirma às…” significa que o cliente ainda pode desfazer. Só inicie o serviço depois.
        </p>
      )}
    </div>
  );
});

function ItemPortal({ alerta, onAbrir, onMarcar }: { alerta: AlertaPortal; onAbrir: () => void; onMarcar: () => void }) {
  const visual = visualDoAlerta(alerta);
  return (
    <article className={cn("flex gap-3 border-t px-4 py-3.5", alerta.lidoEm && "opacity-[.78]")}>
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]", visual.chip)} aria-hidden="true">
        <visual.Icone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={cn("text-sm leading-snug", alerta.lidoEm ? "font-semibold" : "font-extrabold")}>{alerta.titulo}</h3>
          <span className="flex shrink-0 items-center gap-1.5">
            <time className="text-xs text-muted-foreground" dateTime={alerta.criadoEm}>{quando(alerta.criadoEm)}</time>
            {!alerta.lidoEm && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Não lida" />}
          </span>
        </div>
        {alerta.detalhe && (
          <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{alerta.detalhe}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Portal</span>
          {alerta.equipamentoId && (
            <button type="button" className="text-[13px] font-semibold text-primary hover:underline" onClick={onAbrir}>
              Abrir atendimento
            </button>
          )}
          {!alerta.lidoEm ? (
            <button type="button" className="text-[13px] text-muted-foreground hover:text-foreground hover:underline" onClick={onMarcar}>
              Marcar como lido
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">
              Lido {alerta.lidoPor ? `por ${alerta.lidoPor} ` : ""}{quando(alerta.lidoEm)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function ItemAviso({ aviso, onAbrir, onMarcar }: { aviso: AvisoInterno; onAbrir: () => void; onMarcar: () => void }) {
  const visual = VISUAL_AVISO[aviso.tipo];
  return (
    <article className={cn("flex gap-3 border-t px-4 py-3.5", aviso.lido && "opacity-[.78]")}>
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]", visual.chip)} aria-hidden="true">
        <visual.Icone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={cn("text-sm leading-snug", aviso.lido ? "font-semibold" : "font-extrabold")}>{aviso.titulo}</h3>
          <span className="flex shrink-0 items-center gap-1.5">
            {aviso.quando && <time className="text-xs text-muted-foreground" dateTime={aviso.quando}>{quando(aviso.quando)}</time>}
            {!aviso.lido && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Não lida" />}
          </span>
        </div>
        {aviso.detalhe && <p className="mt-0.5 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{aviso.detalhe}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{visual.rotulo}</span>
          {destinoDoAviso(aviso) && (
            <button type="button" className="text-[13px] font-semibold text-primary hover:underline" onClick={onAbrir}>
              {ROTULO_ABRIR_AVISO[aviso.tipo]}
            </button>
          )}
          {!aviso.lido && (
            <button type="button" className="text-[13px] text-muted-foreground hover:text-foreground hover:underline" onClick={onMarcar}>
              Marcar como lido
            </button>
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
    <article className={cn("flex gap-3 border-t px-4 py-3.5", registro.lido && "opacity-[.78]")}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-status-bad-bg text-status-bad" aria-hidden="true">
        <CircleAlert className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={cn("text-sm leading-snug", registro.lido ? "font-semibold" : "font-extrabold")}>{erro.context} — {erro.action}</h3>
          <span className="flex shrink-0 items-center gap-1.5">
            <time className="text-xs text-muted-foreground" dateTime={erro.timestamp.toISOString()}>{quando(erro.timestamp.toISOString())}</time>
            {!registro.lido && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Não lido" />}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{erro.message}</p>
        {erro.codigo && (
          <p className="mt-1 font-mono text-[11px] text-foreground/80">
            {erro.codigo}{erro.referencia && <span className="text-muted-foreground"> · ref {erro.referencia}</span>}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">AutoOS</span>
          <button type="button" className="flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline" onClick={() => void copiar()}>
            {copiado === "ok" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {/* Os dois rótulos ocupam a mesma célula: trocar de um para o outro não mexe na largura. */}
            <span className="inline-grid">
              <span aria-hidden="true" className="invisible col-start-1 row-start-1">Copiar relatório</span>
              <span className="col-start-1 row-start-1">{copiado === "ok" ? "Copiado" : "Copiar relatório"}</span>
            </span>
          </button>
          {copiado === "falhou" && <span className="text-[11px] text-destructive">Não foi possível copiar.</span>}
          {suporteDisponivel() && (
            <button
              type="button"
              className="flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
              onClick={() => {
                marcarErrosLidos(registro.id);
                enviarErroAoSuporte(formatErrorForCopy(erro, { versao: versaoDoApp() }));
              }}
            >
              <Headphones className="h-3.5 w-3.5" aria-hidden="true" /> Enviar ao suporte
            </button>
          )}
          {!registro.lido && (
            <button type="button" className="text-[13px] text-muted-foreground hover:text-foreground hover:underline" onClick={() => marcarErrosLidos(registro.id)}>
              Marcar como lido
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
