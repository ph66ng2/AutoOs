import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UPDATE_NOTICE_FIRST_CHECK_MS, UPDATE_NOTICE_INTERVAL_MS, UpdateNotice } from "@/components/UpdateNotice";

const { mockIsTauri, mockCheck } = vi.hoisted(() => ({
  mockIsTauri: vi.fn(() => true),
  mockCheck: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => mockIsTauri() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.6.2" }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: (...args: unknown[]) => mockCheck(...args) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: async () => undefined }));

const update = (version = "0.6.3") => ({
  version,
  currentVersion: "0.6.2",
  body: "Notas",
  downloadAndInstall: async () => undefined,
  close: vi.fn(async () => undefined),
});

async function passar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("UpdateNotice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockIsTauri.mockReturnValue(true);
    mockCheck.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("não consulta logo na abertura e avisa quando há versão nova", async () => {
    mockCheck.mockResolvedValue(update());
    render(<UpdateNotice />);
    expect(mockCheck).not.toHaveBeenCalled();
    await passar(UPDATE_NOTICE_FIRST_CHECK_MS);
    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(screen.getByText("AutoOS 0.6.3 disponível")).toBeInTheDocument();
  });

  it("sem atualização ou sem rede, não mostra nada e tenta de novo no intervalo", async () => {
    mockCheck.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(null);
    render(<UpdateNotice />);
    await passar(UPDATE_NOTICE_FIRST_CHECK_MS);
    expect(screen.queryByRole("status")).toBeNull();
    await passar(UPDATE_NOTICE_INTERVAL_MS);
    expect(mockCheck).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("Depois esconde o aviso daquela versão", async () => {
    mockCheck.mockResolvedValue(update());
    render(<UpdateNotice />);
    await passar(UPDATE_NOTICE_FIRST_CHECK_MS);
    fireEvent.click(screen.getByRole("button", { name: "Depois" }));
    expect(screen.queryByText("AutoOS 0.6.3 disponível")).toBeNull();
  });

  it("Ver e atualizar abre o painel de instalação com aviso para salvar o trabalho", async () => {
    mockCheck.mockResolvedValue(update());
    render(<UpdateNotice />);
    await passar(UPDATE_NOTICE_FIRST_CHECK_MS);
    fireEvent.click(screen.getByRole("button", { name: "Ver e atualizar" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Salve o que estiver fazendo/)).toBeInTheDocument();
    await passar(0);
    expect(mockCheck).toHaveBeenCalledTimes(2);
  });

  it("fora do Tauri não consulta", async () => {
    mockIsTauri.mockReturnValue(false);
    render(<UpdateNotice />);
    await passar(UPDATE_NOTICE_FIRST_CHECK_MS);
    expect(mockCheck).not.toHaveBeenCalled();
  });
});
