import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), emitir: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/lib/portal-documentos", () => ({ emitirOrcamentoPublicado: mocks.emitir }));
import { db } from "./db";
beforeEach(() => vi.clearAllMocks());

it("publicação individual emite o PDF oficial após congelar a versão", async () => {
  mocks.invoke.mockResolvedValue({ versaoId: 91, versao: 2, nova: true });
  expect(await db.publicarOrcamentoPortal(28)).toMatchObject({ versaoId: 91 });
  expect(mocks.emitir).toHaveBeenCalledWith(28);
});
it("lote emite só as OS publicadas, preservando o resumo de falhas", async () => {
  mocks.invoke.mockResolvedValue({ publicados: [28, 29], falhas: [{ equipamento_id: 30 }] });
  const r = await db.publicarOrcamentosPendentesPortal();
  expect(r.falhas).toHaveLength(1);
  expect(mocks.emitir.mock.calls).toEqual([[28], [29]]);
});
it("envio de WhatsApp também emite o PDF da versão publicada; aviso de retirada não", async () => {
  mocks.invoke.mockResolvedValue({ estado: "ENVIADA" });
  await db.solicitarEnvioWhatsapp({ equipamento_id: 28, tipo: "orcamento_informativo" });
  await db.solicitarEnvioWhatsapp({ equipamento_id: 29, tipo: "equipamento_pronto" });
  expect(mocks.emitir.mock.calls).toEqual([[28]]);
});
