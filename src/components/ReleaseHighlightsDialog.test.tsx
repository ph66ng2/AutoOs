import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReleaseHighlightsDialog } from "@/components/ReleaseHighlightsDialog";
import { releaseHighlightsStorageKey } from "@/lib/releaseHighlightsKey";

const runtime = vi.hoisted(() => ({
  version: "",
  savedVersion: null as string | null,
  getVersion: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: runtime.getVersion }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@/lib/db", () => ({ db: {
  getSeenReleaseHighlights: runtime.read,
  markReleaseHighlightsSeen: runtime.write,
} }));

let sequence = 0;
describe("ReleaseHighlightsDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    window.localStorage.clear();
    runtime.version = `9.0.${++sequence}`;
    runtime.savedVersion = null;
    runtime.getVersion.mockImplementation(async () => runtime.version);
    runtime.read.mockImplementation(async () => runtime.savedVersion);
    runtime.write.mockImplementation(async () => { runtime.savedVersion = runtime.version; });
  });

  it("usa a versão real e mostra os textos do JSON da 0.6.3", async () => {
    runtime.version = "0.6.3";
    render(<ReleaseHighlightsDialog enabled />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Versão 0.6.3")).toBeInTheDocument();
    for (const text of [
      "Novidades do AutoOS",
      "Confira o que mudou no AutoOS 0.6.3.",
      "As novidades aparecem uma única vez por versão neste computador, mesmo ao fechar o app sem dispensar o aviso.",
      "As próximas versões trazem um resumo das mudanças escrito pela equipe.",
      "Agora dá para desligar os sons da interface em Perfil › Personalizar.",
      "Ao ativar o perfil num computador ou usar \"Esqueci meu PIN\", o cursor já fica no campo do código.",
      "Voltar aos perfis durante a animação do primeiro acesso não fecha mais a janela de perfis.",
    ]) expect(screen.getByText(text)).toBeInTheDocument();
    expect(runtime.getVersion).toHaveBeenCalled();
  });

  it("grava na apresentação e mostra uma vez por versão, mesmo sem dispensar", async () => {
    const first = render(<ReleaseHighlightsDialog enabled />);
    await screen.findByRole("dialog");
    expect(runtime.savedVersion).toBe(runtime.version);
    expect(localStorage.getItem(releaseHighlightsStorageKey(runtime.version))).toBe("seen");
    first.unmount();

    render(<ReleaseHighlightsDialog enabled />);
    await waitFor(() => expect(runtime.getVersion).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(runtime.write).toHaveBeenCalledTimes(1);
  });

  it("não reaparece depois de dispensar nem ao alternar enabled", async () => {
    const view = render(<ReleaseHighlightsDialog enabled />);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Começar a usar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    view.rerender(<ReleaseHighlightsDialog enabled={false} />);
    view.rerender(<ReleaseHighlightsDialog enabled />);
    await waitFor(() => expect(runtime.getVersion).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("volta a mostrar ao instalar uma versão nova, sem exibir o conteúdo antigo", async () => {
    const first = render(<ReleaseHighlightsDialog enabled />);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Começar a usar" }));
    first.unmount();
    runtime.version = `10.0.${sequence}`;

    render(<ReleaseHighlightsDialog enabled />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(`Versão ${runtime.version}`)).toBeInTheDocument();
    expect(screen.getByText("AutoOS atualizado")).toBeInTheDocument();
    expect(screen.queryByText("Portal mais claro")).not.toBeInTheDocument();
    expect(runtime.savedVersion).toBe(runtime.version);
  });

  it("espera a sessão estar pronta", async () => {
    const view = render(<StrictMode><ReleaseHighlightsDialog enabled={false} /></StrictMode>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(runtime.getVersion).not.toHaveBeenCalled();
    view.rerender(<StrictMode><ReleaseHighlightsDialog enabled /></StrictMode>);
    await screen.findByRole("dialog");
    expect(runtime.write).toHaveBeenCalledTimes(1);
  });

  it("registra uma única apresentação mesmo nos efeitos duplicados do StrictMode", async () => {
    render(<StrictMode><ReleaseHighlightsDialog enabled /></StrictMode>);
    await screen.findByRole("dialog");
    expect(runtime.write).toHaveBeenCalledTimes(1);
  });

  it("não grava como visto se for desmontado antes de a leitura terminar", async () => {
    let finish!: (value: string | null) => void;
    runtime.read.mockReturnValue(new Promise<string | null>((resolve) => { finish = resolve; }));
    const view = render(<ReleaseHighlightsDialog enabled />);
    await waitFor(() => expect(runtime.read).toHaveBeenCalled());
    view.unmount();
    await act(async () => { finish(null); });
    expect(runtime.write).not.toHaveBeenCalled();
    expect(localStorage.getItem(releaseHighlightsStorageKey(runtime.version))).toBeNull();
  });

  it("continua dispensável e não repete na sessão quando os dois storages falham", async () => {
    runtime.read.mockRejectedValue(new Error("disk"));
    runtime.write.mockRejectedValue(new Error("disk"));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage"); });
    const view = render(<ReleaseHighlightsDialog enabled />);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Fechar novidades" }));
    view.unmount();
    render(<ReleaseHighlightsDialog enabled />);
    await waitFor(() => expect(runtime.getVersion).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
