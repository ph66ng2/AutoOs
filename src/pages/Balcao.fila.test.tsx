import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Balcao from "@/pages/Balcao";
import { CounterLayout } from "@/components/CounterLayout";
import { todayLocalIsoDate } from "@/lib/date-utils";

const db = vi.hoisted(() => ({ listarEquipamentosPaginados: vi.fn(), listarEquipamentos: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ status: { active_profile_name: "Marina Alves", unlocked: true }, ensureSensitiveAccess: vi.fn(), lockSensitiveAccess: vi.fn(), openProfileSelector: vi.fn() }),
}));
vi.mock("@/components/equipamentos/DocumentosEquipamento", () => ({ DocumentosEquipamento: () => <div>Documentos</div> }));

function eq(id: number, status: string, data_entrada: string, cliente_nome: string) {
  return { id, serial_number: `SN-${id}`, marca: "Zebra", modelo: "ZT411", tipo: "Impressora", status, data_entrada, cliente_nome };
}

describe("Balcão: início e fila do dia", () => {
  it("mostra os prontos com contagem, só as entradas de hoje e abre a entrega", async () => {
    const hoje = todayLocalIsoDate();
    db.listarEquipamentosPaginados.mockImplementation(async (_busca: unknown, status: string | undefined) =>
      status === "PRONTO"
        ? { items: [eq(5, "PRONTO", "2026-10-01", "Farmácia Vida")], total: 4 }
        : { items: [eq(9, "RECEBIDO", hoje, "Oficina do Porto"), eq(8, "ENTREGUE", "2020-01-01", "Cliente antigo")], total: 2 },
    );
    render(
      <MemoryRouter initialEntries={["/balcao"]}>
        <Routes>
          <Route element={<CounterLayout onChangeMode={vi.fn()} />}>
            <Route path="/balcao" element={<Balcao />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Quem está no balcão?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Marina Alves/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Entregar equipamento.*4/ })).toBeInTheDocument();

    const chegaram = screen.getByRole("heading", { name: "Chegaram hoje" }).closest("section")!;
    expect(within(chegaram).getByText("Oficina do Porto")).toBeInTheDocument();
    expect(within(chegaram).queryByText("Cliente antigo")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Registrar Entrega" }));
    expect(await screen.findByRole("button", { name: /marcar como entregue/i })).toBeInTheDocument();
  });
});
