import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Equipamento, Verificacao } from "@/types";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  registrar: vi.fn(),
  carregarRepositorio: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mocks.invoke(...args) }));
vi.mock("@/lib/runtime-mode", () => ({ IS_SAAS_BUILD: true }));
vi.mock("@/lib/saas-auth", () => ({
  loadSaasAuthConfiguration: () => ({ supabaseUrl: "https://staging.example.supabase.co", publishableKey: "sb_publishable_test" }),
}));
vi.mock("@/lib/data/comunicacoes-repository", () => ({
  carregarRepositorioComunicacoes: (...args: unknown[]) => mocks.carregarRepositorio(...args),
}));

import { WhatsAppService } from "@/lib/whatsapp-service";

const equipamento: Equipamento<string> = {
  id: "22222222-2222-4222-8222-222222222222",
  empresa_id: "11111111-1111-4111-8111-111111111111",
  serial_number: "SN-ONLINE-2",
  marca: "Zebra",
  modelo: "ZD421",
  tipo: "IMPRESSORA",
  status: "AGUARDANDO_APROVACAO",
  data_entrada: "2026-09-24",
  cliente_nome: "Cliente de teste",
  cliente_telefone: "71988776655",
};
const verificacao: Verificacao = {
  equipamento_id: equipamento.id,
  tecnico_nome: "Tech",
  problema_relatado: "Falha de teste",
  diagnostico: "Diagnóstico sintético",
  itens_verificados: "[]",
  servicos_necessarios: "[]",
  pecas_necessarias: "[]",
  custo_estimado_mao_obra: 10,
  custo_estimado_pecas: 0,
  custo_total: 10,
  tempo_estimado: 1,
  concluida: true,
  observacoes: "",
};

describe("WhatsAppService no SaaS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue(true);
    mocks.carregarRepositorio.mockResolvedValue({ registrar: mocks.registrar });
  });

  it("usa o provider existente e registra o resultado no tenant remoto", async () => {
    await expect(WhatsAppService.enviarOrcamento(equipamento, verificacao)).resolves.toEqual({ sucesso: true });

    expect(mocks.invoke).toHaveBeenCalledWith("enviar_whatsapp_saas", {
      input: expect.objectContaining({ contato: "5571988776655", mensagem: expect.stringContaining("Cliente de teste") }),
      config: { supabaseUrl: "https://staging.example.supabase.co", publishableKey: "sb_publishable_test" },
    });
    expect(mocks.registrar).toHaveBeenCalledWith(expect.objectContaining({ equipamento_id: equipamento.id, canal: "WHATSAPP", enviado: true }));
    expect(mocks.invoke).not.toHaveBeenCalledWith("enviar_whatsapp", expect.anything());
  });

  it("guarda falha do provider sem indicar sucesso", async () => {
    mocks.invoke.mockRejectedValueOnce("Configure o WhatsApp primeiro");

    await expect(WhatsAppService.enviarOrcamento(equipamento, verificacao)).resolves.toMatchObject({ sucesso: false, erro: "Configure o WhatsApp primeiro" });
    expect(mocks.registrar).toHaveBeenCalledWith(expect.objectContaining({ equipamento_id: equipamento.id, canal: "WHATSAPP", enviado: false, erro: "Configure o WhatsApp primeiro" }));
  });
});
