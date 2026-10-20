import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OrcamentoInsumos } from "@/types";

const mocks = vi.hoisted(() => ({
  listar: vi.fn(),
  ensureSensitiveAccess: vi.fn(),
  dialogProps: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { listarOrcamentosInsumos: mocks.listar } }));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: mocks.ensureSensitiveAccess }),
}));
vi.mock("@/pages/insumos/OrcamentoInsumosDialog", () => ({
  OrcamentoInsumosDialog: (props: { open: boolean; orcamentoId?: number | null }) => {
    mocks.dialogProps(props);
    return props.open ? <div data-testid="dialogo">{props.orcamentoId ?? "novo"}</div> : null;
  },
}));

import { OrcamentosInsumosTab } from "@/pages/insumos/OrcamentosInsumosTab";

function linha(numero: number, status: OrcamentoInsumos["status"], valor: number): OrcamentoInsumos {
  return {
    id: numero * 10,
    empresa_id: 1,
    numero,
    numero_exibicao: `OI-${numero}`,
    cliente_id: 3,
    cliente_nome: `Cliente ${numero}`,
    status,
    desconto: 0,
    valor_subtotal: valor,
    valor_total: valor,
    criado_em: "2026-10-20 14:03:05+00",
    atualizado_em: "2026-10-20 14:03:05+00",
    total_itens: numero,
  };
}

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureSensitiveAccess.mockResolvedValue(true);
  mocks.listar.mockResolvedValue({
    items: [linha(2, "APROVADO", 150), linha(1, "RASCUNHO", 20.5)],
    total: 2,
  });
});

describe("OrcamentosInsumosTab", () => {
  it("lista número, cliente, data, valor e status com a cor do status", async () => {
    render(<OrcamentosInsumosTab />);
    const primeira = await screen.findByRole("row", { name: /abrir orçamento OI-2/i });
    expect(within(primeira).getByText("OI-2")).toBeInTheDocument();
    expect(within(primeira).getByText("Cliente 2")).toBeInTheDocument();
    expect(within(primeira).getByText("2 itens")).toBeInTheDocument();
    expect(within(primeira).getByText(/R\$\s*150,00/)).toBeInTheDocument();
    expect(within(primeira).getByText("20/10/2026")).toBeInTheDocument();
    expect(within(primeira).getByText("Aprovado").className).toMatch(/green/);

    const segunda = screen.getByRole("row", { name: /abrir orçamento OI-1/i });
    expect(within(segunda).getByText("1 item")).toBeInTheDocument();
    expect(within(segunda).getByText("Rascunho")).toBeInTheDocument();
    expect(mocks.listar).toHaveBeenCalledWith({ busca: undefined, status: "TODOS", page: 0 });
  });

  it("busca por texto recarrega a lista com o filtro", async () => {
    render(<OrcamentosInsumosTab />);
    await screen.findByText("OI-2");
    fireEvent.change(screen.getByLabelText("Buscar orçamento"), { target: { value: "OI-1" } });
    await waitFor(() => expect(mocks.listar).toHaveBeenLastCalledWith({ busca: "OI-1", status: "TODOS", page: 0 }));
  });

  it("filtra por status", async () => {
    const usuario = userEvent.setup();
    render(<OrcamentosInsumosTab />);
    await screen.findByText("OI-2");
    await usuario.click(screen.getByRole("combobox", { name: "Filtrar por status" }));
    await usuario.click(await screen.findByRole("option", { name: "Aprovado" }));
    await waitFor(() => expect(mocks.listar).toHaveBeenLastCalledWith({ busca: undefined, status: "APROVADO", page: 0 }));
  });

  it("clicar numa linha abre o orçamento", async () => {
    render(<OrcamentosInsumosTab />);
    fireEvent.click(await screen.findByRole("row", { name: /abrir orçamento OI-1/i }));
    expect(await screen.findByTestId("dialogo")).toHaveTextContent("10");
  });

  it("novo orçamento pede PIN financeiro antes de abrir em branco", async () => {
    render(<OrcamentosInsumosTab />);
    await screen.findByText("OI-2");
    fireEvent.click(screen.getByRole("button", { name: /novo orçamento/i }));
    expect(await screen.findByTestId("dialogo")).toHaveTextContent("novo");
    expect(mocks.ensureSensitiveAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "FINANCIAL_ACTIONS" }));
  });

  it("PIN recusado não abre o formulário", async () => {
    mocks.ensureSensitiveAccess.mockResolvedValue(false);
    render(<OrcamentosInsumosTab />);
    await screen.findByText("OI-2");
    fireEvent.click(screen.getByRole("button", { name: /novo orçamento/i }));
    await waitFor(() => expect(mocks.ensureSensitiveAccess).toHaveBeenCalled());
    expect(screen.queryByTestId("dialogo")).toBeNull();
  });

  it("estado vazio e erro de carga", async () => {
    mocks.listar.mockResolvedValueOnce({ items: [], total: 0 });
    const { unmount } = render(<OrcamentosInsumosTab />);
    expect(await screen.findByText("Nenhum orçamento de insumos encontrado")).toBeInTheDocument();
    unmount();

    mocks.listar.mockRejectedValueOnce("Falha ao consultar o banco");
    render(<OrcamentosInsumosTab />);
    expect(await screen.findByText(/Falha ao consultar o banco/)).toBeInTheDocument();
  });
});
