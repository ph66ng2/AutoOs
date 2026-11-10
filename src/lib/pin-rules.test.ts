import { describe, expect, it } from "vitest";
import { avaliarPinNovo, erroPinNovo } from "@/lib/pin-rules";

describe("regras de PIN novo", () => {
  it("recusa números todos iguais e sequências, como o backend", () => {
    for (const pin of ["1111", "00000000", "1234", "4321", "56789", "9876", "01234567"]) {
      expect(erroPinNovo(pin, pin), pin).not.toBeNull();
    }
    for (const pin of ["2580", "1357", "2468", "1243", "9012", "11112", "8642"]) {
      expect(erroPinNovo(pin, pin), pin).toBeNull();
    }
  });

  it("explica a primeira regra que falta", () => {
    expect(erroPinNovo("12", "12")).toBe("O PIN deve ter de 4 a 8 dígitos.");
    expect(erroPinNovo("7777", "7777")).toBe("O PIN não pode ter todos os números iguais (como 1111).");
    expect(erroPinNovo("3456", "3456")).toBe("O PIN não pode ser uma sequência (como 1234 ou 4321).");
    expect(erroPinNovo("2580", "2581")).toBe("Os PINs não conferem.");
  });

  it("só marca as regras de conteúdo quando o tamanho já vale", () => {
    expect(avaliarPinNovo("25", "")).toEqual({ tamanho: false, repetido: false, sequencia: false, confere: false });
    expect(avaliarPinNovo("2580", "")).toEqual({ tamanho: true, repetido: true, sequencia: true, confere: false });
    expect(avaliarPinNovo("2580", "2580").confere).toBe(true);
  });
});
