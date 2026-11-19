import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Equipamento } from "@/types";

const m = vi.hoisted(() => ({
  atualizarStatusEquipamento: vi.fn(),
  salvarArquivoTemp: vi.fn(),
  gerarOrdemServico: vi.fn(),
  solicitarEnvio: vi.fn(),
  buscarEquipamento: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { atualizarStatusEquipamento: m.atualizarStatusEquipamento, salvarArquivoTemp: m.salvarArquivoTemp, buscarEquipamento: m.buscarEquipamento } }));
vi.mock("@/lib/pdf-service", () => ({ PdfService: { gerarOrdemServico: m.gerarOrdemServico } }));
vi.mock("@/lib/whatsapp-service", () => ({ WhatsAppService: { solicitarEnvio: m.solicitarEnvio } }));

import { nomeArquivoOrdem, useAcoesEmLote } from "../useAcoesEmLote";

const eq = (id: number, status: string, cliente = "Gráfica Sol") =>
  ({ id, status, cliente_nome: cliente, marca: "Zebra", modelo: "ZD220", serial_number: `S${id}`, data_entrada: "2026-11-01", atualizado_em: `t${id}` }) as Equipamento;

describe("useAcoesEmLote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Sem versão nova no banco, cada OS segue como foi selecionada.
    m.buscarEquipamento.mockRejectedValue(new Error("sem sessão"));
  });

  it("mover: só as que podem ir para a etapa; uma falha não para as outras", async () => {
    m.atualizarStatusEquipamento.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Conflito de concorrência"));
    const { result } = renderHook(() => useAcoesEmLote());
    const r = await result.current.moverEtapa([eq(1, "RECEBIDO"), eq(2, "RECEBIDO"), eq(3, "ENTREGUE")], "EM_VERIFICACAO");
    expect(m.atualizarStatusEquipamento).toHaveBeenCalledTimes(2);
    expect(m.atualizarStatusEquipamento).toHaveBeenCalledWith(1, "EM_VERIFICACAO", undefined, undefined, undefined, "t1");
    expect(r).toEqual({ feitos: 1, falhas: ["OS #2: Conflito de concorrência"], idsComFalha: [2], ignoradas: 1 });
  });

  it("avisar pronto: só as prontas; envio incerto não é repetido e vira falha para conferir", async () => {
    m.solicitarEnvio.mockResolvedValueOnce({ sucesso: true }).mockResolvedValueOnce({ sucesso: false, requerConfirmacao: true });
    const { result } = renderHook(() => useAcoesEmLote());
    const r = await result.current.avisarPronto([eq(1, "PRONTO"), eq(2, "PRONTO"), eq(3, "RECEBIDO")]);
    expect(m.solicitarEnvio).toHaveBeenCalledTimes(2);
    expect(m.solicitarEnvio).toHaveBeenCalledWith(1, "equipamento_pronto", { reenvioManual: true });
    expect(r.feitos).toBe(1);
    expect(r.ignoradas).toBe(1);
    expect(r.falhas[0]).toMatch(/OS #2: envio anterior incerto/);
  });

  it("baixar ordens: um PDF por OS, com o número no nome", async () => {
    m.gerarOrdemServico.mockResolvedValue("/docs/x.pdf");
    const { result } = renderHook(() => useAcoesEmLote());
    const r = await result.current.baixarOrdens([eq(7, "PRONTO", "Gráfica São João"), eq(8, "RECEBIDO")]);
    expect(r.feitos).toBe(2);
    expect(m.gerarOrdemServico).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), "OrdemServico_7_Grafica_Sao_Joao.pdf");
    expect(nomeArquivoOrdem(eq(9, "RECEBIDO", "  "))).toBe("OrdemServico_9_Cliente.pdf");
  });

  it("exportar: planilha só com as selecionadas", async () => {
    m.salvarArquivoTemp.mockResolvedValue("/tmp/x.csv");
    const { result } = renderHook(() => useAcoesEmLote());
    const nome = await result.current.exportar([eq(1, "PRONTO")]);
    expect(nome).toMatch(/^equipamentos-selecionados-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = new TextDecoder().decode(new Uint8Array(m.salvarArquivoTemp.mock.calls[0][0]));
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain("S1");
  });

  it("mover relê a OS: usa a etapa e o token atuais, não os da seleção", async () => {
    m.buscarEquipamento.mockResolvedValue(eq(1, "RECEBIDO"));
    m.buscarEquipamento.mockResolvedValueOnce({ ...eq(1, "RECEBIDO"), atualizado_em: "novo" });
    m.atualizarStatusEquipamento.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAcoesEmLote());
    const r = await result.current.moverEtapa([eq(1, "ENTREGUE")], "EM_VERIFICACAO");
    expect(m.atualizarStatusEquipamento).toHaveBeenCalledWith(1, "EM_VERIFICACAO", undefined, undefined, undefined, "novo");
    expect(r.feitos).toBe(1);
  });

  it("avisar pronto: pedido na fila central conta à parte, não como enviado", async () => {
    m.solicitarEnvio.mockResolvedValue({ sucesso: true, enfileirada: true });
    const { result } = renderHook(() => useAcoesEmLote());
    const r = await result.current.avisarPronto([eq(1, "PRONTO")]);
    expect(r.feitos).toBe(0);
    expect(r.naFila).toBe(1);
  });
});
