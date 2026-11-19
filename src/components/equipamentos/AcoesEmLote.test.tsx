import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Equipamento } from "@/types";

const m = vi.hoisted(() => ({ baixarOrdens: vi.fn(), success: vi.fn() }));
vi.mock("@/hooks/useAcoesEmLote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useAcoesEmLote")>()),
  useAcoesEmLote: () => ({ exportar: vi.fn(), baixarOrdens: m.baixarOrdens, avisarPronto: vi.fn(), moverEtapa: vi.fn() }),
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ ensureSensitiveAccess: vi.fn().mockResolvedValue(true) }) }));
vi.mock("@/hooks/useNotification", () => ({ useNotification: () => ({ success: m.success, warning: vi.fn(), error: vi.fn() }) }));

import { AcoesEmLote, type RelatorioLote } from "./AcoesEmLote";

const eq = (id: number) => ({ id, status: "RECEBIDO", marca: "Zebra", modelo: "ZD", serial_number: `S${id}`, data_entrada: "2026-11-01" }) as Equipamento;

function Pagina({ onConcluido }: { onConcluido: (ids: number[]) => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioLote | null>(null);
  return (
    <AcoesEmLote
      selecionados={[eq(1), eq(2)]}
      ocupado={ocupado}
      onOcupadoChange={setOcupado}
      relatorio={relatorio}
      onRelatorioChange={setRelatorio}
      onLimpar={vi.fn()}
      onConcluido={(ids) => onConcluido(ids)}
    />
  );
}

describe("AcoesEmLote", () => {
  it("mostra a lista inteira de falhas (nunca corta) e mantém só as que falharam", async () => {
    const user = userEvent.setup();
    const falhas = Array.from({ length: 8 }, (_, i) => `OS #${i + 1}: sem modelo`);
    m.baixarOrdens.mockResolvedValue({ feitos: 2, falhas, idsComFalha: [1, 2, 3, 4, 5, 6, 7, 8], ignoradas: 0 });
    const onConcluido = vi.fn();
    render(<Pagina onConcluido={onConcluido} />);
    await user.click(screen.getByRole("button", { name: /Baixar OS/ }));
    const painel = await screen.findByRole("alert");
    expect(painel).toHaveTextContent("8 OS não deram certo");
    expect(painel).toHaveTextContent("OS #8: sem modelo");
    expect(onConcluido).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(m.success).not.toHaveBeenCalled();
  });

  it("enquanto um lote roda, os botões ficam travados", async () => {
    const user = userEvent.setup();
    let terminar: (v: unknown) => void = () => undefined;
    m.baixarOrdens.mockReturnValue(new Promise((resolver) => { terminar = resolver; }));
    render(<Pagina onConcluido={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Baixar OS/ }));
    expect(screen.getByText("Processando…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exportar/ })).toBeDisabled();
    terminar({ feitos: 2, falhas: [], idsComFalha: [], ignoradas: 0 });
    await waitFor(() => expect(screen.getByRole("button", { name: /Exportar/ })).toBeEnabled());
  });
});
