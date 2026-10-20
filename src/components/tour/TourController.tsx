import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { SensitiveAccessService } from "@/lib/sensitive-access";
import { clearTourRequest, onTourRequest, peekTourRequest, requestTour, takeTourRequest } from "@/lib/tour-request";
import { fullTour, pendingTour, type TourKind, type TourStep } from "@/lib/tour-steps";

const CARD_WIDTH = 340;
const CARD_HEIGHT_ESTIMATE = 230;
const GAP = 16;
const TARGET_WAIT_MS = 1200;
const DIALOG_POLL_MS = 400;

/**
 * O tour espera qualquer tela por cima do app: diálogos do Radix (bloqueiam cliques fora deles)
 * e as telas de entrada que não são diálogos, como a escolha de modo, marcadas com
 * `data-blocks-tour`.
 */
export function otherDialogOpen() {
  return document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-blocks-tour]',
  ) !== null;
}

type Rect = { left: number; top: number; width: number; height: number };

function findTarget(target: string | undefined): Rect | null {
  if (!target) return null;
  const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const pad = 6;
  return { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
}

function cardPosition(rect: Rect | null) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampTop = (top: number) => Math.min(Math.max(top, GAP), vh - CARD_HEIGHT_ESTIMATE - GAP);
  const clampLeft = (left: number) => Math.min(Math.max(left, GAP), vw - CARD_WIDTH - GAP);
  if (!rect) return { left: (vw - CARD_WIDTH) / 2, top: Math.max(GAP, (vh - CARD_HEIGHT_ESTIMATE) / 2) };
  if (rect.left + rect.width + GAP + CARD_WIDTH < vw) {
    return { left: rect.left + rect.width + GAP, top: clampTop(rect.top) };
  }
  if (rect.top + rect.height + GAP + CARD_HEIGHT_ESTIMATE < vh) {
    return { left: clampLeft(rect.left + rect.width - CARD_WIDTH), top: rect.top + rect.height + GAP };
  }
  return { left: clampLeft(rect.left + rect.width - CARD_WIDTH), top: clampTop(rect.top - CARD_HEIGHT_ESTIMATE - GAP) };
}

/**
 * Tour guiado sobre as telas reais. Abre sozinho quando o perfil ganhou
 * permissões desde o último tour; o tour completo é oferecido (não imposto)
 * a quem nunca viu. Pular ou concluir grava as permissões como vistas.
 */
