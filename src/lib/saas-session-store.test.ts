import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

import { tauriSaasSessionStore } from "@/lib/saas-session-store";
import type { SaasSession } from "@/types/saas-auth";

const session: SaasSession = {
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: 1_900_000_000,
  identity: {
    userId: "a0000000-0000-4000-8000-000000000001",
    companyId: "b0000000-0000-4000-8000-000000000001",
    profileId: "c0000000-0000-4000-8000-000000000001",
    email: "admin@example.com",
  },
};

describe("tauriSaasSessionStore", () => {
  beforeEach(() => mockInvoke.mockReset());

  it("persiste a sessão sanitizada em uma única chamada atômica", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await tauriSaasSessionStore.save(session);
    expect(mockInvoke).toHaveBeenCalledWith("salvar_sessao_saas", { session });
  });

  it("carrega e remove somente pelo keyring Tauri", async () => {
    mockInvoke.mockResolvedValueOnce(session).mockResolvedValueOnce(undefined);
    await expect(tauriSaasSessionStore.load()).resolves.toEqual(session);
    await tauriSaasSessionStore.clear();
    expect(mockInvoke).toHaveBeenNthCalledWith(1, "carregar_sessao_saas");
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "remover_sessao_saas");
  });
});
