import { describe, expect, it, vi } from "vitest";
import {
  analisarAjusteDoEquipamento,
  carregarVerificacaoDoEquipamento,
  DESKTOP_ONLY_EQUIPMENT_COMMANDS,
  enviarWhatsAppOrcamentoOnline,
  usaIpcDesktopDeEquipamento,
} from "@/pages/equipamentos/online-ipc";
import { quoteInputForAdjustment } from "@/lib/data/equipamentos-operacoes-repository";
import type { Equipamento, Verificacao } from "@/types";

describe("IPC Online vs desktop em Equipamentos", () => {
  it("não usa comandos desktop no build SaaS", () => {
    expect(usaIpcDesktopDeEquipamento(true)).toBe(false);
    expect(usaIpcDesktopDeEquipamento(false)).toBe(true);
    expect(DESKTOP_ONLY_EQUIPMENT_COMMANDS).toEqual(expect.arrayContaining([
      "analisar_ajuste_orcamento",
      "buscar_verificacao_tecnica",
      "solicitar_envio_whatsapp",
    ]));
  });

  it("analisar ajuste no SaaS chama só o repositório Online", async () => {
    const desktop = vi.fn();
    const online = vi.fn().mockResolvedValue({
      status: "APROVADO",
      podePedirNovaAprovacao: true,
      jaPublicado: false,
      pecasBaixadas: [],
      totalBaixado: 0,
      exigeDecisaoEstoque: false,
    });
    await analisarAjusteDoEquipamento(true, "22000000-0000-4000-8000-000000000001", desktop, online);
    expect(online).toHaveBeenCalledWith("22000000-0000-4000-8000-000000000001");
    expect(desktop).not.toHaveBeenCalled();
  });

  it("carrega verificação no SaaS sem buscar_verificacao_tecnica", async () => {
    const desktop = vi.fn();
    const online = vi.fn().mockResolvedValue({ equipamento_id: "1" });
    await carregarVerificacaoDoEquipamento(true, "22000000-0000-4000-8000-000000000001", desktop, online);
    expect(desktop).not.toHaveBeenCalled();
    expect(online).toHaveBeenCalledTimes(1);
  });

  it("reenvio de orçamento Online usa verificação remota, não a fila desktop", async () => {
    const equipamento = { id: "22000000-0000-4000-8000-000000000001" } as Equipamento;
    const verificacao = { equipamento_id: equipamento.id } as Verificacao;
    const getVerification = vi.fn().mockResolvedValue(verificacao);
    const enviarOrcamento = vi.fn().mockResolvedValue({ sucesso: true });
    const resultado = await enviarWhatsAppOrcamentoOnline(equipamento, { getVerification, enviarOrcamento });
    expect(resultado).toEqual({ sucesso: true });
    expect(enviarOrcamento).toHaveBeenCalledWith(equipamento, verificacao);
  });

  it("mapeia SEM_NOVA_APROVACAO e NOVA_APROVACAO no saveQuote Online", () => {
    const base = {
      equipmentId: "22000000-0000-4000-8000-000000000001",
      expectedUpdatedAt: "2026-10-27T12:00:00",
      services: [],
      parts: [],
      total: 10,
      payment: { codigo: "PIX" as const },
    };
    const semNova = quoteInputForAdjustment(base, { modoAprovado: "SEM_NOVA_APROVACAO" });
    expect(semNova.newStatus).toBeUndefined();
    expect(semNova.payment?.codigo).toBe("PIX");
    const nova = quoteInputForAdjustment(base, { modoAprovado: "NOVA_APROVACAO", devolverEstoque: true });
    expect(nova.newStatus).toBe("AGUARDANDO_APROVACAO");
    expect(nova.payment).toBeUndefined();
    expect(nova.correctionReason).toMatch(/nova aprovação/i);
  });
});
