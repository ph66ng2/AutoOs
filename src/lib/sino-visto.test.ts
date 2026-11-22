import { beforeEach, describe, expect, it } from "vitest";
import { aoAbrir, comChaves, contarNovos, gravarVistos, lerVistos, subirMarcaPortal, type Vistos } from "@/lib/sino-visto";

const vistos = (chaves: string[], portalAte = 0): Vistos => ({ chaves: new Set(chaves), portalAte });

describe("regras do visto do sino", () => {
  beforeEach(() => localStorage.clear());

  it("abrir: as não lidas de agora viram vistas; só o que chega depois conta", () => {
    const aberto = aoAbrir(vistos([]), { chavesNaoLidas: ["aviso:a"], avisosCarregados: true, portalMaiorId: 0 });
    expect(contarNovos(["aviso:a"], aberto)).toBe(0);
    expect(contarNovos(["aviso:a", "aviso:b"], aberto)).toBe(1);
  });

  it("abrir com os avisos carregados poda o que já foi lido (sem limite que expulse pendente)", () => {
    const muitas = Array.from({ length: 800 }, (_, i) => `aviso:${i}`);
    const depois = aoAbrir(vistos(muitas), { chavesNaoLidas: muitas.slice(1), avisosCarregados: true, portalMaiorId: 0 });
    expect(depois.chaves.has("aviso:0")).toBe(false);
    expect(contarNovos(muitas.slice(1), depois)).toBe(0);
  });

  it("abrir antes de os avisos carregarem (ou com a busca falhando) mantém as chaves de aviso já vistas", () => {
    const depois = aoAbrir(vistos(["aviso:a", "erro:1"]), { chavesNaoLidas: ["erro:2"], avisosCarregados: false, portalMaiorId: 0 });
    expect([...depois.chaves].sort()).toEqual(["aviso:a", "erro:2"]);
  });

  it("marca do portal só sobe", () => {
    expect(aoAbrir(vistos([], 40), { chavesNaoLidas: [], avisosCarregados: true, portalMaiorId: 12 }).portalAte).toBe(40);
    expect(subirMarcaPortal(vistos([], 40), 41).portalAte).toBe(41);
    const igual = vistos([], 40);
    expect(subirMarcaPortal(igual, 39)).toBe(igual);
  });

  it("com o sino aberto, o que aparece entra no visto; sem nada novo, nada muda", () => {
    const atual = vistos(["aviso:a"]);
    expect(comChaves(atual, ["aviso:a"])).toBe(atual);
    expect([...comChaves(atual, ["aviso:b"]).chaves]).toEqual(["aviso:a", "aviso:b"]);
  });

  it("grava e lê por perfil, neste computador; sem perfil não grava", () => {
    gravarVistos(7, vistos(["aviso:a"], 5));
    expect(lerVistos(7)).toEqual(vistos(["aviso:a"], 5));
    expect(lerVistos(8).chaves.size).toBe(0);
    gravarVistos(null, vistos(["aviso:x"]));
    expect(lerVistos(null).chaves.size).toBe(0);
  });

  it("lê o formato antigo (lista de chaves) e tira a marca do portal dele", () => {
    localStorage.setItem("autoos:sino-visto:7", JSON.stringify(["aviso:a", "portal:9", "portal:31"]));
    const lido = lerVistos(7);
    expect(lido.portalAte).toBe(31);
    expect([...lido.chaves]).toEqual(["aviso:a"]);
  });
});
