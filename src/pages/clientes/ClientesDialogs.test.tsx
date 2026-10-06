import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ClientesFormDialog } from "./ClientesDialogs";

vi.mock("@/components/clientes/ClienteFormularioCampos", () => ({
  ClienteFormularioCampos: () => null,
}));

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  editando: null,
  form: { handleSubmit: () => vi.fn() } as any,
  tipoPessoa: null,
  buscarCep: vi.fn(),
  buscandoCep: false,
  salvando: false,
  onBuscarClienteExistente: vi.fn(),
  onSubmit: vi.fn(),
};

describe("orientação para CPF/CNPJ duplicado", () => {
  it("oferece busca quando o conflito é com cliente ativo", () => {
    render(
      <ClientesFormDialog
        {...baseProps}
        erroDocumentoDuplicado="Este CPF/CNPJ já está cadastrado em um cliente ativo."
      />,
    );

    expect(screen.getByRole("button", { name: "Buscar cliente existente" })).toBeInTheDocument();
  });

  it("não oferece busca de ativos quando o cadastro pode estar inativo", () => {
    render(
      <ClientesFormDialog
        {...baseProps}
        erroDocumentoDuplicado="Este CPF/CNPJ já está cadastrado. O cliente pode estar inativo; peça a um administrador para localizar ou reativar o cadastro."
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("administrador");
    expect(screen.queryByRole("button", { name: "Buscar cliente existente" })).not.toBeInTheDocument();
  });
});
