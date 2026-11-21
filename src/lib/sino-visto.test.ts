import { beforeEach, describe, expect, it } from "vitest";
import { contarNovos, lerVistos, marcarVistos } from "@/lib/sino-visto";

describe("sino visto", () => {
  beforeEach(() => localStorage.clear());

  it("abrir marca as não lidas de agora como vistas; só o que chega depois conta", () => {
    let vistos = lerVistos(7);
    expect(contarNovos(["aviso:a", "portal:1"], vistos)).toBe(2);
    vistos = marcarVistos(7, vistos, ["aviso:a", "portal:1"]);
    expect(contarNovos(["aviso:a", "portal:1"], vistos)).toBe(0);
    expect(contarNovos(["aviso:a", "portal:1", "aviso:b"], vistos)).toBe(1);
  });

  it("guarda por perfil, neste computador", () => {
    marcarVistos(7, new Set(), ["aviso:a"]);
    expect(lerVistos(7).has("aviso:a")).toBe(true);
    expect(lerVistos(8).has("aviso:a")).toBe(false);
    expect(lerVistos(null).size).toBe(0);
  });
});
