import { useLayoutEffect, useRef } from "react";
import { playUiSound } from "@/lib/ui-sounds";
import "./first-access-bridge.css";

/** Duração do voo do avatar até o cadeado. */
export const FIRST_ACCESS_BRIDGE_MS = 720;

function reducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface FirstAccessBridgeProps {
  /** Avatar tracejado do perfil, na tela de perfis. */
  from: HTMLElement;
  /** Janela de perfis, que se dissolve enquanto o avatar se solta. */
  dialog: HTMLElement | null;
  /** Chamado uma vez, quando o cadeado pousou (ou na hora, se não houver animação). */
  onDone: () => void;
}

/**
 * Ponte entre escolher um perfil novo e o primeiro acesso: o avatar tracejado sai da grade,
 * viaja até o lugar do cadeado e se fecha no corpo dele; a tela nova se abre em círculo a
 * partir do cadeado e o conteúdo entra em seguida. Só no primeiro acesso de perfil novo.
 */
export function FirstAccessBridge({ from, dialog, onDone }: FirstAccessBridgeProps) {
  const clone = useRef<HTMLDivElement>(null);
  const dashed = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useLayoutEffect(() => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      doneRef.current();
    };
    const wizard = document.querySelector<HTMLElement>("[data-first-access-wizard]");
    const lock = wizard?.querySelector<HTMLElement>(".pin-lock__body") ?? null;
    const lockRoot = wizard?.querySelector<HTMLElement>(".pin-lock") ?? null;
    const node = clone.current;
    if (!wizard || !lock || !lockRoot || !node || reducedMotion() || typeof node.animate !== "function") {
      finish();
      return;
    }

    const start = from.getBoundingClientRect();
    const end = lock.getBoundingClientRect();
    const box = (r: DOMRect, radius: number) => ({
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: `${radius}px`,
    });
    const ms = FIRST_ACCESS_BRIDGE_MS;
    const animations: Animation[] = [];
    const run = (el: Element | null | undefined, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      if (el && typeof (el as HTMLElement).animate === "function") animations.push((el as HTMLElement).animate(keyframes, options));
    };

    lockRoot.style.visibility = "hidden";
    from.style.visibility = "hidden";
    playUiSound("abrir", ms);

    const flight = node.animate([box(start, 28), box(end, 24)], { duration: ms, easing: "cubic-bezier(0.65, 0, 0.25, 1)", fill: "forwards" });
    animations.push(flight);
    run(dashed.current, [{ opacity: 1 }, { opacity: 1, offset: 0.25 }, { opacity: 0, offset: 0.7 }, { opacity: 0 }], { duration: ms, fill: "forwards" });
    run(body.current, [{ opacity: 0 }, { opacity: 0, offset: 0.25 }, { opacity: 1, offset: 0.7 }, { opacity: 1 }], { duration: ms, fill: "forwards" });
    // `scale` em vez de `transform`: a janela já usa transform para ficar centralizada.
    run(dialog, [{ opacity: 1, scale: "1" }, { opacity: 0, scale: "0.98", offset: 0.3 }, { opacity: 0, scale: "0.98" }], { duration: ms, easing: "ease-out", fill: "forwards" });

    const cx = end.left + end.width / 2;
    const cy = end.top + end.height / 2;
    const radius = Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy));
    run(wizard, [
      { clipPath: `circle(0px at ${cx}px ${cy}px)` },
      // Com o easing desta animação, 0.12 cai perto de 230 ms: o círculo começa a abrir logo que a
      // janela de perfis termina de sumir (30% de 720 ms), sem vão de fundo vazio.
      { clipPath: `circle(0px at ${cx}px ${cy}px)`, offset: 0.12 },
      { clipPath: `circle(${radius}px at ${cx}px ${cy}px)` },
    ], { duration: ms + 260, easing: "cubic-bezier(0.55, 0, 0.2, 1)", fill: "backwards" });

    const pieces = wizard.querySelectorAll<HTMLElement>("[data-first-access-piece]");
    pieces.forEach((el, index) => run(el, [
      { opacity: 0, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], { duration: 280, delay: ms * 0.75 + index * 45, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "backwards" }));

    flight.finished.then(() => {
      lockRoot.style.visibility = "";
      lockRoot.querySelector<HTMLElement>(".pin-lock__window")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
      finish();
    }).catch(() => undefined);

    return () => {
      lockRoot.style.visibility = "";
      from.style.visibility = "";
      animations.forEach((animation) => {
        // As entradas escalonadas e a abertura em círculo terminam sozinhas; o resto sai com a ponte.
        if (animation.effect && (animation.effect as KeyframeEffect).target === wizard) return;
        if (animation.effect && pieces.length && Array.from(pieces).includes((animation.effect as KeyframeEffect).target as HTMLElement)) return;
        animation.cancel();
      });
      finish();
    };
  }, [from, dialog]);

  return (
    <div aria-hidden="true" className="first-access-bridge">
      <div
        ref={clone}
        className="first-access-bridge__clone"
        style={(() => { const r = from.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()}
      >
        <div ref={dashed} className="first-access-bridge__dashed" />
        <div ref={body} className="first-access-bridge__body" />
      </div>
    </div>
  );
}
