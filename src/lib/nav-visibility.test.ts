import { describe, expect, it } from "vitest";
import { navItemVisible } from "@/lib/nav-visibility";
import { SENSITIVE_PERMISSIONS } from "@/types";

const configuracoes = {
  permission: [SENSITIVE_PERMISSIONS.MANAGE_PROFILES, SENSITIVE_PERMISSIONS.CONFIG_WHATSAPP],
  showWhenLocked: true,
};
const gastos = { permission: SENSITIVE_PERMISSIONS.VIEW_EXPENSES };

describe("navItemVisible", () => {
  it("item sem permissão aparece sempre", () => {
    expect(navItemVisible({}, null)).toBe(true);
    expect(navItemVisible({}, { unlocked: false, permissions: [] })).toBe(true);
  });

  it("sessão bloqueada: item showWhenLocked continua visível mesmo com permissions vazio", () => {
    expect(navItemVisible(configuracoes, { unlocked: false, permissions: [] })).toBe(true);
    expect(navItemVisible(configuracoes, null)).toBe(true);
  });

  it("sessão bloqueada: item sem showWhenLocked segue escondido", () => {
    expect(navItemVisible(gastos, { unlocked: false, permissions: [] })).toBe(false);
  });

  it("desbloqueado: volta a valer o filtro por permissão", () => {
    expect(navItemVisible(configuracoes, { unlocked: true, permissions: [SENSITIVE_PERMISSIONS.CONFIG_WHATSAPP] })).toBe(true);
    expect(navItemVisible(configuracoes, { unlocked: true, permissions: [SENSITIVE_PERMISSIONS.VIEW_EXPENSES] })).toBe(false);
    expect(navItemVisible(gastos, { unlocked: true, permissions: [SENSITIVE_PERMISSIONS.VIEW_EXPENSES] })).toBe(true);
  });
});
