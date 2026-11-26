import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";


const buscarProduto = vi.hoisted(() => vi.fn());
const registrarMovimentacao = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useInsumos", () => ({
  useInsumos: () => ({
    produtos: [],
    total: 0,
    loading: false,
    error: null,
    insumosAbaixoMinimo: 2,
    criar: vi.fn(),
    atualizar: vi.fn(),
    deletar: vi.fn(),
    registrarMovimentacao: registrarMovimentacao,
    consultarUsoEmOrcamentos: vi.fn().mockResolvedValue(null),
    buscarProduto: buscarProduto,
    recarregar: vi.fn(),
  }),
}));
const acesso = vi.hoisted(() => ({ veDespesas: true }));
const resumoMock = vi.hoisted(() => ({ resumo: null as unknown }));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: vi.fn().mockResolvedValue(true), hasPermission: () => acesso.veDespesas }),
}));
vi.mock("@/hooks/useResumoEstoque", () => ({
  useResumoEstoque: () => ({ resumo: resumoMock.resumo, recarregar: vi.fn() }),
}));
vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/pages/insumos/OrcamentosInsumosTab", () => ({
  OrcamentosInsumosTab: ({ onEstoqueAlterado }: { onEstoqueAlterado?: () => void }) => (
    <div data-testid="aba-orcamentos">
      Lista de orçamentos
      <button onClick={onEstoqueAlterado}>aprovar-oi</button>
    </div>
  ),
}));

import Insumos from "@/pages/Insumos";

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

describe("Insumos: só o estoque", () => {
  it("vindo do Estoque baixo do Início, a busca já vem preenchida com o item", async () => {
    const { MemoryRouter } = await import("react-router-dom");
    render(
      <MemoryRouter initialEntries={[{ pathname: "/insumos", state: { busca: "CAB-420" } }]}>
        <Insumos />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Buscar insumos e peças")).toHaveValue("CAB-420");
  });

  it("abre no estoque, com o botão de novo item e o alerta de mínimo", () => {
    render(<Insumos />);
    expect(screen.getByRole("button", { name: /novo item/i })).toBeInTheDocument();
    expect(screen.getByText("Abaixo do mínimo").parentElement).toHaveTextContent(/Abaixo do mínimo\s*2/);
    expect(screen.getByPlaceholderText(/buscar por nome, código/i)).toBeInTheDocument();
  });

  it("os orçamentos de insumos não aparecem mais aqui (foram para Vendas de insumos)", () => {
    render(<Insumos />);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByTestId("aba-orcamentos")).toBeNull();
  });
});

describe("Insumos: valor em estoque", () => {
  it("some na hora quando o perfil atual não vê despesas, mesmo com um valor já lido", () => {
    resumoMock.resumo = { totalItens: 3, porCategoria: [], abaixoMinimo: 0, aguardandoPeca: 0, saidasMes: 0, saidasMesOs: 0, valorEstoque: 1500 };
    acesso.veDespesas = true;
    const { rerender } = render(<Insumos />);
    expect(screen.getByText("Valor em estoque")).toBeInTheDocument();
    acesso.veDespesas = false;
    rerender(<Insumos />);
    expect(screen.queryByText("Valor em estoque")).toBeNull();
    resumoMock.resumo = null;
    acesso.veDespesas = true;
  });
});

describe("Insumos: entrada pedida por uma venda de insumos", () => {
  it("abre a movimentação de entrada do item já com a quantidade que falta", async () => {
    buscarProduto.mockResolvedValue({ id: 9, codigo: "RIB-CE", nome: "Ribbon cera 110x74", categoria: "RIBBON", quantidade_estoque: 6, quantidade_minima: 10, preco_custo: 20, preco_venda: 32 });
    window.history.pushState({}, "", "/insumos?entrada=9&quantidade=4");
    render(<Insumos />);
    expect(await screen.findByText("Movimentação de Estoque")).toBeInTheDocument();
    expect(buscarProduto).toHaveBeenCalledWith(9);
    expect(screen.getByRole("spinbutton")).toHaveValue(4);
    expect(window.location.search).toBe("");
  });
});

describe("Insumos: volta para a venda depois da entrada", () => {
  it("salvar a entrada volta para a página da venda; fechar sem salvar não volta", async () => {
    buscarProduto.mockResolvedValue({ id: 9, codigo: "RIB-CE", nome: "Ribbon cera 110x74", categoria: "RIBBON", quantidade_estoque: 6, quantidade_minima: 10, preco_custo: 20, preco_venda: 32 });
    registrarMovimentacao.mockResolvedValue({ sucesso: true });
    const usuario = userEvent.setup();
    window.history.pushState({}, "", "/insumos?entrada=9&quantidade=4&voltar=%2Fvendas%2F34");
    render(<Insumos />);
    await screen.findByText("Movimentação de Estoque");
    await usuario.type(screen.getByPlaceholderText("Compra, uso em manutenção..."), "Compra fornecedor");
    await usuario.click(screen.getByRole("button", { name: "Registrar Movimentação" }));
    await vi.waitFor(() => expect(window.location.pathname).toBe("/vendas/34"));
    expect(registrarMovimentacao).toHaveBeenCalledWith(9, "ENTRADA", 4, "Compra fornecedor", undefined);
  });

  it("não aceita voltar para um endereço que não é de uma venda", async () => {
    buscarProduto.mockResolvedValue({ id: 9, codigo: "RIB-CE", nome: "Ribbon cera 110x74", categoria: "RIBBON", quantidade_estoque: 6, quantidade_minima: 10, preco_custo: 20, preco_venda: 32 });
    registrarMovimentacao.mockResolvedValue({ sucesso: true });
    const usuario = userEvent.setup();
    window.history.pushState({}, "", "/insumos?entrada=9&quantidade=4&voltar=https%3A%2F%2Fexemplo.test");
    render(<Insumos />);
    await screen.findByText("Movimentação de Estoque");
    await usuario.type(screen.getByPlaceholderText("Compra, uso em manutenção..."), "Compra fornecedor");
    await usuario.click(screen.getByRole("button", { name: "Registrar Movimentação" }));
    await vi.waitFor(() => expect(registrarMovimentacao).toHaveBeenCalled());
    expect(window.location.pathname).toBe("/insumos");
  });
});
