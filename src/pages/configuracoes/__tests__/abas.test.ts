import { describe, it, expect } from "vitest";
import { abasConfiguracoes } from "../abas";

describe("abasConfiguracoes", () => {
  it("só portal: mostra a aba Portal do Cliente, esconde Integrações e admin e abre em Geral", () => {
    const abas = abasConfiguracoes({ smtp: false, whatsapp: false, portal: true, admin: false });

    expect(abas.portal).toBe(true);
    expect(abas.integracoes).toBe(false);
    expect(abas.admin).toBe(false);
    expect(abas.inicial).toBe("geral");
  });

  it("comunicação + portal + admin: mostra as três e abre em Geral", () => {
    const abas = abasConfiguracoes({ smtp: true, whatsapp: true, portal: true, admin: true });

    expect(abas.integracoes).toBe(true);
    expect(abas.portal).toBe(true);
    expect(abas.admin).toBe(true);
    expect(abas.inicial).toBe("geral");
  });

  it("só admin: esconde Integrações e abre em Geral", () => {
    const abas = abasConfiguracoes({ smtp: false, whatsapp: false, portal: false, admin: true });

    expect(abas.integracoes).toBe(false);
    expect(abas.admin).toBe(true);
    expect(abas.inicial).toBe("geral");
  });

  it("sem permissão nenhuma: só a Geral", () => {
    const abas = abasConfiguracoes({ smtp: false, whatsapp: false, portal: false, admin: false });

    expect(abas.integracoes).toBe(false);
    expect(abas.portal).toBe(false);
    expect(abas.admin).toBe(false);
    expect(abas.inicial).toBe("geral");
  });

  it("smtp + admin: mostra Integrações e admin", () => {
    const abas = abasConfiguracoes({ smtp: true, whatsapp: false, portal: false, admin: true });

    expect(abas.integracoes).toBe(true);
    expect(abas.admin).toBe(true);
    expect(abas.inicial).toBe("geral");
  });
});
