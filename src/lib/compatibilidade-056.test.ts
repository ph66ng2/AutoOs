import { describe, expect, it } from "vitest";
import {
  MENSAGEM_TRAVA_056,
  PERMISSOES_056,
  perfilCompativel056,
  permissoesNovas,
} from "@/lib/compatibilidade-056";

describe("compatibilidade 0.5.6", () => {
  it("ADMIN sempre é compatível", () => {
    expect(perfilCompativel056("ADMIN", []).ok).toBe(true);
    expect(perfilCompativel056("ADMIN", ["PREPARE_QUOTES"]).ok).toBe(true);
  });
  it("recusa perfil vazio e permissões novas", () => {
    expect(perfilCompativel056("CUSTOM", [])).toMatchObject({ ok: false });
    expect(perfilCompativel056("CUSTOM", ["STOCK_CONTROL", "MANAGE_STATUS_LINKS"]).ok).toBe(false);
    expect(permissoesNovas([...PERMISSOES_056, "PREPARE_QUOTES"])).toEqual(["PREPARE_QUOTES"]);
  });
  it("a mensagem da trava descreve a 0.5.6", () => {
    expect(MENSAGEM_TRAVA_056).toMatch(/0\.5\.6/);
  });
  it("aceita permissões antigas e trava desligada", () => {
    expect(perfilCompativel056("TECNICO", ["STOCK_CONTROL"]).ok).toBe(true);
    expect(perfilCompativel056("CUSTOM", [], false).ok).toBe(true);
    expect(perfilCompativel056("CUSTOM", ["PREPARE_QUOTES"], false).ok).toBe(true);
  });
});
