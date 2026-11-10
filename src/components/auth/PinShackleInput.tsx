import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import "./pin-shackle.css";

/**
 * Campo de PIN que é o corpo de um cadeado: a alça fica presa em cima do campo.
 * - `open`: PIN aceito. A alça sobe e gira em torno da perna esquerda; tudo fica verde.
 * - `error`: PIN recusado. A alça dá um puxão e volta, o campo treme e fica vermelho.
 *   `errorCount` muda a cada erro para repetir o puxão.
 * A alça é decorativa; o rótulo e as mensagens continuam no formulário.
 */
export interface PinShackleInputProps extends InputHTMLAttributes<HTMLInputElement> {
  state?: "idle" | "error" | "open";
  errorCount?: number;
}

export const PinShackleInput = forwardRef<HTMLInputElement, PinShackleInputProps>(function PinShackleInput(
  { state = "idle", errorCount = 0, className, ...inputProps },
  ref,
) {
  const errorPhase = state === "error" ? (errorCount % 2 ? "a" : "b") : null;
  return (
    <div
      className={cn("pin-shackle", `pin-shackle--${state}`, errorPhase && `pin-shackle--tug-${errorPhase}`)}
      data-state={state}
    >
      <div className="pin-shackle__lift" aria-hidden="true">
        <svg className="pin-shackle__arc" viewBox="0 0 120 84" width="120" height="84" focusable="false">
          <path d="M16 84 V50 A44 44 0 0 1 104 50 V84" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
      <input
        ref={ref}
        type="password"
        inputMode="numeric"
        className={cn("pin-shackle__body", className)}
        {...inputProps}
      />
    </div>
  );
});
