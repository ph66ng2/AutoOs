import { describe, expect, it } from "vitest";
import { preencherMensagem } from "@/lib/mensagens-prontas";

describe("preencherMensagem", () => {
  it("troca os campos conhecidos e deixa os desconhecidos como estão", () => {
    expect(preencherMensagem("Olá, {contato}! O {equipamento} (OS {os}) está pronto. {outro}", { contato: "Ana", equipamento: "Zebra ZD620", os: "10" }))
      .toBe("Olá, Ana! O Zebra ZD620 (OS 10) está pronto. {outro}");
  });

  it("campo sem dado não deixa sobra feia", () => {
    expect(preencherMensagem("Olá, {contato}! O equipamento {equipamento} ({os}) está pronto.", { equipamento: "Zebra" }))
      .toBe("Olá! O equipamento Zebra está pronto.");
  });
});
