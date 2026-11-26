import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ClienteEquipamentos from "./ClienteEquipamentos";

const dbMocks = vi.hoisted(() => ({
  buscarCliente: vi.fn(),
  listarHistoricoEquipamentosCliente: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));

function os(id: number, serial: string, status: string, data_entrada: string, extra = {}) {
  return { id, serial_number: serial, marca: "Zebra", modelo: "ZT411", tipo: "Impressora", status, data_entrada, ...extra };
}

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={["/clientes/7/equipamentos"]}>
      <Routes>
        <Route path="/clientes/:id/equipamentos" element={<ClienteEquipamentos />} />
        <Route path="/equipamentos/:id" element={<p>Detalhes da OS aberta</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ClienteEquipamentos", () => {
  it("agrupa as OS por aparelho, conta passagens e serviços e abre a OS", async () => {
    dbMocks.buscarCliente.mockResolvedValue({ id: 7, tipo_pessoa: "PJ", nome: "Oficina do Porto" });
    dbMocks.listarHistoricoEquipamentosCliente.mockResolvedValue([
      os(11, "ZT-1", "ENTREGUE", "2025-02-01", { data_pronto: "2025-02-05", data_saida: "2025-02-06" }),
      os(12, "ZT-1", "RECEBIDO", "2026-11-10"),
      os(13, "GC-9", "ENTREGUE", "2026-03-01"),
    ]);
    renderPagina();

    expect(await screen.findByRole("heading", { name: "Equipamentos de Oficina do Porto" })).toBeInTheDocument();
    expect(screen.getByText("2 equipamentos · 3 passagens pela assistência · 1 serviço feito")).toBeInTheDocument();
    expect(dbMocks.listarHistoricoEquipamentosCliente).toHaveBeenCalledWith(7, ["Oficina do Porto", "Oficina do Porto"]);

    const aparelho = screen.getByRole("button", { name: /ZT-1/ });
    expect(aparelho).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(aparelho);
    expect(aparelho).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /OS 11/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /OS 12/ }));
    expect(await screen.findByText("Detalhes da OS aberta")).toBeInTheDocument();
  });

  it("cliente sem equipamentos mostra o estado vazio", async () => {
    dbMocks.buscarCliente.mockResolvedValue({ id: 7, tipo_pessoa: "PF", nome: "Sônia Reis" });
    dbMocks.listarHistoricoEquipamentosCliente.mockResolvedValue([]);
    renderPagina();
    expect(await screen.findByText("Este cliente ainda não trouxe equipamentos")).toBeInTheDocument();
  });
});
