import { describe, expect, it } from "vitest";
import { telefoneExibicaoCliente } from "./cliente-display-utils";

describe("telefoneExibicaoCliente", () => {
  it("mostra traço quando o telefone veio NULL ou em branco", () => {
    expect(telefoneExibicaoCliente(null)).toBe("—");
    expect(telefoneExibicaoCliente(undefined)).toBe("—");
    expect(telefoneExibicaoCliente("")).toBe("—");
    expect(telefoneExibicaoCliente("   ")).toBe("—");
  });

  it("formata o número quando existe", () => {
    expect(telefoneExibicaoCliente("7133224455")).toBe("(71) 3322-4455");
  });
});
