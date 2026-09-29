import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  criar: vi.fn(),
  atualizar: vi.fn(),
  deletar: vi.fn(),
  recarregar: vi.fn(),
  showError: vi.fn(),
  ensureSensitiveAccess: vi.fn(),
}));

vi.mock("@/hooks/useServicos", () => ({
  useServicos: () => ({
    servicos: [], total: 0, loading: false, error: null,
    criar: mocks.criar, atualizar: mocks.atualizar, deletar: mocks.deletar, recarregar: mocks.recarregar,
  }),
}));
vi.mock("@/hooks/useNotification", () => ({ useNotification: () => ({ error: mocks.showError }) }));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: mocks.ensureSensitiveAccess }),
}));

import Servicos from "@/pages/Servicos";

describe("Servicos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.criar.mockResolvedValue({ sucesso: false, erro: "Serviço indisponível" });
    mocks.ensureSensitiveAccess.mockResolvedValue(true);
  });

  it("mantém formulário aberto e valores digitados quando o cadastro falha", async () => {
    const user = userEvent.setup();
    render(<Servicos />);

    await user.click(screen.getByRole("button", { name: /Novo Serviço/ }));
    const name = screen.getByPlaceholderText("Ex.: Limpeza de cabeça térmica");
    await user.type(name, "Limpeza técnica");
    const price = screen.getByRole("spinbutton");
    fireEvent.change(price, { target: { value: "150" } });
    await user.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => expect(mocks.showError).toHaveBeenCalledWith("Serviços", "Salvar serviço", expect.any(Error)));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(name).toHaveValue("Limpeza técnica");
    expect(price).toHaveValue(150);
  });
});
