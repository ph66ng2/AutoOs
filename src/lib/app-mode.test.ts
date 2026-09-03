import { afterEach, describe, expect, it } from "vitest";
import { getAppMode, setAppMode } from "@/lib/app-mode";

afterEach(() => localStorage.clear());

describe("modo da aplicação", () => {
  it("não assume um modo antes da escolha", () => {
    expect(getAppMode()).toBeNull();
  });

  it("persiste somente os modos suportados nesta máquina", () => {
    setAppMode("counter");
    expect(getAppMode()).toBe("counter");
    localStorage.setItem("autoos_app_mode", "invalid");
    expect(getAppMode()).toBeNull();
  });
});
