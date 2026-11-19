import { describe, expect, it } from "vitest";
import type { Equipamento } from "@/types";
import { agruparHistoricoEquipamentos } from "./historico-equipamentos";

function os(id: number, serial: string, status: string, data_entrada: string, extra: Partial<Equipamento> = {}): Equipamento {
  return { id, serial_number: serial, marca: "Zebra", modelo: "ZT411", tipo: "Impressora", status, data_entrada, ...extra };
}

describe("agruparHistoricoEquipamentos", () => {
  it("junta as OS do mesmo número de série e conta passagens e serviços feitos", () => {
    const [aparelho] = agruparHistoricoEquipamentos([
      os(1, "ABC-1", "ENTREGUE", "2025-03-01", { data_pronto: "2025-03-05" }),
      os(2, "abc-1 ", "ENTREGUE", "2025-08-01"),
      os(3, "ABC-1", "RECEBIDO", "2026-11-10"),
    ]);
    expect(aparelho.passagens.map((p) => p.id)).toEqual([3, 2, 1]);
    expect(aparelho.servicosFeitos).toBe(1);
    expect(aparelho.statusAtual).toBe("RECEBIDO");
    expect(aparelho.ultimaEntrada).toBe("2026-11-10");
    expect(aparelho.emAberto).toBe(true);
  });

  it("OS sem número de série não se juntam a outras", () => {
    expect(agruparHistoricoEquipamentos([os(1, "", "ENTREGUE", "2025-01-01"), os(2, " ", "ENTREGUE", "2025-02-01")])).toHaveLength(2);
  });

  it("ordena pelo aparelho mexido por último, em qualquer das suas OS", () => {
    const chaves = agruparHistoricoEquipamentos([
      os(1, "A", "ENTREGUE", "2026-11-01", { atualizado_em: "2026-11-02T10:00:00Z" }),
      os(2, "B", "EM_MANUTENCAO", "2026-01-01", { atualizado_em: "2026-11-15T09:00:00Z" }),
      os(3, "C", "ENTREGUE", "2025-01-01", { atualizado_em: "2025-01-05T09:00:00Z" }),
      os(4, "C", "ABANDONADO", "2025-06-01"),
    ]).map((g) => g.serial);
    expect(chaves).toEqual(["B", "A", "C"]);
  });
});
