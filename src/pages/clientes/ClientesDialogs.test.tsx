import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ClientesFormDialog } from "./ClientesDialogs";

vi.mock("@/components/clientes/ClienteFormularioCampos", () => ({
  ClienteFormularioCampos: () => null,
}));

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  editando: null,
  form: { handleSubmit: () => vi.fn(), setFocus: vi.fn() } as any,
  tipoPessoa: null,
  buscarCep: vi.fn(),
  buscandoCep: false,
  salvando: false,
  onDismissDuplicate: vi.fn(),
  onBuscarClienteExistente: vi.fn(),
  onSubmit: vi.fn(),
};

describe("orientação para CPF/CNPJ duplicado", () => {
  beforeEach(() => vi.clearAllMocks());

  it("oferece busca quando o conflito é com cliente ativo", () => {
    render(
      <ClientesFormDialog
        {...baseProps}
        erroDocumentoDuplicado="Este CPF/CNPJ já está cadastrado em um cliente ativo."
      />,
    );

    const aviso = screen.getByRole("alertdialog", { name: "CPF/CNPJ já cadastrado" });
    expect(aviso).toHaveTextContent("cliente ativo");
    fireEvent.click(screen.getByRole("button", { name: "Buscar cliente existente" }));
    expect(baseProps.onBuscarClienteExistente).toHaveBeenCalled();
  });

  it("não oferece busca de ativos quando o cadastro pode estar inativo", () => {
    render(
      <ClientesFormDialog
        {...baseProps}
        erroDocumentoDuplicado="Este CPF/CNPJ já está cadastrado. O cliente pode estar inativo; peça a um administrador para localizar ou reativar o cadastro."
      />,
    );

    expect(screen.getByRole("alertdialog")).toHaveTextContent("administrador");
    expect(screen.queryByRole("button", { name: "Buscar cliente existente" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Corrigir documento" }));
    expect(baseProps.onDismissDuplicate).toHaveBeenCalled();
    expect(baseProps.onOpenChange).not.toHaveBeenCalled();
  });
});
