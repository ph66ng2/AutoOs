import { describe, it, expect } from "vitest";
import { abasConfiguracoes } from "../abas";

describe("abasConfiguracoes", () => {
  it("só portal: mostra Integrações, esconde admin e abre em smtp", () => {
    const abas = abasConfiguracoes({ smtp: false, whatsapp: false, portal: true, admin: false });

    expect(abas.integracoes).toBe(true);
    expect(abas.admin).toBe(false);
    expect(abas.inicial).toBe("smtp");
  });

  it("só admin: esconde Integrações e abre em infra", () => {
    const abas = abasConfiguracoes({ smtp: false, whatsapp: false, portal: false, admin: true });

    expect(abas.integracoes).toBe(false);
    expect(abas.admin).toBe(true);
    expect(abas.inicial).toBe("infra");
  });

  it("smtp + admin: mostra Integrações e admin", () => {
    const abas = abasConfiguracoes({ smtp: true, whatsapp: false, portal: false, admin: true });

    expect(abas.integracoes).toBe(true);
    expect(abas.admin).toBe(true);
    expect(abas.inicial).toBe("smtp");
  });
});
