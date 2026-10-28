import { useEffect, useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CounterSessionGate } from "@/components/CounterSessionGate";
import { CounterLayout } from "@/components/CounterLayout";

const access = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    loading: false,
    unlocked: true,
  };
  return {
    state,
    openProfileSelector: vi.fn(async () => true),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify() {
      listeners.forEach((listener) => listener());
    },
    lock() {
      state.unlocked = false;
      this.notify();
    },
    unlock() {
      state.unlocked = true;
      this.notify();
    },
    reset() {
      state.loading = false;
      state.unlocked = true;
      listeners.clear();
      this.openProfileSelector.mockClear();
    },
  };
});

vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => {
    const [, setRevision] = useState(0);
    useEffect(() => access.subscribe(() => setRevision((n) => n + 1)), []);
    return {
      loading: access.state.loading,
      status: {
        active_profile_id: 1,
        active_profile_name: "Atendente",
        unlocked: access.state.unlocked,
        pin_configured: true,
      },
      openProfileSelector: access.openProfileSelector,
      lockSensitiveAccess: async () => access.lock(),
    };
  },
}));

function renderBalcao() {
  return render(
    <MemoryRouter initialEntries={["/balcao"]}>
      <Routes>
        <Route
          element={(
            <CounterSessionGate>
              <CounterLayout onChangeMode={vi.fn()} />
            </CounterSessionGate>
          )}
        >
          <Route path="/balcao" element={<div>Atendimento do balcão</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("cadeado do Modo Balcão", () => {
  beforeEach(() => {
    access.reset();
  });

  it("abre o seletor de PIN ao clicar no cadeado e não deixa o balcão visível", async () => {
    const user = userEvent.setup();
    renderBalcao();

    expect(screen.getByText("Atendimento do balcão")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bloquear acesso" }));

    expect(await screen.findByText("Aguardando autenticação da sessão…")).toBeInTheDocument();
    expect(screen.queryByText("Atendimento do balcão")).not.toBeInTheDocument();
    await waitFor(() => expect(access.openProfileSelector).toHaveBeenCalled());
  });

  it("volta ao balcão depois de desbloquear a sessão", async () => {
    const user = userEvent.setup();
    renderBalcao();

    await user.click(screen.getByRole("button", { name: "Bloquear acesso" }));
    expect(await screen.findByText("Aguardando autenticação da sessão…")).toBeInTheDocument();

    access.unlock();

    expect(await screen.findByText("Atendimento do balcão")).toBeInTheDocument();
    expect(screen.queryByText("Aguardando autenticação da sessão…")).not.toBeInTheDocument();
  });
});
