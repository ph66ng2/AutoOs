import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClienteContato, Equipamento } from "@/types";

const mockCriar = vi.hoisted(() => vi.fn());
const mockDefinir = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    criarClienteContato: mockCriar,
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
    mockCriar.mockResolvedValue(contatoCriado);
    mockDefinir.mockResolvedValue({ ...equipamento, responsavel_contato_id: 30, atualizado_em: "2026-10-21T10:00:00Z" });
  });

  it("valida o celular antes de gravar", async () => {
    const user = userEvent.setup();
    const { onSalvo } = renderDialog();

    await user.type(screen.getByLabelText("Nome *"), "Bruno");
    await user.type(screen.getByLabelText("WhatsApp *"), "1234");
    await user.click(screen.getByRole("button", { name: /salvar e continuar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("WhatsApp com DDD");
    expect(mockCriar).not.toHaveBeenCalled();
    expect(mockDefinir).not.toHaveBeenCalled();
    expect(onSalvo).not.toHaveBeenCalled();
  });

  it("cria o contato e depois vincula ao equipamento, na ordem certa", async () => {
    const user = userEvent.setup();
    const { onSalvo } = renderDialog();

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
    expect(mockDefinir).toHaveBeenCalledWith(5, 30, "2026-10-20T10:00:00Z");
    expect(mockCriar.mock.invocationCallOrder[0]).toBeLessThan(mockDefinir.mock.invocationCallOrder[0]);
    expect(onSalvo).toHaveBeenCalledWith(expect.objectContaining({ id: 5, responsavel_contato_id: 30 }));
  });

  it("mostra o erro sem fechar quando o vínculo falha", async () => {
    const user = userEvent.setup();
    mockDefinir.mockRejectedValue("Conflito de concorrência");
    const { onSalvo, onCancelar } = renderDialog({ sugestao: { nome: "Bruno", telefone: "71988880000", email: "" } });

    await user.click(screen.getByRole("button", { name: /salvar e continuar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("foi cadastrado no cliente, mas não foi vinculado");
    expect(onSalvo).not.toHaveBeenCalled();
    expect(onCancelar).not.toHaveBeenCalled();
    expect(screen.getByText("Quem recebe o orçamento?")).toBeInTheDocument();
  });
});
