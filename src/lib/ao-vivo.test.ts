import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => undefined) }));

import { assinarMudancas, calcularDestaques, distribuirMudancas, recarregarTodas, type MudancaAoVivo } from "./ao-vivo";

const mudanca = (tabela: string, id: number, referencia: number | null = null): MudancaAoVivo => ({ tabela, id, referencia, operacao: "U" });

describe("ao-vivo: distribuição", () => {
  const cancelar: Array<() => void> = [];
  afterEach(() => { cancelar.splice(0).forEach((c) => c()); });

  it("cada tela recebe só as tabelas que assinou; recarregar todas manda lista vazia", () => {
    const equipamentos = vi.fn();
    const clientes = vi.fn();
    cancelar.push(assinarMudancas(["equipamentos", "verificacoes"], equipamentos));
    cancelar.push(assinarMudancas(["clientes"], clientes));
    distribuirMudancas([mudanca("verificacoes", 3, 7), mudanca("produtos", 1)]);
    expect(equipamentos).toHaveBeenCalledWith([mudanca("verificacoes", 3, 7)]);
    expect(clientes).not.toHaveBeenCalled();
    recarregarTodas();
    expect(clientes).toHaveBeenCalledWith([]);
  });

  it("cancelar a assinatura para de receber; foco da janela recarrega (no máximo a cada 15 s)", () => {
    const tela = vi.fn();
    const sair = assinarMudancas(["clientes"], tela);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
    expect(tela).toHaveBeenCalledTimes(1);
    sair();
    distribuirMudancas([mudanca("clientes", 1)]);
    expect(tela).toHaveBeenCalledTimes(1);
  });
});

describe("calcularDestaques", () => {
  it("marca novos e alterados; quem saiu não entra", () => {
    const antes = [{ id: 1, v: "a" }, { id: 2, v: "a" }, { id: 3, v: "a" }];
    const depois = [{ id: 4, v: "a" }, { id: 1, v: "a" }, { id: 2, v: "b" }];
    const destaques = calcularDestaques(antes, depois, (i) => i.id, (i) => i.v);
    expect([...destaques.entries()]).toEqual([[4, "novo"], [2, "alterado"]]);
  });
});
