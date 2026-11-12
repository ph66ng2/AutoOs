import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrimeiroAcessoWizard } from "./PrimeiroAcessoWizard";
import type { SecurityProfile, SensitiveAccessStatus } from "@/types";

const service = vi.hoisted(() => ({ redeemAccessCode: vi.fn(), savePersonalization: vi.fn() }));
const sounds = vi.hoisted(() => ({ playUiSound: vi.fn() }));
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/lib/sensitive-access", () => ({ SensitiveAccessService: service }));
vi.mock("@/lib/ui-sounds", () => sounds);
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => motion.reduced,
}));

const ready: SecurityProfile = {
  id: 7, nome: "Juliana", role: "ATENDENTE", permissions: [], pin_configured: true, pin_required: true, is_default: false, ativo: true, onboarding_pendente: true,
};
const status: SensitiveAccessStatus = {
  pin_configured: true, unlocked: true, active_profile_id: 7, active_profile_name: "Juliana", active_role: "ATENDENTE",
  permissions: [], can_manage_profiles: false, profiles: [{ ...ready, onboarding_pendente: false }],
};

async function finishProfile() {
  const user = userEvent.setup();
  render(<PrimeiroAcessoWizard profile={ready} needsCode={false} onStatusChange={vi.fn()} onCancel={vi.fn()} onFinish={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /Continuar/ }));
  expect(await screen.findByRole("heading", { name: "Tudo pronto, Juliana" }, { timeout: 3000 })).toBeInTheDocument();
  // O som de conclusão sai 180 ms depois de salvar.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
}

describe("som de conclusão do primeiro acesso", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    service.savePersonalization.mockResolvedValue(status);
  });

  it("toca 'pronto' ao concluir", async () => {
    motion.reduced = false;
    await finishProfile();
    expect(sounds.playUiSound).toHaveBeenCalledWith("pronto");
  });

  it("com movimento reduzido, não toca 'pronto'", async () => {
    motion.reduced = true;
    await finishProfile();
    expect(sounds.playUiSound).not.toHaveBeenCalled();
  });
});
