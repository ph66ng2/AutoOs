import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SENSITIVE_PERMISSIONS } from "@/types";
import type { SaasOperationalProfile } from "@/types/saas-auth";

vi.mock("@/lib/runtime-mode", () => ({ IS_SAAS_BUILD: true }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";

const adminProfile: SaasOperationalProfile = {
  id: "profile-admin",
  name: "Administrador",
  role: "ADMIN",
  permissions: [],
};

const employeeProfile: SaasOperationalProfile = {
  id: "profile-employee",
  name: "Técnico",
  role: "TECNICO",
  permissions: [],
};

describe("useSensitiveAccess in SaaS", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows SaaS ADMIN profiles to perform sensitive catalog actions without explicit permissions", async () => {
    const { result } = renderHook(() => useSensitiveAccess({ operationalProfile: adminProfile }));

    expect(result.current.status?.permissions).toEqual(Object.values(SENSITIVE_PERMISSIONS));
    expect(result.current.hasPermission(SENSITIVE_PERMISSIONS.STOCK_CONTROL)).toBe(true);
    await act(async () => {
      await expect(result.current.ensureSensitiveAccess({ permission: SENSITIVE_PERMISSIONS.STOCK_CONTROL })).resolves.toBe(true);
      await expect(result.current.ensureSensitiveAccess({ permission: SENSITIVE_PERMISSIONS.DELETE_RECORDS })).resolves.toBe(true);
    });
  });

  it("continues to require explicit permissions for non-admin SaaS profiles", async () => {
    const { result } = renderHook(() => useSensitiveAccess({ operationalProfile: employeeProfile }));

    expect(result.current.hasPermission(SENSITIVE_PERMISSIONS.STOCK_CONTROL)).toBe(false);
    await act(async () => {
      await expect(result.current.ensureSensitiveAccess({ permission: SENSITIVE_PERMISSIONS.STOCK_CONTROL })).resolves.toBe(false);
    });
  });
});
