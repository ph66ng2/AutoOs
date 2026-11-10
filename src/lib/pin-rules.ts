/**
 * Regras de um PIN **novo** (criar ou trocar). Conferir um PIN já salvo não usa estas
 * regras: PINs antigos, como 1234, continuam valendo. O backend aplica as mesmas regras
 * em `validate_new_pin` (`src-tauri/src/commands/auth.rs`).
 */
export type PinRuleId = "tamanho" | "repetido" | "sequencia" | "confere";

export const PIN_RULES: ReadonlyArray<{ id: PinRuleId; label: string }> = [
  { id: "tamanho", label: "De 4 a 8 números" },
  { id: "repetido", label: "Números não são todos iguais (1111)" },
  { id: "sequencia", label: "Não é sequência (1234, 4321)" },
  { id: "confere", label: "Os dois PINs são iguais" },
];

function todosIguais(pin: string) {
  return pin.split("").every((digito) => digito === pin[0]);
}

function sequencia(pin: string) {
  const d = pin.split("").map(Number);
  const sobe = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
  const desce = d.every((v, i) => i === 0 || v === d[i - 1] - 1);
  return sobe || desce;
}

export function avaliarPinNovo(pin: string, confirmacao: string): Record<PinRuleId, boolean> {
  const tamanho = /^\d{4,8}$/.test(pin);
  return {
    tamanho,
    repetido: tamanho && !todosIguais(pin),
    sequencia: tamanho && !sequencia(pin),
    confere: tamanho && confirmacao.length > 0 && pin === confirmacao,
  };
}

/** Mensagem da primeira regra não cumprida, ou `null` se o PIN pode ser criado. */
export function erroPinNovo(pin: string, confirmacao: string): string | null {
  const regras = avaliarPinNovo(pin, confirmacao);
  if (!regras.tamanho) return "O PIN deve ter de 4 a 8 dígitos.";
  if (!regras.repetido) return "O PIN não pode ter todos os números iguais (como 1111).";
  if (!regras.sequencia) return "O PIN não pode ser uma sequência (como 1234 ou 4321).";
  if (!regras.confere) return "Os PINs não conferem.";
  return null;
}
