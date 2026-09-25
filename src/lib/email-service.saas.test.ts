import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Equipamento, Verificacao } from "@/types";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  registrar: vi.fn(),
  carregarRepositorio: vi.fn(),
  construirOrcamento: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mocks.invoke(...args) }));
vi.mock("@/lib/runtime-mode", () => ({ IS_SAAS_BUILD: true }));
vi.mock("@/lib/saas-auth", () => ({
  loadSaasAuthConfiguration: () => ({ supabaseUrl: "https://staging.example.supabase.co", publishableKey: "sb_publishable_test" }),
}));
vi.mock("@/lib/data/comunicacoes-repository", () => ({
  carregarRepositorioComunicacoes: (...args: unknown[]) => mocks.carregarRepositorio(...args),
}));
vi.mock("@/lib/data/equipamentos-operacoes-repository", () => ({ carregarRepositorioOperacoesEquipamento: vi.fn() }));
vi.mock("@/lib/pdf-service", () => ({
  PdfService: { construirOrcamento: (...args: unknown[]) => mocks.construirOrcamento(...args) },
}));

import { EmailService } from "@/lib/email-service";

const equipamento: Equipamento = {
  id: "22222222-2222-4222-8222-222222222222",
  empresa_id: "11111111-1111-4111-8111-111111111111",
  serial_number: "SN-ONLINE-1",
  marca: "Zebra",
  modelo: "ZD421",
  tipo: "IMPRESSORA",
  status: "AGUARDANDO_APROVACAO",
  data_entrada: "2026-09-24",
  cliente_nome: "Cliente de teste",
  cliente_email: "cliente@example.test",
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

describe("EmailService no SaaS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue(true);
    mocks.construirOrcamento.mockResolvedValue({
      filename: "orcamento.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3]),
    });
    mocks.carregarRepositorio.mockResolvedValue({ registrar: mocks.registrar });
  });

  it("usa o SMTP Gmail existente, envia o PDF em bytes e registra no tenant remoto", async () => {
    await expect(EmailService.enviarOrcamento(equipamento, verificacao)).resolves.toEqual({ sucesso: true });

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("enviar_email_saas", {
      input: expect.objectContaining({
        email: "cliente@example.test",
        anexos: [{ filename: "orcamento.pdf", content_type: "application/pdf", bytes: [1, 2, 3] }],
      }),
      config: { supabaseUrl: "https://staging.example.supabase.co", publishableKey: "sb_publishable_test" },
    });
    expect(mocks.registrar).toHaveBeenCalledWith(expect.objectContaining({ equipamento_id: equipamento.id, canal: "EMAIL", enviado: true }));
  });

  it("registra falha do transporte e nunca marca envio como sucesso", async () => {
    mocks.invoke.mockRejectedValueOnce("Configure o SMTP primeiro");

    await expect(EmailService.enviarOrcamento(equipamento, verificacao)).resolves.toMatchObject({ sucesso: false });
    expect(mocks.registrar).toHaveBeenCalledWith(expect.objectContaining({ equipamento_id: equipamento.id, canal: "EMAIL", enviado: false, erro: "Configure o SMTP primeiro" }));
    expect(mocks.invoke.mock.calls[0]?.[0]).toBe("enviar_email_saas");
  });
});
