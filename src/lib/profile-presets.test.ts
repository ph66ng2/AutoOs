import { describe, expect, it } from "vitest";
import {
  PERMISSION_DETAILS,
  PREPARE_QUOTES_NOS_MODELOS,
  PROFILE_PRESETS,
  montarPresets,
} from "@/lib/profile-presets";
import { perfilCompativel056 } from "@/lib/compatibilidade-056";
import { SENSITIVE_PERMISSION_LABELS } from "@/types";

describe("permissão MANAGE_STATUS_LINKS", () => {
  it("descreve acessos sem permitir desligar o portal", () => {
    expect(PERMISSION_DETAILS.MANAGE_STATUS_LINKS.title).toBe("Acessos do portal");
    expect(PERMISSION_DETAILS.MANAGE_STATUS_LINKS.description).toMatch(/portal/i);
    expect(SENSITIVE_PERMISSION_LABELS.MANAGE_STATUS_LINKS).toMatch(/acessos do portal/);
    expect(SENSITIVE_PERMISSION_LABELS.MANAGE_STATUS_LINKS).not.toMatch(/links públicos/);
  });
});

describe("PREPARE_QUOTES nos modelos", () => {
  const find = (list: ReturnType<typeof montarPresets>, role: string) =>
    list.find((p) => p.role === role)!;

  it("flag ligada e modelos exportados a refletem", () => {
    expect(PREPARE_QUOTES_NOS_MODELOS).toBe(true);
    expect(find(PROFILE_PRESETS, "TECNICO").permissions).toEqual(["STOCK_CONTROL", "PREPARE_QUOTES", "MANAGE_STATUS_LINKS"]);
    expect(find(PROFILE_PRESETS, "TECNICO").description).toBe("Rotina técnica, orçamentos e estoque.");
    expect(find(PROFILE_PRESETS, "FINANCEIRO").permissions).toContain("PREPARE_QUOTES");
    expect(find(PROFILE_PRESETS, "ATENDENTE").disponivel).toBe(true);
  });

  it("com a flag desligada, Técnico e Financeiro ficam sem PREPARE_QUOTES", () => {
    const off = montarPresets(false);
    expect(find(off, "TECNICO").permissions).toEqual(["STOCK_CONTROL", "MANAGE_STATUS_LINKS"]);
    expect(find(off, "TECNICO").description).toBe("Rotina técnica e estoque.");
    expect(find(off, "FINANCEIRO").permissions).not.toContain("PREPARE_QUOTES");
  });

  it("com a flag ligada, Técnico e Financeiro incluem PREPARE_QUOTES", () => {
    const on = montarPresets(true);
    expect(find(on, "TECNICO").permissions).toEqual(["STOCK_CONTROL", "PREPARE_QUOTES", "MANAGE_STATUS_LINKS"]);
    expect(find(on, "TECNICO").description).toBe("Rotina técnica, orçamentos e estoque.");
    expect(find(on, "FINANCEIRO").permissions).toContain("PREPARE_QUOTES");
  });

  it("Administrador sempre tem PREPARE_QUOTES", () => {
    expect(find(montarPresets(false), "ADMIN").permissions).toContain("PREPARE_QUOTES");
  });
});

describe("trava de compatibilidade 0.5.6 nos modelos", () => {
  const find = (list: ReturnType<typeof montarPresets>, role: string) =>
    list.find((p) => p.role === role)!;

  it("Recepção indisponível com motivo e sem permissão alguma", () => {
    const recepcao = find(montarPresets(false, true), "ATENDENTE");
    expect(recepcao.disponivel).toBe(false);
    expect(recepcao.motivoIndisponivel).toBeTruthy();
    expect(recepcao.permissions).toEqual([]);
  });

  it("todo modelo disponível (exceto Personalizado, que a tela impede de salvar vazio) é compatível", () => {
    for (const preset of montarPresets(false, true)) {
      if (!preset.disponivel || preset.role === "CUSTOM") continue;
      expect(perfilCompativel056(preset.role, preset.permissions, true).ok).toBe(true);
    }
    for (const preset of PROFILE_PRESETS) {
      if (preset.disponivel && preset.role !== "CUSTOM") {
        expect(perfilCompativel056(preset.role, preset.permissions).ok).toBe(true);
      }
    }
  });

  it("com a trava desligada Recepção volta a ficar disponível", () => {
    const recepcao = find(montarPresets(false, false), "ATENDENTE");
    expect(recepcao.disponivel).toBe(true);
    expect(recepcao.motivoIndisponivel).toBeUndefined();
  });
});


describe("modelos de acessos do portal", () => {
  it("Recepção, Técnico e Financeiro recebem acessos, sem comunicação externa", () => {
    for (const role of ["ATENDENTE", "TECNICO", "FINANCEIRO"]) {
      const preset = PROFILE_PRESETS.find((item) => item.role === role)!;
      expect(preset.permissions).toContain("MANAGE_STATUS_LINKS");
      expect(preset.permissions).not.toContain("COMMUNICATION_SETTINGS");
    }
    expect(PROFILE_PRESETS.find((item) => item.role === "ADMIN")!.permissions).toContain("COMMUNICATION_SETTINGS");
  });
});
