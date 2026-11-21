import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: m.error, success: vi.fn(), warning: vi.fn() }) }));

import { notificarErro } from "@/hooks/useNotification";
import { registrarAbrirSuporte } from "@/lib/suporte-ponte";

describe("aviso de erro → suporte", () => {
  afterEach(() => registrarAbrirSuporte(null));

  it("com o banco conectado, o aviso oferece Enviar ao suporte com o relatório", () => {
    const abrir = vi.fn();
    registrarAbrirSuporte(abrir);
    notificarErro("Equipamentos", "Salvar equipamento", new Error("Conflito de concorrência"));
    const opcoes = m.error.mock.calls.at(-1)?.[1];
    expect(opcoes.action.label).toBe("Enviar ao suporte");
    opcoes.action.onClick();
    expect(abrir).toHaveBeenCalledWith(expect.stringContaining("AutoOS — relatório de erro"));
    expect(abrir.mock.calls[0][0]).toContain("Ação: Salvar equipamento");
  });

  it("sem banco (ponte não registrada), fica o Copiar detalhes", () => {
    notificarErro("Equipamentos", "Salvar equipamento", new Error("x"));
    expect(m.error.mock.calls.at(-1)?.[1].action.label).toBe("Copiar detalhes");
  });
});
