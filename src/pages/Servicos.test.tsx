import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({ listar: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { listarServicosPaginados: mocks.listar } }));
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
  mocks.listar.mockImplementation(async (_busca: unknown, apenasAtivos: boolean) =>
    apenasAtivos ? { items: [ativo, garantia], total: 2 } : { items: [ativo, garantia, inativo], total: 3 },
  );
});

describe("Serviços (fase 8)", () => {
  it("cartões com preço base, garantia e o total de ativos no cabeçalho", async () => {
    render(<Servicos />);
    const lista = await screen.findByRole("list", { name: "Serviços" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    expect(within(lista).getByText("R$ 120,00")).toBeInTheDocument();
    expect(within(lista).getByText("Garantia")).toBeInTheDocument();
    expect(screen.getByText("2 ativos")).toBeInTheDocument();
    expect(mocks.listar).toHaveBeenCalledWith(undefined, true, 0);
  });

  it("Todos mostra o inativo com selo e sem Excluir (o app não reativa)", async () => {
    render(<Servicos />);
    await screen.findByRole("list", { name: "Serviços" });
    await userEvent.click(screen.getByRole("button", { name: /^Todos/ }));
    await waitFor(() => expect(mocks.listar).toHaveBeenLastCalledWith(undefined, false, 0));
    const cartao = (await screen.findByText("Visita técnica")).closest("li")!;
    expect(within(cartao).getByText("Inativo")).toBeInTheDocument();
    expect(within(cartao).getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(within(cartao).queryByRole("combobox", { name: "Mais ações" })).toBeNull();
  });
});
