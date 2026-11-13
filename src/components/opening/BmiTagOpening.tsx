import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./bmi-tag-opening.css";

/**
 * Abertura "leitura de tag".
 *
 * As duas barras da marca nascem juntas, como um bloco, e se abrem. A leitura
 * imprime o QR entre elas. Só então o enquadramento recua, BMI sai de trás da
 * barra e TAG desce. A logo fica sozinha, no centro. A coreografia (tempos, curvas,
 * posições) está em `bmi-tag-opening.css` e em `docs/ABERTURA_BMITAG.md`.
 *
 * Letras e QR são recortes retangulares do PNG oficial (`public/bmi-tag-logo.png`),
 * nas coordenadas do próprio arquivo. As duas barras são retângulos com o degradê
 * medido no PNG: no arquivo elas ficam parcialmente atrás do QR, então o recorte
 * não serve enquanto o QR ainda não apareceu.
 */

/** Duração da abertura de marca, do primeiro quadro até a logo completa assentar. */
export const OPENING_INTRO_MS = 2450;
/** Duração da saída (crossfade para a interface). */
export const OPENING_EXIT_MS = 300;
/** Com movimento reduzido só há um fade curto da marca completa. */
export const OPENING_REDUCED_INTRO_MS = 220;
/** Tempo de espera, depois da abertura, antes de mostrar `status` em carga lenta. */
export const OPENING_STATUS_DELAY_MS = 900;

/** Retângulos (x, y, largura, altura) de cada parte, em pixels do PNG 819×655. */
const PARTS = {
  b: [69, 144, 147, 174],
  m: [228, 144, 187, 174],
  i: [436, 144, 51, 174],
  card: [518, 162, 135, 132],
  t: [237, 328, 144, 147],
  a: [385, 328, 146, 147],
  g: [552, 328, 145, 147],
} as const;

type PartName = keyof typeof PARTS;

function partStyle(name: PartName): CSSProperties {
  const [x, y, w, h] = PARTS[name];
  return { "--x": x, "--y": y, "--pw": w, "--ph": h } as CSSProperties;
}

function Part({ name, children }: { name: PartName; children?: ReactNode }) {
  return (
    <span className={`bto-part bto-part--${name}`} style={partStyle(name)}>
      {children}
    </span>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export interface BmiTagOpeningProps {
  /**
   * `true` quando a interface já pode entrar. A abertura nunca termina antes
   * disso e nunca segura um app pronto além da própria duração.
   */
  ready?: boolean;
  /** Chamado uma única vez, quando a saída terminou e a abertura pode ser desmontada. */
  onFinished?: () => void;
  /** Chamado uma única vez, quando a logo terminou de se montar (antes da saída). */
  onIntroDone?: () => void;
  /** Conteúdo discreto mostrado perto da base da tela se a carga passar da abertura. */
  status?: ReactNode;
  /** Texto para leitores de tela. */
  label?: string;
  /** Caminho do PNG oficial da marca. */
  logoSrc?: string;
  /**
   * Modo de demonstração: a saída entra na mesma linha do tempo em CSS e nenhum
   * temporizador roda. Quem controla o tempo é a página de avaliação.
   */
  scripted?: boolean;
  className?: string;
}

export function BmiTagOpening({
  ready = true,
  onFinished,
  onIntroDone,
  status,
  label = "BMI TAG",
  logoSrc = "/bmi-tag-logo.png",
  scripted = false,
  className,
}: BmiTagOpeningProps) {
  const [introDone, setIntroDone] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const finishedRef = useRef(false);
  const introNotifiedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  const onIntroDoneRef = useRef(onIntroDone);
  useEffect(() => {
    onFinishedRef.current = onFinished;
    onIntroDoneRef.current = onIntroDone;
  }, [onFinished, onIntroDone]);

  useEffect(() => {
    if (scripted) return;
    const ms = prefersReducedMotion() ? OPENING_REDUCED_INTRO_MS : OPENING_INTRO_MS;
    const t = window.setTimeout(() => {
      setIntroDone(true);
      if (introNotifiedRef.current) return;
      introNotifiedRef.current = true;
      onIntroDoneRef.current?.();
    }, ms);
    return () => window.clearTimeout(t);
  }, [scripted]);

  const exiting = !scripted && introDone && ready;
  const waiting = !scripted && introDone && !ready;

  useEffect(() => {
    if (!exiting) return;
    const t = window.setTimeout(() => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinishedRef.current?.();
    }, OPENING_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [exiting]);

  useEffect(() => {
    if (!waiting) {
      setShowStatus(false);
      return;
    }
    const t = window.setTimeout(() => setShowStatus(true), OPENING_STATUS_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [waiting]);

  const rootClass = [
    "bto-root",
    scripted ? "bto-root--scripted" : "",
    exiting ? "bto-root--exiting" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClass}
      style={{ "--bto-logo": `url("${logoSrc}")` } as CSSProperties}
      data-testid="bmi-tag-opening"
    >
      <div className="bto-camera">
        <div className="bto-lockup" role="img" aria-label={label}>
          <div className="bto-logo" aria-hidden="true">
            <div className="bto-row bto-row--bmi">
              <div className="bto-row__inner">
                <Part name="b" />
                <Part name="m" />
                <Part name="i" />
              </div>
            </div>
            <div className="bto-row bto-row--tag">
              <div className="bto-row__inner">
                <Part name="t" />
                <Part name="a" />
                <Part name="g" />
              </div>
            </div>
            <div className="bto-symbol">
              <span className="bto-bar bto-bar--l" />
              <span className="bto-bar bto-bar--r" />
              <Part name="card" />
              <span className="bto-scan" />
            </div>
          </div>
        </div>
      </div>
      {status != null && (
        <div className={`bto-status${showStatus ? " bto-status--visible" : ""}`} role="status">
          {showStatus ? status : null}
        </div>
      )}
    </div>
  );
}
