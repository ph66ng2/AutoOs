import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BmiTagOpening } from "@/components/opening/BmiTagOpening";
import "./opening-demo.css";

/**
 * Página de avaliação da abertura. Não faz parte do app.
 *
 * As animações são as mesmas do componente (CSS). Aqui elas ficam pausadas e um
 * relógio próprio define o tempo de todas, para permitir pausa, câmera lenta e
 * inspeção quadro a quadro.
 */

/** Fim da linha do tempo demonstrada: abertura (2600) + pausa (600) + saída (340). */
const TIMELINE_MS = 3540;
/** No modo loop, espera na interface antes de recomeçar. */
const LOOP_REST_MS = 900;

const DESKTOP_SIZES = [
  { id: "notebook", label: "Notebook 1280×800", w: 1280, h: 800 },
  { id: "reduzida", label: "Janela 900×600", w: 900, h: 600 },
] as const;

const MOBILE_SIZES = [
  { id: "320", label: "320", w: 320, h: 693 },
  { id: "390", label: "390", w: 390, h: 844 },
  { id: "430", label: "430", w: 430, h: 932 },
] as const;

const PRODUCTS = ["AutoOS", "AutoBO"] as const;

const MARKS = [
  { t: 300, label: "Bloco" },
  { t: 700, label: "Barras abertas" },
  { t: 950, label: "Leitura" },
  { t: 1280, label: "Confirmação" },
  { t: 1800, label: "Recuo" },
  { t: 2100, label: "BMI e TAG" },
  { t: 2600, label: "Assinatura" },
  { t: 3340, label: "Interface" },
] as const;

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="od-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="od-seg__btn"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Mantém a tela simulada no tamanho real e reduz por escala uniforme para caber. */
function Viewport({
  w,
  h,
  maxHeight,
  kind,
  children,
}: {
  w: number;
  h: number;
  maxHeight: number;
  kind: "desktop" | "mobile";
  children: ReactNode;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const fit = () => {
      const available = slot.clientWidth;
      if (available > 0) setScale(Math.min(1, available / w, maxHeight / h));
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(slot);
    return () => ro.disconnect();
  }, [w, h, maxHeight]);

  return (
    <div className="od-slot" ref={slotRef}>
      <div className={`od-device od-device--${kind}`} style={{ width: w * scale, height: h * scale }}>
        <div className="od-screen" style={{ width: w, height: h, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Interface neutra, só para mostrar a transição. Sem conteúdo que dispute atenção. */
function PlaceholderApp({ kind }: { kind: "desktop" | "mobile" }) {
  return (
    <div className={`od-app od-app--${kind}`} aria-hidden="true">
      <div className="od-app__nav">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="od-app__main">
        <div className="od-app__title" />
        <div className="od-app__line" />
        <div className="od-app__line od-app__line--short" />
        <div className="od-app__panel" />
      </div>
    </div>
  );
}

export function OpeningDemo() {
  const [product, setProduct] = useState<(typeof PRODUCTS)[number]>("AutoOS");
  const [desktop, setDesktop] = useState<(typeof DESKTOP_SIZES)[number]["id"]>("notebook");
  const [mobile, setMobile] = useState<(typeof MOBILE_SIZES)[number]["id"]>("390");
  const [speed, setSpeed] = useState<"1" | "0.25">("1");
  const [loop, setLoop] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef(0);
  const speedRef = useRef(1);
  const loopRef = useRef(false);
  speedRef.current = Number(speed);
  loopRef.current = loop;

  /** Aplica o tempo do relógio a todas as animações da abertura e da interface simulada. */
  const applyTime = useCallback((t: number) => {
    const stage = stageRef.current;
    if (!stage || typeof stage.getAnimations !== "function") return;
    const clamped = Math.min(t, TIMELINE_MS);
    for (const animation of stage.getAnimations({ subtree: true })) {
      if (animation.playState !== "paused") animation.pause();
      animation.currentTime = clamped;
    }
  }, []);

  const seek = useCallback(
    (t: number) => {
      clockRef.current = t;
      setTime(Math.min(t, TIMELINE_MS));
      applyTime(t);
    },
    [applyTime],
  );

  // Trocar produto ou tamanho recria elementos: reaplica o tempo atual antes da pintura.
  useLayoutEffect(() => {
    applyTime(clockRef.current);
  });

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = clockRef.current + (now - last) * speedRef.current;
      last = now;
      if (next >= TIMELINE_MS + (loopRef.current ? LOOP_REST_MS : 0)) {
        if (loopRef.current) {
          seek(0);
        } else {
          seek(TIMELINE_MS);
          setPlaying(false);
          return;
        }
      } else {
        seek(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, seek]);

  const replay = () => {
    seek(0);
    setPlaying(true);
  };

  const togglePlay = () => {
    if (!playing && clockRef.current >= TIMELINE_MS) seek(0);
    setPlaying((p) => !p);
  };

  const desktopSize = DESKTOP_SIZES.find((s) => s.id === desktop) ?? DESKTOP_SIZES[0];
  const mobileSize = MOBILE_SIZES.find((s) => s.id === mobile) ?? MOBILE_SIZES[1];

  return (
    <main className="od-page">
      <header className="od-head">
        <h1>Abertura BMI TAG</h1>
        <p>Leitura de tag. Protótipo para avaliação, fora do fluxo de inicialização do app.</p>
      </header>

      <section className="od-controls" aria-label="Controles da demonstração">
        <div className="od-controls__row">
          <button type="button" className="od-btn od-btn--primary" onClick={replay}>
            Repetir
          </button>
          <button type="button" className="od-btn" onClick={togglePlay}>
            {playing ? "Pausar" : "Continuar"}
          </button>
          <Segmented
            label="Velocidade"
            value={speed}
            onChange={setSpeed}
            options={[
              { id: "1", label: "Normal" },
              { id: "0.25", label: "Câmera lenta" },
            ]}
          />
          <Segmented
            label="Solução"
            value={product}
            onChange={setProduct}
            options={PRODUCTS.map((p) => ({ id: p, label: p }))}
          />
          <label className="od-check" htmlFor="od-loop">
            <input
              id="od-loop"
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
            />
            Loop
          </label>
        </div>

        <div className="od-scrub">
          <input
            id="od-progress"
            type="range"
            min={0}
            max={TIMELINE_MS}
            step={10}
            value={Math.round(time)}
            aria-label="Progresso da abertura em milissegundos"
            onChange={(e) => {
              setPlaying(false);
              seek(Number(e.target.value));
            }}
          />
          <output className="od-time" htmlFor="od-progress">
            {(time / 1000).toFixed(2)} s
          </output>
        </div>
        <div className="od-marks">
          {MARKS.map((m) => (
            <button
              key={m.label}
              type="button"
              className="od-mark"
              onClick={() => {
                setPlaying(false);
                seek(m.t);
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <div className="od-stage" ref={stageRef}>
        <figure className="od-figure od-figure--desktop">
          <figcaption>
            <span>Desktop</span>
            <Segmented label="Tamanho da janela" value={desktop} onChange={setDesktop} options={DESKTOP_SIZES} />
          </figcaption>
          <Viewport w={desktopSize.w} h={desktopSize.h} maxHeight={560} kind="desktop">
            <PlaceholderApp kind="desktop" />
            <BmiTagOpening product={product} scripted />
          </Viewport>
        </figure>

        <figure className="od-figure od-figure--mobile">
          <figcaption>
            <span>Mobile</span>
            <Segmented label="Largura da tela" value={mobile} onChange={setMobile} options={MOBILE_SIZES} />
          </figcaption>
          <Viewport w={mobileSize.w} h={mobileSize.h} maxHeight={560} kind="mobile">
            <PlaceholderApp kind="mobile" />
            <BmiTagOpening product={product} scripted />
          </Viewport>
        </figure>
      </div>

      <p className="od-note">
        A visualização mobile valida composição e proporção em telas estreitas. Ela é uma página web, não
        uma prova de compatibilidade com React Native.
      </p>
    </main>
  );
}
