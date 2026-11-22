import { describe, expect, it } from "vitest";
import { destinoNovaEntrada } from "./equipamentos-page-utils";

describe("destino depois de salvar uma nova entrada", () => {
  it.each(["/", "/equipamentos", "/equipamentos/22", "/gastos"])(
    "abre a nova OS a partir de %s",
    (origem) => expect(destinoNovaEntrada(55, origem)).toBe("/equipamentos/55"),
  );

  it.each(["/clientes", "/clientes/10/equipamentos?aba=os"])(
    "volta ao cadastro do cliente em %s",
    (origem) => expect(destinoNovaEntrada(55, origem)).toBe(origem),
  );
});
