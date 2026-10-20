import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TourController } from "./TourController";
import { clearTourRequest, requestTour } from "@/lib/tour-request";
import type { SecurityProfile, SensitiveAccessStatus, SensitivePermission } from "@/types";

const hookState = vi.hoisted(() => ({ status: null as SensitiveAccessStatus | null }));
const service = vi.hoisted(() => ({ markTourSeen: vi.fn() }));

vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ status: hookState.status, refreshStatus: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("@/lib/sensitive-access", () => ({ SensitiveAccessService: service }));

function statusFor(permissions: SensitivePermission[], seen: SensitivePermission[] | null): SensitiveAccessStatus {
  const profile: SecurityProfile = {
    id: 3,
    nome: "Ivan",
    role: "TECNICO",
    permissions,
    pin_configured: true,
    pin_required: true,
    is_default: false,
    ativo: true,
    onboarding_pendente: false,
    tour_permissoes_vistas: seen,
  };
  return {
    pin_configured: true,
    unlocked: true,
    active_profile_id: 3,
    active_profile_name: "Ivan",
    active_role: "TECNICO",
    permissions,
    can_manage_profiles: false,
    profiles: [profile],
  };
}

function renderTour() {
  return render(<MemoryRouter><TourController /></MemoryRouter>);
}

describe("TourController", () => {
  beforeEach(() => {
    clearTourRequest();
    service.markTourSeen.mockReset().mockResolvedValue(undefined);
    hookState.status = statusFor(["VIEW_EXPENSES"], ["VIEW_EXPENSES"]);
  });
  afterEach(() => {
    document.querySelectorAll("[data-blocks-tour]").forEach((element) => element.remove());
    clearTourRequest();
  });

  it("não mostra nada quando o perfil já viu tudo o que pode fazer", () => {
    renderTour();
    expect(screen.queryByText(/NOVO NO SEU PERFIL|PASSO 1 DE/)).not.toBeInTheDocument();
  });

  it("abre o tour de novidades quando uma permissão chega na mesma sessão, sem trocar de perfil", async () => {
    const { rerender } = renderTour();
    expect(screen.queryByText("NOVO NO SEU PERFIL")).not.toBeInTheDocument();

    // O administrador liberou Estoque para quem já estava com a sessão aberta.
    hookState.status = statusFor(["VIEW_EXPENSES", "STOCK_CONTROL"], ["VIEW_EXPENSES"]);
    rerender(<MemoryRouter><TourController /></MemoryRouter>);

    expect(await screen.findByText("NOVO NO SEU PERFIL")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Estoque" })).toBeInTheDocument();
  });

  it("espera a escolha de modo (tela que não é diálogo) antes de começar", async () => {
    const selector = document.createElement("div");
    selector.setAttribute("data-blocks-tour", "true");
    document.body.appendChild(selector);

    renderTour();
    act(() => requestTour("completo"));
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(screen.queryByText(/PASSO 1 DE/)).not.toBeInTheDocument();

    selector.remove();
    expect(await screen.findByText(/PASSO 1 DE/, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("o pedido não se perde se o layout desmontar antes (Modo Balcão) e vale ao voltar", async () => {
    const selector = document.createElement("div");
    selector.setAttribute("data-blocks-tour", "true");
    document.body.appendChild(selector);

    const first = renderTour();
    act(() => requestTour("completo"));
    first.unmount(); // a pessoa escolheu Balcão: o Layout sai de cena
    selector.remove();

    renderTour(); // voltou ao AutoOS Completo
    expect(await screen.findByText(/PASSO 1 DE/, {}, { timeout: 3000 })).toBeInTheDocument();
  });
});
