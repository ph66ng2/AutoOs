import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClienteContato, Equipamento } from "@/types";

const mockListar = vi.hoisted(() => vi.fn());
const mockCriar = vi.hoisted(() => vi.fn());
const mockAtualizar = vi.hoisted(() => vi.fn());
const mockDefinir = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    listarClienteContatos: mockListar,
    criarClienteContato: mockCriar,
    atualizarClienteContato: mockAtualizar,
    definirResponsavelEquipamento: mockDefinir,
  },
}));

import { QuemRecebeOrcamentoDialog } from "@/components/equipamentos/QuemRecebeOrcamentoDialog";

const equipamento = {
  id: 5,
  empresa_id: 7,
  cliente_id: 11,
  serial_number: "SN-1",
  marca: "HP",
  modelo: "M404",
  tipo: "Impressora",
  status: "RECEBIDO",
  defeito_relatado: "Não imprime",
  atualizado_em: "2026-10-20T10:00:00Z",
} as Equipamento;

const contatoCriado: ClienteContato = {
  id: 30,
  empresa_id: 7,
  cliente_id: 11,
  nome: "Bruno",
  telefone: "71988880000",
  ativo: true,
};

function renderDialog(props: Partial<Parameters<typeof QuemRecebeOrcamentoDialog>[0]> = {}) {
  const onSalvo = vi.fn();
  const onCancelar = vi.fn();
  render(
    <QuemRecebeOrcamentoDialog
      open
      equipamento={equipamento}
      sugestao={{ nome: "", telefone: "", email: "" }}
      onSalvo={onSalvo}
      onCancelar={onCancelar}
      {...props}
    />,
  );
  return { onSalvo, onCancelar };
}

describe("QuemRecebeOrcamentoDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListar.mockResolvedValue([]);
    mockCriar.mockResolvedValue(contatoCriado);
    mockAtualizar.mockResolvedValue(contatoCriado);
    mockDefinir.mockResolvedValue({ ...equipamento, responsavel_contato_id: 30, atualizado_em: "2026-10-21T10:00:00Z" });
  });

  it("valida o celular antes de gravar", async () => {
    const user = userEvent.setup();
    const { onSalvo } = renderDialog();

    await waitFor(() => expect(screen.getByRole("button", { name: /salvar e continuar/i })).toBeEnabled());
    await user.type(screen.getByLabelText("Nome *"), "Bruno");
    await user.type(screen.getByLabelText("WhatsApp *"), "1234");
    await user.click(screen.getByRole("button", { name: /salvar e continuar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Informe o celular com DDD e o 9 (11 dígitos).",
    );
    expect(mockCriar).not.toHaveBeenCalled();
    expect(mockDefinir).not.toHaveBeenCalled();
    expect(onSalvo).not.toHaveBeenCalled();
  });

  it("cria o contato e depois vincula ao equipamento, na ordem certa", async () => {
    const user = userEvent.setup();
    const { onSalvo } = renderDialog();

    await waitFor(() => expect(screen.getByRole("button", { name: /salvar e continuar/i })).toBeEnabled());
    await user.type(screen.getByLabelText("Nome *"), "Bruno");
    await user.type(screen.getByLabelText("WhatsApp *"), "71988880000");
    await user.click(screen.getByRole("button", { name: /salvar e continuar/i }));

    await waitFor(() => expect(onSalvo).toHaveBeenCalledTimes(1));
    expect(mockCriar).toHaveBeenCalledWith({
      empresa_id: 7,
      cliente_id: 11,
      nome: "Bruno",
      email: undefined,
      telefone: "71988880000",
    });
    expect(mockAtualizar).not.toHaveBeenCalled();
    expect(mockDefinir).toHaveBeenCalledWith(5, 30, "2026-10-20T10:00:00Z");
    expect(mockCriar.mock.invocationCallOrder[0]).toBeLessThan(mockDefinir.mock.invocationCallOrder[0]);
    expect(onSalvo).toHaveBeenCalledWith(expect.objectContaining({ id: 5, responsavel_contato_id: 30 }));
  });

  it("mostra o erro sem fechar quando o vínculo falha", async () => {
    const user = userEvent.setup();
    mockDefinir.mockRejectedValue("Conflito de concorrência");
    const { onSalvo, onCancelar } = renderDialog({ sugestao: { nome: "Bruno", telefone: "71988880000", email: "" } });

    await waitFor(() => expect(screen.getByRole("button", { name: /salvar e continuar/i })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /salvar e continuar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("foi cadastrado no cliente, mas não foi vinculado");
    expect(onSalvo).not.toHaveBeenCalled();
    expect(onCancelar).not.toHaveBeenCalled();
    expect(screen.getByText("Quem recebe o orçamento?")).toBeInTheDocument();
  });

  it("atualiza o contato ativo sem telefone em vez de criar outro", async () => {
    const user = userEvent.setup();
    mockListar.mockResolvedValue([
      { id: 30, empresa_id: 7, cliente_id: 11, nome: "Bruno", ativo: true, telefone: "", atualizado_em: "2026-10-01T00:00:00Z" },
    ] as unknown as ClienteContato[]);
    const { onSalvo } = renderDialog();

    await waitFor(() => expect(screen.getByLabelText("Nome *")).toHaveValue("Bruno"));
    await waitFor(() => expect(screen.getByRole("button", { name: /salvar e continuar/i })).toBeEnabled());
    await user.type(screen.getByLabelText("WhatsApp *"), "71988880000");
    await user.click(screen.getByRole("button", { name: /salvar e continuar/i }));

    await waitFor(() => expect(onSalvo).toHaveBeenCalledTimes(1));
    expect(mockListar).toHaveBeenCalledWith(11, 7);
    expect(mockAtualizar).toHaveBeenCalledWith(30, {
      empresa_id: 7,
      cliente_id: 11,
      nome: "Bruno",
      email: undefined,
      telefone: "71988880000",
      atualizado_em: "2026-10-01T00:00:00Z",
    });
    expect(mockCriar).not.toHaveBeenCalled();
    expect(mockDefinir).toHaveBeenCalledWith(5, 30, "2026-10-20T10:00:00Z");
  });

  it("não copia telefone nem e-mail do cliente para o contato reaproveitado", async () => {
    mockListar.mockResolvedValue([
      { id: 30, empresa_id: 7, cliente_id: 11, nome: "Bruno", ativo: true, telefone: "", atualizado_em: "2026-10-01T00:00:00Z" },
    ] as unknown as ClienteContato[]);
    renderDialog({ sugestao: { nome: "Recepção", telefone: "7133334444", email: "recepcao@cliente.com" } });

    await waitFor(() => expect(screen.getByLabelText("Nome *")).toHaveValue("Bruno"));
    await waitFor(() => expect(screen.getByRole("button", { name: /salvar e continuar/i })).toBeEnabled());
    expect(screen.getByLabelText("WhatsApp *")).toHaveValue("");
    expect(screen.getByLabelText("E-mail")).toHaveValue("");
  });

  it("bloqueia o salvamento e avisa quando a listagem de contatos falha", async () => {
    mockListar.mockRejectedValue("sem conexão");
    renderDialog({ sugestao: { nome: "Bruno", telefone: "71988880000", email: "" } });

    expect(await screen.findByText(/Não foi possível carregar os contatos do cliente/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar e continuar/i })).toBeDisabled();
    expect(mockCriar).not.toHaveBeenCalled();
    expect(mockAtualizar).not.toHaveBeenCalled();
  });

  it("relê o contato após conflito e a nova tentativa usa o token atualizado", async () => {
    const user = userEvent.setup();
    const base = { id: 30, empresa_id: 7, cliente_id: 11, nome: "Bruno", ativo: true, telefone: "" };
    mockListar
      .mockResolvedValueOnce([{ ...base, atualizado_em: "2026-10-01T00:00:00Z" }] as unknown as ClienteContato[])
      .mockResolvedValueOnce([{ ...base, atualizado_em: "2026-10-02T00:00:00Z" }] as unknown as ClienteContato[]);
    mockAtualizar.mockRejectedValueOnce("Contato não encontrado, inativo ou alterado por outro operador.");
    const { onSalvo } = renderDialog();

    await waitFor(() => expect(screen.getByLabelText("Nome *")).toHaveValue("Bruno"));
    await waitFor(() => expect(screen.getByRole("button", { name: /salvar e continuar/i })).toBeEnabled());
    await user.type(screen.getByLabelText("WhatsApp *"), "71988880000");
    await user.click(screen.getByRole("button", { name: /salvar e continuar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível atualizar o contato");
    await waitFor(() => expect(screen.getByRole("button", { name: /salvar e continuar/i })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /salvar e continuar/i }));

    await waitFor(() => expect(onSalvo).toHaveBeenCalledTimes(1));
    expect(mockAtualizar).toHaveBeenCalledTimes(2);
    expect(mockAtualizar).toHaveBeenNthCalledWith(
      1,
      30,
      expect.objectContaining({ atualizado_em: "2026-10-01T00:00:00Z" }),
    );
    expect(mockAtualizar).toHaveBeenLastCalledWith(30, expect.objectContaining({ atualizado_em: "2026-10-02T00:00:00Z" }));
    expect(mockCriar).not.toHaveBeenCalled();
  });

  it("permite escolher qual contato sem WhatsApp atualizar", async () => {
    const user = userEvent.setup();
    mockListar.mockResolvedValue([
      { id: 30, empresa_id: 7, cliente_id: 11, nome: "Bruno", ativo: true, telefone: "", atualizado_em: "2026-10-01T00:00:00Z" },
      { id: 31, empresa_id: 7, cliente_id: 11, nome: "Carla", ativo: true, telefone: "", atualizado_em: "2026-10-03T00:00:00Z" },
    ] as unknown as ClienteContato[]);
    const { onSalvo } = renderDialog();

    await waitFor(() => expect(screen.getByLabelText("Qual contato atualizar?")).toBeEnabled());
    expect(screen.getByLabelText("Nome *")).toHaveValue("Bruno");
    await user.selectOptions(screen.getByLabelText("Qual contato atualizar?"), "31");
    expect(screen.getByLabelText("Nome *")).toHaveValue("Carla");
    await user.type(screen.getByLabelText("WhatsApp *"), "71988880000");
    await user.click(screen.getByRole("button", { name: /salvar e continuar/i }));

    await waitFor(() => expect(onSalvo).toHaveBeenCalledTimes(1));
    expect(mockAtualizar).toHaveBeenCalledWith(31, expect.objectContaining({
      nome: "Carla",
      telefone: "71988880000",
      atualizado_em: "2026-10-03T00:00:00Z",
    }));
    expect(mockCriar).not.toHaveBeenCalled();
  });

  it("não sobrescreve nome nem e-mail de contato com acesso ao portal", async () => {
    const user = userEvent.setup();
    mockListar.mockResolvedValue([
      {
        id: 30,
        empresa_id: 7,
        cliente_id: 11,
        nome: "Ana Portal",
        email: "ana@portal.test",
        ativo: true,
        telefone: "",
        portal_acesso: "DECIDIR",
        atualizado_em: "2026-10-01T00:00:00Z",
      },
    ] as unknown as ClienteContato[]);
    const { onSalvo } = renderDialog();

    await waitFor(() => expect(screen.getByLabelText("Nome *")).toHaveValue("Ana Portal"));
    expect(screen.getByLabelText("Nome *")).toBeDisabled();
    expect(screen.getByLabelText("E-mail")).toBeDisabled();
    expect(screen.getByText(/nome e e-mail não serão alterados/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText("WhatsApp *"), "71988880000");
    await user.click(screen.getByRole("button", { name: /salvar e continuar/i }));

    await waitFor(() => expect(onSalvo).toHaveBeenCalledTimes(1));
    expect(mockAtualizar).toHaveBeenCalledWith(30, expect.objectContaining({
      nome: "Ana Portal",
      email: "ana@portal.test",
      telefone: "71988880000",
    }));
  });

  it("recusa telefone fixo de 10 dígitos como WhatsApp", async () => {
    const user = userEvent.setup();
    const { onSalvo } = renderDialog();

    await waitFor(() => expect(screen.getByRole("button", { name: /salvar e continuar/i })).toBeEnabled());
    await user.type(screen.getByLabelText("Nome *"), "Bruno");
    await user.type(screen.getByLabelText("WhatsApp *"), "7133334444");
    await user.click(screen.getByRole("button", { name: /salvar e continuar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Informe o celular com DDD e o 9 (11 dígitos).",
    );
    expect(mockCriar).not.toHaveBeenCalled();
    expect(onSalvo).not.toHaveBeenCalled();
  });
});
