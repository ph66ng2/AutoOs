import { expect, it, vi } from "vitest";
import { baixarCsv } from "./exportacao-csv";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
vi.mock("@/lib/db", () => ({ db: {} }));

it("baixa o CSV pelo navegador e libera a URL temporária", async () => {
  vi.useFakeTimers();
  const criarUrl = vi.fn(() => "blob:csv");
  const revogarUrl = vi.fn();
  vi.stubGlobal("URL", Object.assign(class extends URL {}, {
    createObjectURL: criarUrl,
    revokeObjectURL: revogarUrl,
  }));
  const clicar = vi.spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("equipamentos.csv");
      expect(this.href).toBe("blob:csv");
    });
  try {
    expect(await baixarCsv(["a,b"], "equipamentos.csv")).toBe("equipamentos.csv");
    expect(clicar).toHaveBeenCalledOnce();
    expect(criarUrl).toHaveBeenCalledWith(expect.objectContaining({ type: "text/csv;charset=utf-8" }));
    await vi.runAllTimersAsync();
    expect(revogarUrl).toHaveBeenCalledWith("blob:csv");
  } finally {
    clicar.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
