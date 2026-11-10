import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./bmi-tag-opening.css";

/**
 * Abertura "leitura de tag".
 *
 * O QR da marca aparece, é lido uma vez, e o enquadramento se abre até mostrar a
 * logo inteira com o nome da solução. A coreografia (tempos, curvas, posições)
 * está em `bmi-tag-opening.css` e documentada em `docs/ABERTURA_BMITAG.md`.
 *
 * A logo não é redesenhada: cada parte é um recorte retangular do PNG oficial
 * (`public/bmi-tag-logo.png`), posicionado nas coordenadas do próprio arquivo.
 */

/** Duração da abertura de marca, do primeiro quadro até a assinatura assentar. */
export const OPENING_INTRO_MS = 1500;
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
  qr: [500, 144, 172, 174],
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
  /** Nome da solução exibido como assinatura (ex.: "AutoOS", "AutoBO"). */
  product: string;
  /**
   * `true` quando a interface já pode entrar. A abertura nunca termina antes
   * disso e nunca segura um app pronto além da própria duração.
   */
  ready?: boolean;
  /** Chamado uma única vez, quando a saída terminou e a abertura pode ser desmontada. */
  onFinished?: () => void;
  /** Conteúdo discreto mostrado abaixo da assinatura se a carga passar da abertura. */
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
  product,
  ready = true,
  onFinished,
  status,
  label,
  logoSrc = "/bmi-tag-logo.png",
  scripted = false,
  className,
}: BmiTagOpeningProps) {
  const [introDone, setIntroDone] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (scripted) return;
    const ms = prefersReducedMotion() ? OPENING_REDUCED_INTRO_MS : OPENING_INTRO_MS;
    const t = window.setTimeout(() => setIntroDone(true), ms);
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
        <div className="bto-lockup" role="img" aria-label={label ?? `${product}, BMI TAG`}>
          <div className="bto-logo" aria-hidden="true">
            <Part name="b" />
            <Part name="m" />
            <Part name="i" />
            <Part name="t" />
            <Part name="a" />
            <Part name="g" />
            <Part name="qr">
              <span className="bto-qr-confirm" style={partStyle("qr")} />
              <span className="bto-scan" />
            </Part>
          </div>
          <div className="bto-signature" aria-hidden="true">
            <span className="bto-rule" />
            <span className="bto-product">{product}</span>
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
