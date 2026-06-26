/**
 * Testes do AjusteOrcamentoServicos — lista interativa de serviços com auto-complete
 *
 * Cobre:
 * - Renderização vazia
 * - Adicionar/remover serviço
 * - Bloqueio de remoção do último serviço
 * - Edição de descrição e valor
 * - Auto-complete do catálogo
 * - Cálculo automático do total
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { AjusteOrcamentoServicos } from "../AjusteOrcamentoServicos";
import type { ServicoCatalogo, ServicoNecessario } from "@/types";

const catalogoMock: ServicoCatalogo[] = [
  { id: 101, nome: "Limpeza Geral", descricao: "Limpeza completa", preco_padrao: 150.0, ativo: true },
  { id: 102, nome: "Troca de Cabeça", descricao: "Substituição cabeça térmica", preco_padrao: 450.0, ativo: true },
];

function Wrapper(props: Omit<React.ComponentProps<typeof AjusteOrcamentoServicos>, "onChange">) {
  const [servicos, setServicos] = React.useState(props.servicos);
  return (
    <AjusteOrcamentoServicos
      {...props}
      servicos={servicos}
      onChange={setServicos}
    />
  );
}

describe("AjusteOrcamentoServicos", () => {
  const defaultProps = {
    servicos: [] as ServicoNecessario[],
    catalogo: catalogoMock,
    carregandoCatalogo: false,
    onRemoverTodos: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: () => "test-uuid-123" });
  });

  it("renderiza mensagem vazia quando não há serviços", () => {
    render(<Wrapper {...defaultProps} />);
    expect(screen.getByText("Nenhum serviço adicionado.")).toBeInTheDocument();
  });

  it("adiciona serviço ao clicar no botão", async () => {
    render(<Wrapper {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
    });
    expect(screen.getByPlaceholderText(/Nome do serviço/i)).toBeInTheDocument();
  });

  it("remove serviço ao clicar no botão de lixeira", () => {
    const servicos: ServicoNecessario[] = [
      { id: "s1", descricao: "Teste", valor: 100 },
      { id: "s2", descricao: "Outro", valor: 50 },
    ];
    render(<Wrapper {...defaultProps} servicos={servicos} />);
    const removeButtons = screen.getAllByRole("button", { name: /Remover serviço/i });
    fireEvent.click(removeButtons[0]);
    expect(screen.getAllByPlaceholderText(/Valor/i)).toHaveLength(1);
  });

  it("bloqueia remoção do último serviço e chama onRemoverTodos", () => {
    const servicos: ServicoNecessario[] = [{ id: "s1", descricao: "Teste", valor: 100 }];
    render(<AjusteOrcamentoServicos {...defaultProps} servicos={servicos} onChange={vi.fn()} />);
    const removeButton = screen.getByRole("button", { name: /Remover serviço/i });
    fireEvent.click(removeButton);
    expect(defaultProps.onRemoverTodos).toHaveBeenCalled();
  });

  it("atualiza descrição ao digitar", () => {
    const onChange = vi.fn();
    const servicos: ServicoNecessario[] = [{ id: "s1", descricao: "Teste", valor: 100 }];
    render(<AjusteOrcamentoServicos {...defaultProps} servicos={servicos} onChange={onChange} />);
    const descInput = screen.getByPlaceholderText(/Nome do serviço/i);

    fireEvent.change(descInput, { target: { value: "Novo nome" } });
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "s1", descricao: "Novo nome", catalogo_id: undefined }),
    ]);
  });

  it("atualiza valor ao digitar", () => {
    const onChange = vi.fn();
    const servicos: ServicoNecessario[] = [{ id: "s1", descricao: "Teste", valor: 100 }];
    render(<AjusteOrcamentoServicos {...defaultProps} servicos={servicos} onChange={onChange} />);
    const valorInput = screen.getByPlaceholderText(/Valor/i);

    fireEvent.change(valorInput, { target: { value: "200" } });
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "s1", valor: 200 }),
    ]);
  });

  it("mostra sugestões do catálogo ao digitar", async () => {
    render(<Wrapper {...defaultProps} servicos={[{ id: "s1", descricao: "", valor: 0 }]} />);
    const input = screen.getByPlaceholderText(/Nome do serviço/i);

    await act(async () => {
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "Limpeza" } });
    });

    await waitFor(() => {
      expect(screen.getByText(/Limpeza Geral/i)).toBeInTheDocument();
    });
  });

  it("seleciona serviço do catálogo e preenche valor", async () => {
    const onChange = vi.fn();
    const servicos: ServicoNecessario[] = [{ id: "s1", descricao: "", valor: 0 }];
    render(<AjusteOrcamentoServicos {...defaultProps} servicos={servicos} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/Nome do serviço/i);

    await act(async () => {
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "Limpeza" } });
    });

    await waitFor(() => {
      expect(screen.getByText(/Limpeza Geral/i)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.mouseDown(screen.getByText(/Limpeza Geral/i));
      fireEvent.click(screen.getByText(/Limpeza Geral/i));
    });

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "s1", descricao: "Limpeza Geral", catalogo_id: 101, valor: 150 }),
    ]);
  });

  it("exibe total dos serviços", () => {
    const servicos: ServicoNecessario[] = [
      { id: "s1", descricao: "A", valor: 100 },
      { id: "s2", descricao: "B", valor: 250 },
    ];
    render(<Wrapper {...defaultProps} servicos={servicos} />);
    expect(screen.getByText("Total serviços")).toBeInTheDocument();
    expect(screen.getByText("R$ 350.00")).toBeInTheDocument();
  });

  it("mostra mensagem quando catálogo não retorna resultados", async () => {
    render(<Wrapper {...defaultProps} servicos={[{ id: "s1", descricao: "", valor: 0 }]} />);
    const input = screen.getByPlaceholderText(/Nome do serviço/i);

    await act(async () => {
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "XYZ999" } });
    });

    await waitFor(() => {
      expect(screen.getByText(/Nenhum serviço pré-cadastrado encontrado/i)).toBeInTheDocument();
    });
  });
});
