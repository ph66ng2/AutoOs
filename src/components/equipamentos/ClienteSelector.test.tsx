import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClienteSelector } from "./ClienteSelector";
import type { Cliente, Equipamento } from "@/types";

const mocks = vi.hoisted(() => ({
  listarEquipamentosCliente: vi.fn(),
  listarEquipamentos: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listarEquipamentosCliente: mocks.listarEquipamentosCliente,
    listarEquipamentos: mocks.listarEquipamentos,
    listarClientes: vi.fn().mockResolvedValue([]),
    buscarCliente: vi.fn(),
  },
}));
vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({ warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}));

const clientePj = {
  id: 42,
  nome: "ACME COMERCIO LTDA",
  razao_social: "ACME COMERCIO LTDA",
  nome_fantasia: null,
  tipo_pessoa: "PJ",
  documento: "11222333000181",
} as unknown as Cliente;

describe("ClienteSelector equipamentos anteriores", () => {
  beforeEach(() => vi.clearAllMocks());

  it("busca pelo cliente_id, mesmo para PJ sem nome fantasia", async () => {
    mocks.listarEquipamentosCliente.mockResolvedValue([
      { id: 9, cliente_id: 42, serial_number: "SN-9", marca: "Zebra", modelo: "ZD220", tipo: "Impressora", status: "PRONTO" } as Equipamento,
    ]);
    render(
      <MemoryRouter>
        <ClienteSelector clienteInicial={clientePj} onClienteSelecionado={vi.fn()} onClienteRemovido={vi.fn()} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(mocks.listarEquipamentosCliente).toHaveBeenCalledWith(42, expect.arrayContaining(["ACME COMERCIO LTDA"])));
    expect(mocks.listarEquipamentos).not.toHaveBeenCalled();
    expect(await screen.findByText(/SN-9/)).toBeInTheDocument();
  });
});
