import { describe, expect, it } from "vitest";
import { imagensDaAreaDeTransferencia } from "@/lib/equipamento-imagem-utils";

const item = (kind: string, type: string, arquivo: File | null) => ({ kind, type, getAsFile: () => arquivo }) as unknown as DataTransferItem;

describe("imagensDaAreaDeTransferencia", () => {
  const agora = new Date("2026-11-21T14:05:09.123Z");

  it("pega só as imagens e dá nome com carimbo", () => {
    const png = new File(["a"], "image.png", { type: "image/png" });
    const jpg = new File(["b"], "image.jpeg", { type: "image/jpeg" });
    const arquivos = imagensDaAreaDeTransferencia({ items: [item("string", "text/plain", null), item("file", "image/png", png), item("file", "image/jpeg", jpg)] as unknown as DataTransferItemList }, agora);
    expect(arquivos.map((a) => a.name)).toEqual(["colada-20261121-140509.png", "colada-20261121-140509-2.jpg"]);
    expect(arquivos.map((a) => a.type)).toEqual(["image/png", "image/jpeg"]);
  });

  it("sem imagem, não intercepta a colagem", () => {
    const pdf = new File(["c"], "a.pdf", { type: "application/pdf" });
    expect(imagensDaAreaDeTransferencia({ items: [item("string", "text/plain", null), item("file", "application/pdf", pdf)] as unknown as DataTransferItemList }, agora)).toEqual([]);
    expect(imagensDaAreaDeTransferencia(null, agora)).toEqual([]);
  });
});
