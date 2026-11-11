import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfService } from "@/lib/pdf-service";
import type { Equipamento } from "@/types";
import { DocumentosEquipamento } from "./DocumentosEquipamento";

const db = vi.hoisted(() => ({
  buscarVerificacao: vi.fn(),
  publicarDocumentoPortal: vi.fn(),
}));
const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const equipamento = {
  id: 42,
  cliente_id: 9,
  serial_number: "SN-42",
  marca: "Zebra",
  modelo: "ZD220",
  tipo: "Impressora",
  status: "RECEBIDO",
  data_entrada: "2026-09-01",
  atualizado_em: "2026-11-10T12:00:01.000Z",
} as Equipamento;

function novoArtifact() {
  return {
    filename: "os.pdf",
    bytes: new Uint8Array([37]),
    mimeType: "application/pdf" as const,
    portal: { tipo: "ORDEM_SERVICO" as const, versaoId: null, atualizadoEm: equipamento.atualizado_em! },
  };
}

describe("DocumentosEquipamento", () => {
  const print = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:os.pdf"), revokeObjectURL: vi.fn() });
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      configurable: true,
      get: () => ({ focus: vi.fn(), print }),
    });
    db.publicarDocumentoPortal.mockResolvedValue([37, 80, 68, 70]);
    invoke.mockResolvedValue("/tmp/os.pdf");
  });

  afterEach(() => {
    print.mockReset();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("imprimir sem baixar publica o PDF oficial e imprime os bytes canônicos", async () => {
    const artifact = novoArtifact();
    vi.spyOn(PdfService, "construirOrdemServico").mockResolvedValue(artifact);
    render(<DocumentosEquipamento equipamento={equipamento} />);

    fireEvent.click(screen.getAllByRole("button", { name: /visualizar pdf/i })[0]);
    const frame = await screen.findByTitle("Prévia do PDF");
    fireEvent.load(frame);
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));

    await waitFor(() => expect(db.publicarDocumentoPortal).toHaveBeenCalledTimes(1));
    expect(db.publicarDocumentoPortal).toHaveBeenCalledWith(42, expect.any(Uint8Array), artifact.portal);
    expect(Array.from(artifact.bytes)).toEqual([37, 80, 68, 70]);
    // Os bytes mudaram para os canônicos: a prévia recarrega e só então imprime.
    expect(print).not.toHaveBeenCalled();
    fireEvent.load(frame);
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it("imprimir e depois baixar o mesmo artefato publica uma única vez", async () => {
    const artifact = novoArtifact();
    vi.spyOn(PdfService, "construirOrdemServico").mockResolvedValue(artifact);
    render(<DocumentosEquipamento equipamento={equipamento} />);

    fireEvent.click(screen.getAllByRole("button", { name: /visualizar pdf/i })[0]);
    fireEvent.load(await screen.findByTitle("Prévia do PDF"));
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    await waitFor(() => expect(db.publicarDocumentoPortal).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /baixar/i }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("salvar_ordem_servico_pdf", expect.objectContaining({ bytes: [37, 80, 68, 70] })));
    expect(db.publicarDocumentoPortal).toHaveBeenCalledTimes(1);
  });
});
