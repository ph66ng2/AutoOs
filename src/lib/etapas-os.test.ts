import { describe, expect, it } from "vitest";
import { etapasDaOs } from "./etapas-os";
import type { EquipamentoHistoricoEvento } from "@/types";

const ev = (status: string, data: string, autor?: string, extra: Partial<EquipamentoHistoricoEvento> = {}): EquipamentoHistoricoEvento => ({
  tipo: "MUDANCA_STATUS",
  status,
  data,
  autor,
  motivo: "",
  ...extra,
});

describe("etapasDaOs", () => {
  const historico = [
    ev("RECEBIDO", "2026-11-08T12:00:00Z", "Marina"),
    ev("EM_VERIFICACAO", "2026-11-09T12:00:00Z", "Ivan"),
    ev("VERIFICADO", "2026-11-11T12:00:00Z", "Ivan"),
    ev("AGUARDANDO_APROVACAO", "2026-11-12T12:00:00Z", "Marina"),
  ];

  it("data e pessoa da primeira chegada em cada etapa; futuras sem nada", () => {
    const etapas = etapasDaOs("AGUARDANDO_APROVACAO", historico);
    expect(etapas.map((e) => e.estado)).toEqual(["feita", "feita", "atual", "futura", "futura", "futura"]);
    expect(etapas.map((e) => e.detalhe ?? "")).toEqual(["08/11 · Marina", "09/11 · Ivan", "11/11 · Ivan", "", "", ""]);
    expect(etapas[2].cor).toBe("bg-status-wait");
  });

  it("desvio mostra o nome do status no lugar da pessoa", () => {
    const etapas = etapasDaOs("REPROVADO", [...historico, ev("REPROVADO", "2026-11-13T12:00:00Z", "Marina")]);
    expect(etapas[2].detalhe).toBe("11/11 · Reprovado");
    expect(etapas[2].cor).toBe("bg-status-bad");
  });

  it("sem autor fica só a data; horário legado não vira data; entregue conclui todas", () => {
    const etapas = etapasDaOs("ENTREGUE", [
      ev("RECEBIDO", "2026-11-08T12:00:00Z"),
      ev("EM_VERIFICACAO", "2026-11-09T12:00:00Z", "Ivan", { data_confiavel: false }),
    ]);
    expect(etapas.every((e) => e.estado === "feita")).toBe(true);
    expect(etapas[0].detalhe).toBe("08/11");
    expect(etapas[1].detalhe).toBe("Ivan");
    expect(etapas[5].detalhe).toBe("");
  });

  it("sem histórico: só os estados", () => {
    expect(etapasDaOs("EM_VERIFICACAO").map((e) => e.detalhe ?? "")).toEqual(["", "", "", "", "", ""]);
  });
});
