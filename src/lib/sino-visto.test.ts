import { beforeEach, describe, expect, it } from "vitest";
import { contarNovos, lerVistos, marcarVistos } from "@/lib/sino-visto";

describe("sino visto", () => {
  beforeEach(() => localStorage.clear());

  it("abrir marca as não lidas de agora como vistas; só o que chega depois conta", () => {
    let vistos = lerVistos(7);
    expect(contarNovos(["aviso:a"], vistos)).toBe(1);
    vistos = marcarVistos(7, vistos, ["aviso:a"], 0);
    expect(contarNovos(["aviso:a"], vistos)).toBe(0);
    expect(contarNovos(["aviso:a", "aviso:b"], vistos)).toBe(1);
  });

  it("guarda só as pendentes: lida sai, pendente continua vista (sem limite que a expulse)", () => {
    const muitas = Array.from({ length: 800 }, (_, i) => `aviso:${i}`);
    let vistos = marcarVistos(7, lerVistos(7), muitas, 0);
    vistos = marcarVistos(7, vistos, muitas.slice(1), 0);
    expect(vistos.chaves.has("aviso:0")).toBe(false);
    expect(contarNovos(muitas.slice(1), lerVistos(7))).toBe(0);
  });

  it("portal usa marca d'água que só sobe", () => {
    let vistos = marcarVistos(7, lerVistos(7), [], 40);
    expect(lerVistos(7).portalAte).toBe(40);
    vistos = marcarVistos(7, vistos, [], 12);
    expect(vistos.portalAte).toBe(40);
  });

  it("lê o formato antigo (lista de chaves) e tira a marca do portal dele", () => {
    localStorage.setItem("autoos:sino-visto:7", JSON.stringify(["aviso:a", "portal:9", "portal:31"]));
    const vistos = lerVistos(7);
    expect(vistos.portalAte).toBe(31);
    expect([...vistos.chaves]).toEqual(["aviso:a"]);
  });

  it("guarda por perfil, neste computador", () => {
    marcarVistos(7, lerVistos(7), ["aviso:a"], 0);
    expect(lerVistos(7).chaves.has("aviso:a")).toBe(true);
    expect(lerVistos(8).chaves.has("aviso:a")).toBe(false);
    expect(lerVistos(null).chaves.size).toBe(0);
  });
});
