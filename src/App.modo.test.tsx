import { act, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppModeRedirect } from "@/App";
import { getAppMode, pedirModoAoNavegar, setAppMode, type AppMode } from "@/lib/app-mode";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("@/pages/Dashboard", () => ({ default: () => null }));
vi.mock("@/pages/Equipamentos", () => ({ default: () => null }));
vi.mock("@/pages/Clientes", () => ({ default: () => null }));
vi.mock("@/pages/Insumos", () => ({ default: () => null }));
vi.mock("@/pages/Servicos", () => ({ default: () => null }));
vi.mock("@/pages/Gastos", () => ({ default: () => null }));
vi.mock("@/pages/Configuracoes", () => ({ default: () => null }));
vi.mock("@/pages/Perfil", () => ({ default: () => null }));
vi.mock("@/pages/Balcao", () => ({ default: () => null }));
vi.mock("@/poc/PowerSyncPOC", () => ({ default: () => null }));

/** Mesmo laço do AppContent: o modo vem do evento `autoos:app-mode`. */
function Cenario() {
  const [modo, setModo] = useState<AppMode | null>(() => getAppMode());
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const sincronizar = (event: Event) => setModo((event as CustomEvent<AppMode>).detail);
    window.addEventListener("autoos:app-mode", sincronizar);
    return () => window.removeEventListener("autoos:app-mode", sincronizar);
  }, []);
  return (
    <>
      <output aria-label="rota">{location.pathname}</output>
      <output aria-label="estado">{JSON.stringify(location.state ?? null)}</output>
      <button onClick={() => navigate("/balcao", { state: pedirModoAoNavegar("counter") })}>Ir ao Balcão</button>
      <button onClick={() => navigate("/balcao")}>Ir ao Balcão sem pedido</button>
      <AppModeRedirect mode={modo} ready />
    </>
  );
}

function abrir() {
  return render(<MemoryRouter initialEntries={["/equipamentos/1/editar"]}><Cenario /></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  setAppMode("standard");
});

describe("troca para o Modo Balcão pela navegação", () => {
  it("sem navegar (saída cancelada no aviso), o modo continua o completo", () => {
    abrir();
    expect(getAppMode()).toBe("standard");
    expect(screen.getByLabelText("rota")).toHaveTextContent("/equipamentos/1/editar");
  });

  it("ao chegar com o pedido, grava o modo Balcão, fica no Balcão e tira o pedido do histórico", async () => {
    abrir();
    await act(async () => { screen.getByRole("button", { name: "Ir ao Balcão" }).click(); });
    expect(getAppMode()).toBe("counter");
    expect(screen.getByLabelText("rota")).toHaveTextContent("/balcao");
    expect(screen.getByLabelText("estado")).toHaveTextContent("null");
  });

  it("no modo completo, chegar ao Balcão sem o pedido continua voltando para o Início", async () => {
    abrir();
    await act(async () => { screen.getByRole("button", { name: "Ir ao Balcão sem pedido" }).click(); });
    expect(getAppMode()).toBe("standard");
    expect(screen.getByLabelText("rota")).toHaveTextContent("/");
    expect(screen.getByLabelText("rota")).not.toHaveTextContent("/balcao");
  });
});
