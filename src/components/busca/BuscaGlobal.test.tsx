import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    listarEquipamentosPaginados: vi.fn(),
    listarClientesPaginados: vi.fn(),
    listarProdutosPaginados: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({ db }));

import { BuscaGlobal } from "./BuscaGlobal";

function Onde() {
  const location = useLocation();
  return <p data-testid="onde">{location.pathname}{JSON.stringify(location.state ?? null)}</p>;
}

function montar() {
  const onAbertaChange = vi.fn();
  render(
    <MemoryRouter initialEntries={["/"]}>
      <BuscaGlobal aberta onAbertaChange={onAbertaChange} telas={[{ label: "Clientes", path: "/clientes" }, { label: "Insumos e peças", path: "/insumos" }]} />
      <Routes><Route path="*" element={<Onde />} /></Routes>
    </MemoryRouter>,
  );
  return { onAbertaChange };
}

describe("BuscaGlobal (Ctrl+K)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.listarEquipamentosPaginados.mockResolvedValue({ items: [{ id: 7, marca: "Zebra", modelo: "ZD220", serial_number: "ZB123", status: "RECEBIDO", cliente_nome: "Gráfica Sol" }], total: 1 });
    db.listarClientesPaginados.mockResolvedValue({ items: [{ id: 3, nome: "Gráfica Sol", documento: "12345678000199" }], total: 1 });
    db.listarProdutosPaginados.mockRejectedValue(new Error("sem permissão"));
  });

  it("acha OS e cliente; Enter abre o primeiro; uma fonte com erro não derruba as outras", async () => {
    const user = userEvent.setup();
    const { onAbertaChange } = montar();
    await user.type(screen.getByRole("combobox"), "sol");
    expect(await screen.findByRole("option", { name: /Zebra ZD220/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /^Gráfica Sol/ })).toBeInTheDocument();
    expect(db.listarEquipamentosPaginados).toHaveBeenCalledWith("sol", undefined, 0);
    await user.keyboard("{Enter}");
    expect(onAbertaChange).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("onde")).toHaveTextContent("/equipamentos/7");
  });

  it("setas escolhem; telas aparecem mesmo com uma letra, sem consultar o banco", async () => {
    const user = userEvent.setup();
    montar();
    await user.type(screen.getByRole("combobox"), "i");
    expect(screen.getByRole("option", { name: /Clientes/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Insumos e peças/ })).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByTestId("onde")).toHaveTextContent("/insumos");
    await waitFor(() => expect(db.listarClientesPaginados).not.toHaveBeenCalled());
  });
});

describe("BuscaGlobal: troca de termo", () => {
  it("ao mudar o termo, os resultados do anterior somem antes da nova busca", async () => {
    const user = userEvent.setup();
    db.listarClientesPaginados.mockResolvedValue({ items: [], total: 0 });
    db.listarProdutosPaginados.mockResolvedValue({ items: [], total: 0 });
    db.listarEquipamentosPaginados.mockResolvedValueOnce({ items: [{ id: 7, marca: "Zebra", modelo: "ZD220", serial_number: "AAA", status: "RECEBIDO" }], total: 1 })
      .mockImplementation(() => new Promise(() => undefined));
    montar();
    await user.type(screen.getByRole("combobox"), "aaa");
    expect(await screen.findByRole("option", { name: /Zebra ZD220/ })).toBeInTheDocument();
    await user.clear(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "bbb");
    expect(screen.queryByRole("option", { name: /Zebra ZD220/ })).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("onde")).toHaveTextContent(/^\/null$/);
  });
});
