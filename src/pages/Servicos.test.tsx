import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({ listar: vi.fn(), reativar: vi.fn(), deletar: vi.fn(), contar: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { listarServicosPaginados: mocks.listar, reativarServico: mocks.reativar, deletarServico: mocks.deletar, contarServicos: mocks.contar } }));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ ensureSensitiveAccess: vi.fn().mockResolvedValue(true) }) }));
vi.mock("@/hooks/useNotification", () => ({ useNotification: () => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));
vi.mock("@/components/equipamentos/PecasDoServico", () => ({ PecasDoServico: () => null }));

import Servicos from "./Servicos";

const ativo = { id: 1, nome: "Limpeza da cabeça", descricao: "Limpeza e alinhamento", preco_padrao: 120, ativo: true };
const garantia = { id: 2, nome: "Revisão em garantia", preco_padrao: 0, ativo: true };
const inativo = { id: 3, nome: "Visita técnica", preco_padrao: 150, ativo: false };

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listar.mockImplementation(async (_busca: unknown, situacao: string) =>
    situacao === "ATIVOS" ? { items: [ativo, garantia], total: 2 }
      : situacao === "INATIVOS" ? { items: [inativo], total: 1 }
        : { items: [ativo, garantia, inativo], total: 3 },
  );
  mocks.reativar.mockResolvedValue({ ...inativo, ativo: true });
  mocks.contar.mockResolvedValue({ ativos: 2, inativos: 1 });
  mocks.deletar.mockResolvedValue(undefined);
});

describe("Serviços (fase 8)", () => {
  it("cartões com preço base, garantia e o total de ativos no cabeçalho", async () => {
    render(<Servicos />);
    const lista = await screen.findByRole("list", { name: "Serviços" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    expect(within(lista).getByText("R$ 120,00")).toBeInTheDocument();
    expect(within(lista).getByText("Garantia")).toBeInTheDocument();
    expect(screen.getByText("2 ativos")).toBeInTheDocument();
    expect(mocks.listar).toHaveBeenCalledWith(undefined, "ATIVOS", 0);
    // Cada filtro mostra o seu número, como no canvas.
    expect(screen.getByRole("button", { name: /^Ativos\s*2$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Inativos\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Todos\s*3$/ })).toBeInTheDocument();
  });

  it("Todos mostra o inativo com o interruptor desligado e Editar", async () => {
    render(<Servicos />);
    await screen.findByRole("list", { name: "Serviços" });
    await userEvent.click(screen.getByRole("button", { name: /^Todos/ }));
    await waitFor(() => expect(mocks.listar).toHaveBeenLastCalledWith(undefined, "TODOS", 0));
    const cartao = (await screen.findByText("Visita técnica")).closest("li")!;
    expect(within(cartao).getByRole("switch", { name: "Serviço ativo: Visita técnica" })).toHaveAttribute("aria-checked", "false");
    expect(within(cartao).getByRole("button", { name: "Editar Visita técnica" })).toBeInTheDocument();
    expect(within(cartao).queryByRole("combobox", { name: "Mais ações" })).toBeNull();
  });

  it("Inativos lista só os desativados e o interruptor reativa", async () => {
    render(<Servicos />);
    await screen.findByRole("list", { name: "Serviços" });
    await userEvent.click(screen.getByRole("button", { name: /^Inativos/ }));
    await waitFor(() => expect(mocks.listar).toHaveBeenLastCalledWith(undefined, "INATIVOS", 0));
    await userEvent.click(await screen.findByRole("switch", { name: "Serviço ativo: Visita técnica" }));
    await waitFor(() => expect(mocks.reativar).toHaveBeenCalledWith(3));
    expect(mocks.deletar).not.toHaveBeenCalled();
  });

  it("desligar o interruptor pede confirmação antes de desativar", async () => {
    render(<Servicos />);
    await userEvent.click(await screen.findByRole("switch", { name: "Serviço ativo: Limpeza da cabeça" }));
    expect(await screen.findByRole("heading", { name: "Desativar o serviço?" })).toBeInTheDocument();
    expect(screen.getByText(/"Limpeza da cabeça" deixará de aparecer na verificação técnica/)).toBeInTheDocument();
    expect(mocks.deletar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Desativar o serviço" }));
    await waitFor(() => expect(mocks.deletar).toHaveBeenCalledWith(1));
  });

  it("volta para a página lembrada e não a perde enquanto o total carrega", async () => {
    sessionStorage.setItem("autoos:lista:servicos:pagina", JSON.stringify(2));
    mocks.listar.mockResolvedValue({ items: [ativo], total: 40 });
    render(<Servicos />);
    await screen.findByText("Limpeza da cabeça");
    await waitFor(() => expect(mocks.listar).toHaveBeenLastCalledWith(undefined, "ATIVOS", 1));
    expect(mocks.listar.mock.calls.every((chamada) => chamada[2] === 1)).toBe(true);
  });
});
