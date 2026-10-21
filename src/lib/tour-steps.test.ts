import { describe, expect, it } from "vitest";
import { SENSITIVE_PERMISSIONS, type SensitivePermission } from "@/types";
import { PERMISSION_TOUR, fullTour, pendingTour } from "./tour-steps";

const ALL = Object.values(SENSITIVE_PERMISSIONS) as SensitivePermission[];

describe("tour por permissão", () => {
  it("toda permissão sensível tem um passo no tour", () => {
    for (const permission of ALL) {
      expect(PERMISSION_TOUR[permission], permission).toBeDefined();
    }
  });

  it("quem nunca viu o tour recebe o tour completo", () => {
    const tour = pendingTour(["VIEW_EXPENSES"], null);
    expect(tour?.kind).toBe("completo");
    expect(tour?.steps.map((step) => step.id)).toEqual(["menu", "equipamentos", "clientes", "servicos", "perfil", "balcao", "gastos"]);
  });

  it("o tour completo inclui o passo do Modo Balcão apontando para o seletor em Perfil", () => {
    expect(fullTour([])).toContainEqual(expect.objectContaining({ id: "balcao", route: "/perfil", target: "perfil-modo" }));
  });

  it("depois de ver o tour, só permissões novas geram passos", () => {
    expect(pendingTour(["VIEW_EXPENSES"], ["VIEW_EXPENSES"])).toBeNull();
    const tour = pendingTour(["VIEW_EXPENSES", "STOCK_CONTROL"], ["VIEW_EXPENSES"]);
    expect(tour?.kind).toBe("novidades");
    expect(tour?.steps.map((step) => step.id)).toEqual(["estoque"]);
  });

  it("permissão retirada não gera tour", () => {
    expect(pendingTour([], ["VIEW_EXPENSES"])).toBeNull();
  });

  it("e-mail e WhatsApp viram um único passo de integrações", () => {
    const ids = fullTour(["CONFIG_SMTP", "CONFIG_WHATSAPP"]).map((step) => step.id);
    expect(ids.filter((id) => id === "integracoes")).toHaveLength(1);
  });
});
