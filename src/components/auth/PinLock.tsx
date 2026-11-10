import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import "./pin-lock.css";

/**
 * Cadeado de segredo com 4 roletes. Puramente decorativo (`aria-hidden`): o que importa
 * para leitores de tela está no texto do formulário.
 *
 * - `checked`: quantos roletes, da esquerda para a direita, mostram ✓ (0 a 4).
 * - `spin`: contador que muda a cada tecla. Um rolete gira para um número **aleatório**;
 *   o cadeado nunca mostra o PIN digitado.
 * - `shake`: contador que muda a cada erro. O cadeado treme e os roletes giram.
 */
export interface PinLockProps {
  checked?: number;
  spin?: number;
  shake?: number;
  className?: string;
}

const DRUMS = 4;
const CHECK = "check";
type Token = string;

interface DrumState {
  /** Faixa vertical: os 3 primeiros itens são o estado anterior, os 3 últimos o novo. */
  strip: Token[];
  /** Muda a cada giro para reiniciar a animação. 0 = parado, sem animação. */
  id: number;
  delay: number;
}

const randomDigit = () => String(Math.floor(Math.random() * 10));

function randomOtherDigit(current: Token) {
  let next = randomDigit();
  while (next === current) next = randomDigit();
  return next;
}

function staticStrip(value: Token): Token[] {
  return [randomDigit(), value, randomDigit()];
}

/** Gira de `strip` (parado no meio dos 3 últimos) até `to`, passando por alguns números. */
function rollTo(strip: Token[], to: Token, turns: number): Token[] {
  const tail = strip.slice(-3);
  const passing = Array.from({ length: turns }, randomDigit);
  return [...tail, ...passing, to, randomDigit()];
}

function current(strip: Token[]) {
  return strip[strip.length - 2];
}

export function PinLock({ checked = 0, spin = 0, shake = 0, className }: PinLockProps) {
  const target = Math.max(0, Math.min(DRUMS, checked));
  const [drums, setDrums] = useState<DrumState[]>(() =>
    Array.from({ length: DRUMS }, () => ({ strip: staticStrip(randomDigit()), id: 0, delay: 0 })),
  );
  const shownChecked = useRef(0);
  const lastSpin = useRef(spin);
  const lastShake = useRef(shake);
  const nextId = useRef(1);

  // Roletes que viram ✓ ou voltam a número, em sequência.
  useEffect(() => {
    const before = shownChecked.current;
    if (before === target) return;
    shownChecked.current = target;
    setDrums((all) =>
      all.map((drum, index) => {
        const wasChecked = index < before;
        const isChecked = index < target;
        if (wasChecked === isChecked) return drum;
        const order = isChecked ? index - before : before - 1 - index;
        const to = isChecked ? CHECK : randomDigit();
        return { strip: rollTo(drum.strip, to, 5), id: nextId.current++, delay: order * 90 };
      }),
    );
  }, [target]);

  // Uma tecla: um rolete (dos que não estão em ✓) gira para outro número.
  useEffect(() => {
    if (spin === lastSpin.current) return;
    const step = Math.max(spin, lastSpin.current);
    lastSpin.current = spin;
    setDrums((all) => {
      const free = all.map((_, index) => index).filter((index) => index >= shownChecked.current);
      if (free.length === 0) return all;
      const pick = free[(step - 1 + free.length) % free.length];
      return all.map((drum, index) =>
        index === pick
          ? { strip: rollTo(drum.strip, randomOtherDigit(current(drum.strip)), 3), id: nextId.current++, delay: 0 }
          : drum,
      );
    });
  }, [spin]);

  // Erro: todos os roletes livres giram de uma vez.
  useEffect(() => {
    if (shake === lastShake.current) return;
    lastShake.current = shake;
    setDrums((all) =>
      all.map((drum, index) =>
        index < shownChecked.current
          ? drum
          : { strip: rollTo(drum.strip, randomOtherDigit(current(drum.strip)), 6), id: nextId.current++, delay: index * 40 },
      ),
    );
  }, [shake]);

  return (
    <div aria-hidden="true" className={cn("pin-lock", className)}>
      {/* Alternar entre duas classes iguais reinicia o tremor a cada erro sem remontar os roletes. */}
      <div className={cn("pin-lock__body", shake > 0 && (shake % 2 ? "pin-lock__body--shake-a" : "pin-lock__body--shake-b"))}>
        <div className="pin-lock__window">
          {drums.map((drum, index) => (
            <div key={index} className="pin-lock__drum">
              <div
                key={drum.id}
                className={cn("pin-lock__strip", drum.id > 0 && "pin-lock__strip--rolling")}
                style={{ "--rows": drum.strip.length, animationDelay: `${drum.delay}ms` } as React.CSSProperties}
              >
                {drum.strip.map((token, row) => (
                  <span key={row} className="pin-lock__cell">
                    {token === CHECK ? <CheckMark /> : token}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" className="pin-lock__check" focusable="false">
      <path d="M4.5 12.5l4.5 4.5L19.5 6.5" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
