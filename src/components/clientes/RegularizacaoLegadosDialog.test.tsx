import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RegularizacaoLegadosDialog } from "./RegularizacaoLegadosDialog";

const previa = {
  empresa_id: 7,
  empresa_nome: "AutoOS",
  token: "opaque",
  expira_em: new Date(Date.now() + 300_000).toISOString(),
  rules_version: 1,
  clientes: 2,
  equipamentos: 3,
  verificacoes: 1,
  imagens: 4,
  comunicacoes: 2,
  equipamentos_sem_cliente: [99],
  contatos_irregulares: 1,
  conflitos: [{ cliente_id: 10, equipamento_id: 20, tipo: "EQUIPAMENTO_OUTRA_EMPRESA" }],
};

describe("RegularizacaoLegadosDialog", () => {
  it("mostra a prévia e exige um PIN novo para confirmar", () => {
    const onConfirm = vi.fn();
    render(<RegularizacaoLegadosDialog open previa={previa} loading={false} onOpenChange={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByText("AutoOS")).toBeInTheDocument();
    expect(screen.getByText(/1 conflito/)).toBeInTheDocument();
    const action = screen.getByRole("button", { name: /Regularizar 12 registro/ });
    expect(action).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/PIN do administrador/), { target: { value: "2468" } });
    expect(action).toBeEnabled();
    fireEvent.click(action);
    expect(onConfirm).toHaveBeenCalledWith("2468");
  });
});
