import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClienteFormularioCampos } from "@/components/clientes/ClienteFormularioCampos";
import * as cnpjService from "@/lib/cnpj-service";
import type { ClienteFormData } from "@/lib/validations";

const CNPJ = "57522734000158";
const OUTRO_CNPJ = "19131243000197";

const resultadoAtivo: cnpjService.CnpjLookupResult = {
  fonte: "BrasilAPI",
  razao_social: "Empresa Exemplo LTDA",
  nome_fantasia: "Empresa Exemplo",
  telefone: "7133224455",
  email: "contato@empresa.test",
  cep: "40000000",
  endereco: "Rua da Empresa",
  numero: "42",
  complemento: "Sala 2",
  bairro: "Centro",
  cidade: "Salvador",
  uf: "BA",
  situacao_cadastral: "ATIVA",
};

const valoresVazios: ClienteFormData = {
  documento: CNPJ,
  tipo_pessoa: "PJ",
  nome: "",
  razao_social: "",
  nome_fantasia: "",
  inscricao_estadual: "",
  telefone: "",
  telefone_secundario: "",
  email: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  observacoes: "",
};

function FormHarness({
  defaultValues = valoresVazios,
  onSave = vi.fn(),
}: {
  defaultValues?: ClienteFormData;
  onSave?: () => void;
}) {
  const form = useForm<ClienteFormData>({ defaultValues });
  const values = form.watch();

  return (
    <>
      <ClienteFormularioCampos
        form={form}
        tipoPessoa={values.tipo_pessoa === "PJ" ? "PJ" : null}
        buscarCep={vi.fn()}
        buscandoCep={false}
      />
      <div data-testid="dirty-fields">{Object.keys(form.formState.dirtyFields).join(",")}</div>
      <button type="button" onClick={onSave}>Salvar</button>
    </>
  );
}

describe("ClienteFormularioCampos — consulta de CNPJ", () => {
  const consultarSpy = vi.spyOn(cnpjService, "consultarCnpj");

  beforeEach(() => {
    consultarSpy.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("deixa a lupa desabilitada para CPF e CNPJ inválido", () => {
    const { unmount } = render(<FormHarness defaultValues={{ ...valoresVazios, documento: "52998224725", tipo_pessoa: "PF" }} />);
    const lookupButton = screen.getByRole("button", { name: "Buscar dados do CNPJ" });
    expect(lookupButton).toBeDisabled();

    unmount();
    render(<FormHarness defaultValues={{ ...valoresVazios, documento: "57.522.734/0001-59" }} />);
    expect(screen.getByRole("button", { name: "Buscar dados do CNPJ" })).toBeDisabled();
    expect(consultarSpy).not.toHaveBeenCalled();
  });

  it("mostra spinner, bloqueia segunda chamada e preenche somente campos vazios", async () => {
    const user = userEvent.setup();
    let resolveLookup: ((result: cnpjService.CnpjLookupResult) => void) | undefined;
    consultarSpy.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));

    render(
      <FormHarness
        defaultValues={{ ...valoresVazios, email: "digitado@empresa.test", complemento: "Preenchido pelo operador" }}
      />,
    );
    const lookupButton = screen.getByRole("button", { name: "Buscar dados do CNPJ" });
    await user.click(lookupButton);

    expect(lookupButton).toBeDisabled();
    expect(screen.getByText("Consultando dados do CNPJ")).toBeInTheDocument();
    await user.click(lookupButton);
    expect(consultarSpy).toHaveBeenCalledTimes(1);

    resolveLookup?.(resultadoAtivo);
    await screen.findByText("Dados do CNPJ foram preenchidos. Revise as informações antes de salvar.");
    expect(screen.queryByTitle("Copiar detalhes")).not.toBeInTheDocument();

    expect(screen.getByDisplayValue("Empresa Exemplo LTDA")).toBeInTheDocument();
    expect(screen.getByDisplayValue("(71) 3322-4455")).toBeInTheDocument();
    expect(screen.getByDisplayValue("40000-000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("digitado@empresa.test")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Preenchido pelo operador")).toBeInTheDocument();
    expect(screen.getByTestId("dirty-fields")).toHaveTextContent(/razao_social/);
    expect(screen.getByTestId("dirty-fields")).toHaveTextContent(/telefone/);
  });

  it("exibe aviso para situação não ativa sem impedir edição ou salvar", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    consultarSpy.mockResolvedValue({ ...resultadoAtivo, situacao_cadastral: "BAIXADA" });
    render(<FormHarness onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Buscar dados do CNPJ" }));
    expect(await screen.findByText("Dados do CNPJ foram preenchidos. Revise as informações antes de salvar.")).toBeInTheDocument();

    const email = screen.getByPlaceholderText("email@exemplo.com");
    await user.type(email, "manual@empresa.test");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("mantém o formulário editável após falha e limpa o resultado ao alterar o CNPJ", async () => {
    const user = userEvent.setup();
    consultarSpy.mockRejectedValue(new cnpjService.CnpjLookupError("offline", "offline"));
    render(<FormHarness />);

    const documentInput = screen.getByLabelText("CPF ou CNPJ *");
    await user.click(screen.getByRole("button", { name: "Buscar dados do CNPJ" }));
    expect(await screen.findByText("Não foi possível consultar o CNPJ agora. Você pode preencher os dados manualmente.")).toBeInTheDocument();
    expect(screen.getByTitle("Copiar detalhes")).toBeInTheDocument();
    await user.click(screen.getByText("Ver detalhes técnicos"));
    expect(screen.getByText(/Falha após \d+ ms\. Código: offline/i)).toBeInTheDocument();
    expect(documentInput).not.toBeDisabled();

    consultarSpy.mockResolvedValue(resultadoAtivo);
    await user.click(screen.getByRole("button", { name: "Buscar dados do CNPJ" }));
    await screen.findByText("Dados do CNPJ foram preenchidos. Revise as informações antes de salvar.");

    fireEvent.change(documentInput, { target: { value: OUTRO_CNPJ } });
    await waitFor(() => expect(screen.queryByText("Dados do CNPJ foram preenchidos. Revise as informações antes de salvar.")).not.toBeInTheDocument());
  });

  it("não dispara salvamento ao consultar", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    consultarSpy.mockResolvedValue(resultadoAtivo);
    render(<FormHarness onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Buscar dados do CNPJ" }));
    await screen.findByText("Dados do CNPJ foram preenchidos. Revise as informações antes de salvar.");
    expect(onSave).not.toHaveBeenCalled();
  });
});
