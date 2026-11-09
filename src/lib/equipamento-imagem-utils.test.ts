import { describe, expect, it } from "vitest";
import { imagensPersistidasIguais, type EquipamentoImagemDraft } from "@/lib/equipamento-imagem-utils";

function foto(overrides: Partial<EquipamentoImagemDraft> = {}): EquipamentoImagemDraft {
  return {
    local_id: "draft-1",
    id: 10,
    categoria: "ENTRADA",
    filename: "frente.jpg",
    mime_type: "image/jpeg",
    tamanho_bytes: 123,
    largura: 800,
    altura: 600,
    ordem: 0,
    observacao: "frente",
    storage_path: "data:image/jpeg;base64,conteudo",
    preview_url: "blob:preview-1",
    ...overrides,
  };
}

describe("imagensPersistidasIguais", () => {
  it("ignora IDs locais e URLs de preview", () => {
    expect(imagensPersistidasIguais(
      [foto({ local_id: "novo", id: undefined, preview_url: "blob:novo" })],
      [foto()],
    )).toBe(true);
  });

  it("detecta campos persistidos diferentes, inclusão, remoção e ordem", () => {
    const original = [foto(), foto({ local_id: "draft-2", id: 11, filename: "verso.jpg", ordem: 1 })];
    expect(imagensPersistidasIguais([original[0]], original)).toBe(false);
    expect(imagensPersistidasIguais([...original, foto({ local_id: "draft-3", filename: "extra.jpg" })], original)).toBe(false);
    expect(imagensPersistidasIguais([
      original[1],
      original[0],
    ], original)).toBe(false);
    expect(imagensPersistidasIguais([foto({ observacao: "outra legenda" })], [foto()])).toBe(false);
  });

  it("trata ordem entre categorias como independente", () => {
    const entrada = foto();
    const saida = foto({ local_id: "draft-saida", categoria: "SAIDA", filename: "saida.jpg" });
    expect(imagensPersistidasIguais([entrada, saida], [saida, entrada])).toBe(true);
  });
});
