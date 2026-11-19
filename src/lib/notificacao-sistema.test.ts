import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ concedida: vi.fn(), pedir: vi.fn(), enviar: vi.fn() }));
vi.mock("@tauri-apps/plugin-notification", () => ({ isPermissionGranted: m.concedida, requestPermission: m.pedir, sendNotification: m.enviar }));

import { definirAvisosWindows, notificarSistema } from "./notificacao-sistema";

describe("notificarSistema", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.removeItem("autoos:avisos-windows"); });

  it("com o app na frente não manda nada para o Windows", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    expect(await notificarSistema("Nova OS")).toBe(false);
    expect(m.enviar).not.toHaveBeenCalled();
  });

  it("sem foco manda a notificação, pedindo permissão se preciso", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    m.concedida.mockResolvedValue(false);
    m.pedir.mockResolvedValue("granted");
    expect(await notificarSistema("Nova OS", "Zebra ZD220")).toBe(true);
    expect(m.enviar).toHaveBeenCalledWith({ title: "Nova OS", body: "Zebra ZD220" });
  });

  it("desligado neste computador, não manda", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    definirAvisosWindows(false);
    expect(await notificarSistema("Nova OS")).toBe(false);
    expect(m.concedida).not.toHaveBeenCalled();
  });
});
