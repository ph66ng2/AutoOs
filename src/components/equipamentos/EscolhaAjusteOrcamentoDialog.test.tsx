import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EscolhaAjusteOrcamentoDialog } from "@/components/equipamentos/EscolhaAjusteOrcamentoDialog";
import type { AnaliseAjusteOrcamento } from "@/types";

function analise(overrides: Partial<AnaliseAjusteOrcamento> = {}): AnaliseAjusteOrcamento {
  return {
    status: "APROVADO",
    podePedirNovaAprovacao: true,
    jaPublicado: true,
    versaoAberta: null,
    respostaPendente: null,
    pecasBaixadas: [{ produtoId: 1, nome: "Cabeça", quantidade: 3 }],
    totalBaixado: 3,
    exigeDecisaoEstoque: true,
    ...overrides,
  };
}

function abrir(props: Partial<React.ComponentProps<typeof EscolhaAjusteOrcamentoDialog>> = {}) {
  const onConfirmar = vi.fn();
  const onCancelar = vi.fn();
  render(
    <EscolhaAjusteOrcamentoDialog
      open
      variante="aprovado"
      analise={analise()}
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
      {...props}
    />,
  );
  return { onConfirmar, onCancelar };
}

describe("EscolhaAjusteOrcamentoDialog", () => {
  it("oferece as duas escolhas e começa em ajuste sem nova aprovação", () => {
    const { onConfirmar } = abrir();
    expect(screen.getByLabelText(/Ajuste sem nova aprovação/)).toBeChecked();
    expect(screen.getByLabelText(/Pedir nova aprovação ao cliente/)).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" }));
    expect(onConfirmar).toHaveBeenCalledWith({ modoAprovado: "SEM_NOVA_APROVACAO", devolverEstoque: false });
  });

  it("pedir nova aprovação exige confirmar a devolução das peças ao estoque", () => {
    const { onConfirmar } = abrir();
    fireEvent.click(screen.getByLabelText(/Pedir nova aprovação ao cliente/));
    const salvar = screen.getByRole("button", { name: "Salvar alteração" });
    expect(screen.getByText("3 × Cabeça")).toBeInTheDocument();
    expect(salvar).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Confirmo que estas peças estão intactas/));
    expect(salvar).toBeEnabled();
    fireEvent.click(salvar);
    expect(onConfirmar).toHaveBeenCalledWith({ modoAprovado: "NOVA_APROVACAO", devolverEstoque: true });
  });

  it("sem peças baixadas, pedir nova aprovação não pede confirmação de estoque", () => {
    const { onConfirmar } = abrir({ analise: analise({ pecasBaixadas: [], totalBaixado: 0, exigeDecisaoEstoque: false }) });
    fireEvent.click(screen.getByLabelText(/Pedir nova aprovação ao cliente/));
    expect(screen.queryByLabelText(/Confirmo que estas peças/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" }));
    expect(onConfirmar).toHaveBeenCalledWith({ modoAprovado: "NOVA_APROVACAO", devolverEstoque: false });
  });

  it("com o serviço em andamento, só permite o ajuste sem nova aprovação", () => {
    abrir({ analise: analise({ status: "EM_MANUTENCAO", podePedirNovaAprovacao: false }) });
    expect(screen.getByLabelText(/Pedir nova aprovação ao cliente/)).toBeDisabled();
    expect(screen.getByText(/enquanto o orçamento está Aprovado/)).toBeInTheDocument();
  });

  it("avisa que a nova versão anula a resposta pendente do cliente e pede confirmação", () => {
    const { onConfirmar, onCancelar } = abrir({
      variante: "pendente",
      analise: analise({
        status: "AGUARDANDO_APROVACAO",
        podePedirNovaAprovacao: false,
        respostaPendente: { decisao: "APROVAR", contato: "Ana", registradaEm: "2026-10-19T10:00:00Z" },
      }),
    });
    expect(screen.getByText(/Ana aprovou pelo portal/)).toBeInTheDocument();
    expect(screen.getByText(/a resposta anterior deixa de valer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onCancelar).toHaveBeenCalled();
    expect(onConfirmar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Publicar nova versão e anular a resposta/ }));
    expect(onConfirmar).toHaveBeenCalledWith({ confirmarRespostaPendente: true });
  });
});