export function TourController() {
  const { status, refreshStatus } = useSensitiveAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const [run, setRun] = useState<{ kind: TourKind; steps: TourStep[] } | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [offer, setOffer] = useState(false);
  const [requestPending, setRequestPending] = useState(() => peekTourRequest() !== null);
  const checkedStateRef = useRef<string | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const activeProfile = status?.profiles.find((profile) => profile.id === status.active_profile_id) ?? null;
  const unlocked = Boolean(status?.unlocked);
  const permissions = status?.permissions ?? [];

  const begin = useCallback((kind: TourKind) => {
    if (!status?.unlocked || !activeProfile) return;
    const steps = kind === "completo"
      ? fullTour(status.permissions)
      : pendingTour(status.permissions, activeProfile.tour_permissoes_vistas)?.steps ?? [];
    if (steps.length === 0) return;
    setOffer(false);
    setIndex(0);
    setRun({ kind, steps });
  }, [activeProfile, status]);

  // Pedido de tour (ou oferta) só aparece quando nenhum outro diálogo ou tela de entrada está
  // aberto, como o resumo da versão ou a escolha de modo. O pedido continua guardado fora do
  // componente até lá. Se algo abrir durante o tour, o tour some e volta quando fechar.
  const [offerQueued, setOfferQueued] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const watching = Boolean(requestPending || offerQueued || run || offer);
  useEffect(() => {
    if (!watching) return;
    const tick = () => {
      const dialogOpen = otherDialogOpen();
      setBlocked(dialogOpen);
      if (dialogOpen || !unlocked) return;
      if (requestPending) {
        const kind = takeTourRequest();
        setRequestPending(false);
        setOfferQueued(false);
        if (kind) begin(kind);
      } else if (offerQueued) {
        setOffer(true);
        setOfferQueued(false);
      }
    };
    tick();
    const id = window.setInterval(tick, DIALOG_POLL_MS);
    return () => window.clearInterval(id);
  }, [begin, offerQueued, requestPending, unlocked, watching]);

  const finish = useCallback(async () => {
    setRun(null);
    setOffer(false);
    setRect(null);
    try {
      await SensitiveAccessService.markTourSeen();
      await refreshStatus();
    } catch {
      // Sem registro, o tour volta a ser oferecido no próximo acesso. Nada a corrigir agora.
    }
  }, [refreshStatus]);

  // Pedidos de outras telas (primeiro acesso, Perfil › Tutorial) e das novidades abaixo.
  useEffect(() => onTourRequest(() => setRequestPending(true)), []);

  // Verificação automática. Reavalia sempre que o perfil, as permissões ou o que o tour já
  // mostrou mudarem: liberar uma permissão a quem está com a sessão aberta (neste ou em outro
  // computador) faz o tour de novidades aparecer sem trocar de perfil nem reiniciar o app.
  const seenPermissions = activeProfile?.tour_permissoes_vistas;
  const permissionsKey = permissions.join(",");
  const seenKey = seenPermissions == null ? "-" : seenPermissions.join(",");
  useEffect(() => {
    if (!unlocked || !activeProfile || activeProfile.onboarding_pendente || run) return;
    const stateKey = `${activeProfile.id}|${permissionsKey}|${seenKey}`;
    if (checkedStateRef.current === stateKey) return;
    checkedStateRef.current = stateKey;
    const pending = pendingTour(permissions, seenPermissions);
    if (!pending) return;
    if (pending.kind === "novidades") requestTour("novidades");
    else setOfferQueued(true);
  }, [activeProfile, permissions, permissionsKey, run, seenKey, seenPermissions, unlocked]);

  // Sessão bloqueada interrompe o tour sem registrar nada e descarta pedidos pendentes.
  useEffect(() => {
    if (!unlocked) {
      setRun(null);
      setOffer(false);
      setOfferQueued(false);
      setRequestPending(false);
      clearTourRequest();
    }
  }, [unlocked]);

  const step = run?.steps[index] ?? null;

  useEffect(() => {
    if (step?.route && location.pathname !== step.route) navigate(step.route);
  }, [location.pathname, navigate, step]);

  useLayoutEffect(() => {
    if (!step) return;
    let frame = 0;
    const startedAt = performance.now();
    const locate = () => {
      const found = findTarget(step.target);
      setRect(found);
      if (!found && step.target && performance.now() - startedAt < TARGET_WAIT_MS) {
        frame = requestAnimationFrame(locate);
      }
    };
    locate();
    const onResize = () => setRect(findTarget(step.target));
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [step, location.pathname]);

  useEffect(() => {
    if (!run) return;
    primaryRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") void finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, run, index]);

  const spring = reduceMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 260, damping: 30 };
  const isLast = run ? index === run.steps.length - 1 : false;
  const position = cardPosition(rect);

  return createPortal(
    <>
      <AnimatePresence>
        {offer && !run && !blocked && (
          <motion.div
            role="dialog"
            aria-labelledby="tour-oferta-titulo"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="pointer-events-auto fixed bottom-6 right-6 z-[70] w-[340px] rounded-2xl border bg-card p-5 text-card-foreground shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <h2 id="tour-oferta-titulo" className="font-semibold">Conheça o AutoOS em 2 minutos</h2>
                <p className="mt-1 text-sm text-muted-foreground">Um tour pelas telas liberadas para o seu perfil.</p>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => void finish()} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => void finish()}>Agora não</Button>
              <Button size="sm" onClick={() => begin("completo")}>Ver tour</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {run && step && !blocked && (
        <div className="pointer-events-auto fixed inset-0 z-[70]">
          {rect ? (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-xl"
              style={{ boxShadow: "0 0 0 4px rgba(255,255,255,0.9), 0 0 0 9999px rgba(8,10,15,0.62)" }}
              initial={false}
              animate={rect}
              transition={spring}
            />
          ) : (
            <div aria-hidden="true" className="absolute inset-0 bg-[rgba(8,10,15,0.62)]" />
          )}

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-titulo"
            className="absolute flex flex-col gap-3 rounded-2xl border bg-card p-5 text-card-foreground shadow-2xl"
            style={{ width: CARD_WIDTH }}
            initial={false}
            animate={position}
            transition={spring}
          >
            <div className="flex items-center justify-between">
              <span className={run.kind === "novidades" ? "text-xs font-semibold tracking-wide text-amber-600 dark:text-amber-400" : "text-xs font-semibold tracking-wide text-primary"}>
                {run.kind === "novidades" ? "NOVO NO SEU PERFIL" : `PASSO ${index + 1} DE ${run.steps.length}`}
              </span>
              <button type="button" onClick={() => void finish()} className="text-sm text-muted-foreground hover:text-foreground">
                Pular tour
              </button>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step.id}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="space-y-2"
              >
                <h2 id="tour-titulo" className="text-lg font-bold">{step.title}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </motion.div>
            </AnimatePresence>
            <div className="mt-1 flex items-center justify-between">
              <div className="flex gap-1.5" aria-label={`Passo ${index + 1} de ${run.steps.length}`}>
                {run.steps.map((item, dot) => (
                  <span key={item.id} className={dot === index ? "h-1.5 w-[18px] rounded-full bg-primary transition-all" : "h-1.5 w-1.5 rounded-full bg-border transition-all"} />
                ))}
              </div>
              <div className="flex gap-2">
                {index > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setIndex(index - 1)}>Voltar</Button>
                )}
                <Button ref={primaryRef} size="sm" onClick={() => (isLast ? void finish() : setIndex(index + 1))}>
                  {isLast ? (run.kind === "novidades" ? "Entendi" : "Concluir") : "Próximo"}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </>,
    document.body,
  );
}
