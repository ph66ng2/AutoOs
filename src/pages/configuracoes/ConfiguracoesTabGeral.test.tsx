import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "@/components/ui/tabs";

vi.mock("@/components/UpdateChecker", () => ({ UpdateChecker: () => <p>painel de versão</p> }));

const m = vi.hoisted(() => ({
  status: null as null | { unlocked: boolean; active_profile_id: number; profiles: { id: number; tema: string | null }[] },
  refreshStatus: vi.fn(async () => undefined),
  saveTheme: vi.fn(),
  setTheme: vi.fn(),
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ status: m.status, refreshStatus: m.refreshStatus }) }));
vi.mock("@/lib/sensitive-access", () => ({ SensitiveAccessService: { saveTheme: m.saveTheme } }));
vi.mock("next-themes", () => ({ useTheme: () => ({ setTheme: m.setTheme }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { ConfiguracoesTabGeral } from "./ConfiguracoesTabGeral";

function renderizar(conectado = true) {
  return render(
    <MemoryRouter>
      <Tabs value="geral">
        <ConfiguracoesTabGeral conectado={conectado} />
      </Tabs>
    </MemoryRouter>,
  );
}

describe("ConfiguracoesTabGeral", () => {
  beforeEach(() => {
    localStorage.clear();
    m.status = null;
    m.saveTheme.mockReset().mockResolvedValue({});
    m.setTheme.mockReset();
    m.refreshStatus.mockClear();
    document.documentElement.style.fontSize = "";
    delete document.documentElement.dataset.movimento;
    delete document.documentElement.dataset.densidade;
  });

  it("tamanho do texto muda a escala do app e fica guardado neste computador", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("radio", { name: "Maior" }));
    expect(document.documentElement.style.fontSize).toBe("125%");
    expect(localStorage.getItem("autoos:tamanho-texto")).toBe("maior");
    await user.click(screen.getByRole("radio", { name: "Normal" }));
    expect(document.documentElement.style.fontSize).toBe("100%");
    expect(localStorage.getItem("autoos:tamanho-texto")).toBeNull();
  });

  it("listas compactas marcam o documento e ficam neste computador", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("radio", { name: "Compactas" }));
    expect(document.documentElement.dataset.densidade).toBe("compacta");
    expect(localStorage.getItem("autoos:densidade")).toBe("compacta");
    await user.click(screen.getByRole("radio", { name: "Confortáveis" }));
    expect(document.documentElement.dataset.densidade).toBeUndefined();
    expect(localStorage.getItem("autoos:densidade")).toBeNull();
  });

  it("reduzir animações marca o documento", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("checkbox", { name: "Reduzir animações" }));
    expect(document.documentElement.dataset.movimento).toBe("reduzido");
    await user.click(screen.getByRole("checkbox", { name: "Reduzir animações" }));
    expect(document.documentElement.dataset.movimento).toBeUndefined();
  });

  it("sons, aviso do Windows e tela inicial ficam no localStorage", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("checkbox", { name: "Sons da interface" }));
    expect(localStorage.getItem("autoos:ui-sounds")).toBe("off");
    await user.click(screen.getByRole("checkbox", { name: "Avisar no Windows" }));
    expect(localStorage.getItem("autoos:avisos-windows")).toBe("off");
    await user.click(screen.getByRole("radio", { name: "Equipamentos" }));
    expect(localStorage.getItem("autoos:tela-inicial")).toBe("equipamentos");
  });

  it("no modo Balcão some a escolha da tela inicial", async () => {
    localStorage.setItem("autoos_app_mode", "counter");
    renderizar();
    expect(screen.queryByRole("radiogroup", { name: "Abrir o app em" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Balcão" })).toHaveAttribute("aria-checked", "true");
  });

  it("tema só aparece com a sessão aberta e salva no perfil", async () => {
    const user = userEvent.setup();
    const { unmount } = renderizar();
    expect(screen.queryByRole("radiogroup", { name: "Tema" })).toBeNull();
    unmount();

    m.status = { unlocked: true, active_profile_id: 7, profiles: [{ id: 7, tema: "dark" }] };
    renderizar();
    expect(screen.getByRole("radio", { name: "Escuro" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "Sistema" }));
    expect(m.setTheme).toHaveBeenCalledWith("system");
    expect(m.saveTheme).toHaveBeenCalledWith("system");
    expect(m.refreshStatus).toHaveBeenCalled();
  });

  it("se salvar o tema falhar, volta ao anterior", async () => {
    const user = userEvent.setup();
    m.status = { unlocked: true, active_profile_id: 7, profiles: [{ id: 7, tema: "light" }] };
    m.saveTheme.mockRejectedValue(new Error("Sem conexão"));
    renderizar();
    await user.click(screen.getByRole("radio", { name: "Escuro" }));
    expect(m.setTheme).toHaveBeenLastCalledWith("light");
    expect(screen.getByRole("radio", { name: "Claro" })).toHaveAttribute("aria-checked", "true");
  });

  it("depois de salvar, o controle segue o tema do perfil ativo (troca de perfil sem sair da tela)", async () => {
    const user = userEvent.setup();
    m.status = { unlocked: true, active_profile_id: 7, profiles: [{ id: 7, tema: "light" }, { id: 8, tema: "light" }] };
    const { rerender } = renderizar();
    await user.click(screen.getByRole("radio", { name: "Escuro" }));
    m.status = { unlocked: true, active_profile_id: 8, profiles: [{ id: 7, tema: "dark" }, { id: 8, tema: "light" }] };
    rerender(
      <MemoryRouter>
        <Tabs value="geral">
          <ConfiguracoesTabGeral conectado />
        </Tabs>
      </MemoryRouter>,
    );
    expect(screen.getByRole("radio", { name: "Claro" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "Escuro" }));
    expect(m.saveTheme).toHaveBeenLastCalledWith("dark");
    expect(m.saveTheme).toHaveBeenCalledTimes(2);
  });

  it("mostra a conexão sem endereço nem credencial", () => {
    renderizar(false);
    expect(screen.getByText("Sem conexão com o servidor")).toBeInTheDocument();
    expect(screen.getByText("painel de versão")).toBeInTheDocument();
  });
});
