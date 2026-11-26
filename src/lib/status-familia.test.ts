import { describe, expect, it } from "vitest";
import { STATUS_COLORS, STATUS_EQUIPAMENTO, STATUS_LABELS, type StatusEquipamento } from "@/types";
import { ETAPAS_OS, FAMILIA_CLASSES, TOTAL_ETAPAS_COMPACTAS, etapaCompacta, etapaOsAtual, statusFamilia, statusFamiliaClasses } from "./status-familia";

const ESPERADO: Record<StatusEquipamento, ReturnType<typeof statusFamilia>> = {
  RECEBIDO: "neutral",
  EM_VERIFICACAO: "work",
  VERIFICADO: "work",
  AGUARDANDO_APROVACAO: "wait",
  APROVADO: "work",
  REPROVADO: "bad",
  EM_MANUTENCAO: "work",
  AGUARDANDO_PECA: "wait",
  PRONTO: "ok",
  ENTREGUE: "neutral",
  ORCAMENTO_VENCIDO: "bad",
  ABANDONADO: "neutral",
};

describe("statusFamilia", () => {
  it.each(Object.values(STATUS_EQUIPAMENTO))("classifica %s", (status) => {
    expect(statusFamilia(status)).toBe(ESPERADO[status]);
  });

  it("aceita o rótulo legível que o app também aceita", () => {
    expect(statusFamilia(STATUS_LABELS.AGUARDANDO_PECA)).toBe("wait");
    expect(statusFamilia("  PRONTO ")).toBe("ok");
  });

  it("status desconhecido é neutro", () => {
    expect(statusFamilia("QUALQUER_COISA")).toBe("neutral");
    expect(statusFamiliaClasses("")).toBe(FAMILIA_CLASSES.neutral);
  });

  it("STATUS_COLORS segue a família de cada status", () => {
    for (const status of Object.values(STATUS_EQUIPAMENTO)) {
      expect(STATUS_COLORS[status]).toBe(FAMILIA_CLASSES[ESPERADO[status]]);
    }
  });
});

describe("etapaCompacta", () => {
  it("avança na ordem do fluxo e desvios param onde aconteceram", () => {
    const ordem = ["RECEBIDO", "EM_VERIFICACAO", "VERIFICADO", "AGUARDANDO_APROVACAO", "APROVADO", "EM_MANUTENCAO", "PRONTO"];
    expect(ordem.map(etapaCompacta)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(etapaCompacta("REPROVADO")).toBe(etapaCompacta("AGUARDANDO_APROVACAO"));
    expect(etapaCompacta("ORCAMENTO_VENCIDO")).toBe(etapaCompacta("AGUARDANDO_APROVACAO"));
    expect(etapaCompacta("AGUARDANDO_PECA")).toBe(etapaCompacta("EM_MANUTENCAO"));
    expect(etapaCompacta("ENTREGUE")).toBe(TOTAL_ETAPAS_COMPACTAS);
    expect(etapaCompacta("DESCONHECIDO")).toBe(0);
  });
});

describe("etapaOsAtual", () => {
  it("põe cada status numa das 6 etapas", () => {
    expect(etapaOsAtual("RECEBIDO")).toBe(0);
    expect(etapaOsAtual("EM_VERIFICACAO")).toBe(1);
    expect(["VERIFICADO", "AGUARDANDO_APROVACAO", "REPROVADO", "ORCAMENTO_VENCIDO"].map(etapaOsAtual)).toEqual([2, 2, 2, 2]);
    expect(["APROVADO", "EM_MANUTENCAO", "AGUARDANDO_PECA"].map(etapaOsAtual)).toEqual([3, 3, 3]);
    expect(etapaOsAtual("PRONTO")).toBe(4);
    expect(etapaOsAtual("ENTREGUE")).toBe(ETAPAS_OS.length - 1);
    expect(etapaOsAtual("ABANDONADO")).toBe(-1);
  });
});
