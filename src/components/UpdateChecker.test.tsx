import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyUpdaterError,
  sanitizeUpdateNotes,
  updaterChannelLabel,
  UpdateChecker,
} from "@/components/UpdateChecker";

const { mockIsTauri, mockGetVersion, mockCheck, mockRelaunch } = vi.hoisted(() => ({
  mockIsTauri: vi.fn(() => true),
  mockGetVersion: vi.fn(async () => "0.5.3"),
  mockCheck: vi.fn(async () => null),
  mockRelaunch: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => mockIsTauri(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => mockGetVersion(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => mockCheck(...args),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: () => mockRelaunch(),
}));

function createUpdate(overrides: {
  version?: string;
  currentVersion?: string;
  body?: string;
  downloadAndInstall?: (onEvent?: (event: unknown) => void) => Promise<void>;
} = {}) {
  return {
    version: overrides.version ?? "0.5.4",
    currentVersion: overrides.currentVersion ?? "0.5.3",
    body: overrides.body ?? "Correções de estabilidade",
    downloadAndInstall:
      overrides.downloadAndInstall ??
      (async () => {
        /* no-op */
      }),
  };
}

describe("sanitizeUpdateNotes e classifyUpdaterError", () => {
  it("remove HTML e recusa notas com segredo", () => {
    expect(sanitizeUpdateNotes("<p>Notas <b>seguras</b></p>")).toBe("Notas seguras");
    expect(sanitizeUpdateNotes("url postgres://user:pass@host/db")).toBe("");
  });

  it("mostra o aviso só no canal de homologação", () => {
    expect(updaterChannelLabel(undefined)).toBeNull();
    expect(updaterChannelLabel("production")).toBeNull();
    expect(updaterChannelLabel("homolog")).toMatch(/homologação/i);
    expect(updaterChannelLabel("homolog")).toMatch(/latest/i);
  });

  it("classifica rede, HTTP, manifesto, plataforma, assinatura e instalação", () => {
    expect(classifyUpdaterError(new Error("Failed to fetch"))).toMatch(/rede/i);
    expect(classifyUpdaterError(new Error("HTTP 404"))).toMatch(/HTTP/i);
    expect(classifyUpdaterError(new Error("Unexpected token in JSON"))).toMatch(/inválido/i);
    expect(classifyUpdaterError(new Error("no update for this target"))).toMatch(/plataforma/i);
    expect(classifyUpdaterError(new Error("invalid signature"))).toMatch(/assinatura/i);
    expect(classifyUpdaterError(new Error("install elevation required"))).toMatch(/rejeitada/i);
  });
});

describe("UpdateChecker", () => {
  beforeEach(() => {
    mockIsTauri.mockReturnValue(true);
    mockGetVersion.mockResolvedValue("0.5.3");
    mockCheck.mockReset();
    mockCheck.mockResolvedValue(null);
    mockRelaunch.mockReset();
    mockRelaunch.mockResolvedValue(undefined);
  });

  it("mostra estado indisponível sem runtime Tauri e não chama o plugin", async () => {
    mockIsTauri.mockReturnValue(false);
    render(<UpdateChecker />);
    await waitFor(() =>
      expect(screen.getByText(/indisponível neste ambiente/i)).toBeInTheDocument(),
    );
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("informa versão atualizada somente após consulta bem-sucedida sem update", async () => {
    const user = userEvent.setup();
    render(<UpdateChecker />);
    await waitFor(() => expect(screen.getByText(/Versão instalada: 0\.5\.3/)).toBeInTheDocument());
    expect(screen.queryByText(/versão mais recente/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await waitFor(() =>
      expect(screen.getByText(/versão mais recente após uma consulta bem-sucedida/i)).toBeInTheDocument(),
    );
  });

  it("não trata falha de rede como atualização aplicada", async () => {
    mockCheck.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<UpdateChecker />);
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await waitFor(() => expect(screen.getByText(/Falha de rede/i)).toBeInTheDocument());
    expect(screen.queryByText(/versão mais recente/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeEnabled();
  });

  it("mostra versão, notas e ação explícita quando há update", async () => {
    mockCheck.mockResolvedValue(
      createUpdate({ version: "0.5.4", body: "<p>Notas da 0.5.4</p>" }),
    );
    const user = userEvent.setup();
    render(<UpdateChecker />);
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await waitFor(() => expect(screen.getByText("Nova versão: 0.5.4")).toBeInTheDocument());
    expect(screen.getByText("Notas da 0.5.4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baixar e instalar" })).toBeEnabled();
  });

  it("exibe progresso conhecido e bloqueia cliques repetidos", async () => {
    let resolveDownload: (() => void) | undefined;
    const downloadAndInstall = vi.fn(async (onEvent?: (event: unknown) => void) => {
      onEvent?.({ event: "Started", data: { contentLength: 100 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 40 } });
      await new Promise<void>((resolve) => {
        resolveDownload = resolve;
      });
      onEvent?.({ event: "Finished" });
    });
    mockCheck.mockResolvedValue(createUpdate({ downloadAndInstall }));
    const user = userEvent.setup();
    render(<UpdateChecker />);
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    const installButton = await screen.findByRole("button", { name: "Baixar e instalar" });
    await user.click(installButton);
    await user.click(installButton);
    await waitFor(() => expect(screen.getByText("Baixando 40%")).toBeInTheDocument());
    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    resolveDownload?.();
    await waitFor(() => expect(mockRelaunch).toHaveBeenCalledTimes(1));
  });

  it("usa indicador indeterminado quando o tamanho não é conhecido", async () => {
    let resolveDownload: (() => void) | undefined;
    const downloadAndInstall = vi.fn(async (onEvent?: (event: unknown) => void) => {
      onEvent?.({ event: "Started", data: {} });
      onEvent?.({ event: "Progress", data: { chunkLength: 8 } });
      await new Promise<void>((resolve) => {
        resolveDownload = resolve;
      });
    });
    mockCheck.mockResolvedValue(createUpdate({ downloadAndInstall }));
    const user = userEvent.setup();
    render(<UpdateChecker />);
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await user.click(await screen.findByRole("button", { name: "Baixar e instalar" }));
    await waitFor(() => expect(screen.getByText(/tamanho indeterminado/i)).toBeInTheDocument());
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    resolveDownload?.();
    await waitFor(() => expect(screen.getByRole("button", { name: /Instalando|Baixar e instalar|Tentar novamente/i })).toBeInTheDocument());
  });

  it("impede duas consultas concorrentes", async () => {
    let resolveCheck: ((value: null) => void) | undefined;
    mockCheck.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<UpdateChecker />);
    const button = screen.getByRole("button", { name: "Verificar" });
    await user.click(button);
    await user.click(button);
    expect(mockCheck).toHaveBeenCalledTimes(1);
    resolveCheck?.(null);
    await waitFor(() => expect(screen.getByText(/versão mais recente/i)).toBeInTheDocument());
  });

  it("aceita encerramento do instalador Windows sem depender de relaunch", async () => {
    mockRelaunch.mockRejectedValue(new Error("process already exiting"));
    mockCheck.mockResolvedValue(
      createUpdate({
        downloadAndInstall: async (onEvent?: (event: unknown) => void) => {
          onEvent?.({ event: "Started", data: { contentLength: 10 } });
          onEvent?.({ event: "Finished" });
        },
      }),
    );
    const user = userEvent.setup();
    render(<UpdateChecker />);
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await user.click(await screen.findByRole("button", { name: "Baixar e instalar" }));
    await waitFor(() =>
      expect(screen.getByText(/encerrado o processo/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Última atualização aplicada/i)).not.toBeInTheDocument();
  });

  it("mostra erro de assinatura e permite retry de instalação", async () => {
    const downloadAndInstall = vi.fn(async () => {
      throw new Error("invalid signature");
    });
    mockCheck.mockResolvedValue(createUpdate({ downloadAndInstall }));
    const user = userEvent.setup();
    render(<UpdateChecker />);
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await user.click(await screen.findByRole("button", { name: "Baixar e instalar" }));
    await waitFor(() => expect(screen.getByText(/assinatura da atualização foi rejeitada/i)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(downloadAndInstall).toHaveBeenCalledTimes(2);
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });
});
