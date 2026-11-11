import { beforeEach, expect, it, vi } from "vitest";
import { baixarDocumentoOficial } from "./portal-api";

beforeEach(() => vi.restoreAllMocks());

it("pede uma URL pela sessão e baixa exatamente o arquivo assinado, sem regenerar PDF", async () => {
  const bytes = new Uint8Array([37, 80, 68, 70, 45, 7, 8]);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ url: "https://storage.example.invalid/signed", arquivo: "Orcamento-v2.pdf" }) })
    .mockResolvedValueOnce({ ok: true, blob: async () => blob });
  vi.stubGlobal("fetch", fetch);
  const createUrl = vi.fn(() => "blob:oficial");
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await baixarDocumentoOficial("sessao-do-cliente", 28, 91);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    acao: "documento", sessao: "sessao-do-cliente", equipamentoId: 28, documentoId: 91,
  });
  expect(fetch.mock.calls[1][0]).toBe("https://storage.example.invalid/signed");
  expect(createUrl).toHaveBeenCalledWith(blob);
  expect(click.mock.instances[0]).toHaveProperty("download", "Orcamento-v2.pdf");
});

it("uma sessão expirada não chega ao Storage", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ erro: "Sessão encerrada", codigo: "SESSAO_INVALIDA" }) });
  vi.stubGlobal("fetch", fetch);
  await expect(baixarDocumentoOficial("expirada", 28, 91)).rejects.toThrow("Sessão encerrada");
  expect(fetch).toHaveBeenCalledTimes(1);
});
