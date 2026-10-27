import { describe, expect, it } from "vitest";
import {
  PERMISSION_DETAILS,
  PREPARE_QUOTES_NOS_MODELOS,
  PROFILE_PRESETS,
  montarPresets,
} from "@/lib/profile-presets";
import { SENSITIVE_PERMISSION_LABELS } from "@/types";

describe("permissão MANAGE_STATUS_LINKS", () => {
  it("cita o Portal do Cliente além dos links de acompanhamento", () => {
    expect(PERMISSION_DETAILS.MANAGE_STATUS_LINKS.title).toMatch(/Portal do Cliente/);
    expect(PERMISSION_DETAILS.MANAGE_STATUS_LINKS.description).toMatch(/portal/i);
    expect(SENSITIVE_PERMISSION_LABELS.MANAGE_STATUS_LINKS).toMatch(/Portal do Cliente/);
    expect(SENSITIVE_PERMISSION_LABELS.MANAGE_STATUS_LINKS).not.toMatch(/links públicos/);
  });
});

describe("PREPARE_QUOTES nos modelos", () => {
  const find = (list: ReturnType<typeof montarPresets>, role: string) =>
    list.find((p) => p.role === role)!;

  it("flag desligada na 0.5.6 e modelos exportados a refletem", () => {
    expect(PREPARE_QUOTES_NOS_MODELOS).toBe(false);
    expect(find(PROFILE_PRESETS, "TECNICO").permissions).toEqual(["STOCK_CONTROL"]);
    expect(find(PROFILE_PRESETS, "TECNICO").description).toBe("Rotina técnica e estoque.");
    expect(find(PROFILE_PRESETS, "FINANCEIRO").permissions).not.toContain("PREPARE_QUOTES");
  });

  it("com a flag ligada, Técnico e Financeiro incluem PREPARE_QUOTES", () => {
    const on = montarPresets(true);
    expect(find(on, "TECNICO").permissions).toEqual(["STOCK_CONTROL", "PREPARE_QUOTES"]);
    expect(find(on, "TECNICO").description).toBe("Rotina técnica, orçamentos e estoque.");
    expect(find(on, "FINANCEIRO").permissions).toContain("PREPARE_QUOTES");
  });

  it("Administrador sempre tem PREPARE_QUOTES", () => {
    expect(find(montarPresets(false), "ADMIN").permissions).toContain("PREPARE_QUOTES");
  });
});
