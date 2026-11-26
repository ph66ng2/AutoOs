import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OrcamentoDaOs, divergenciaDoOrcamento, linhasDoOrcamento } from "./OrcamentoDaOs";
import type { Equipamento, Verificacao } from "@/types";

const verificacao: Verificacao = {
  equipamento_id: 1,
  tecnico_nome: "Ivan",
  problema_relatado: "Falha",
  servicos_necessarios: JSON.stringify([
    { id: "a", descricao: "Troca do rolete", valor: 90, pecas: [{ produto_id: 7, nome: "Rolete", quantidade: 2, valor_unitario: 105 }] },
    { id: "b", descricao: "Calibração", valor: 60 },
  ]),
  pecas_necessarias: JSON.stringify([{ id: "x", nome: "Sensor", quantidade: 1, valorUnitario: 40, valorTotal: 40 }]),
  decisoes_servicos: [{ servico_id: "b", decisao: "REPROVADO" }],
  tempo_estimado: 2,
};

describe("OrcamentoDaOs", () => {
  it("serviços com as peças de cada um, peças avulsas e reprovados marcados", () => {
    const linhas = linhasDoOrcamento(verificacao);
    expect(linhas.map((l) => [l.item, l.tipo, l.valor, l.reprovado])).toEqual([
      ["Troca do rolete", "Serviço", 90, false],
      ["Rolete", "Peça", 210, false],
      ["Calibração", "Serviço", 60, true],
      ["Sensor", "Peça", 40, false],
    ]);
  });

  it("peça do serviço que também está em pecas_necessarias não aparece duas vezes", async () => {
    const { pecasParaOrcamento } = await import("@/lib/orcamento-estoque");
    const servicos = [{ id: "a", descricao: "Troca do rolete", valor: 90, pecas: [{ produto_id: 7, nome: "Rolete", quantidade: 2, valor_unitario: 105 }] }];
    const linhas = linhasDoOrcamento({
      equipamento_id: 1,
      tecnico_nome: "Ivan",
      problema_relatado: "Falha",
      servicos_necessarios: JSON.stringify(servicos),
      pecas_necessarias: JSON.stringify([...pecasParaOrcamento(servicos), { id: "x", nome: "Sensor", quantidade: 1, valorUnitario: 40, valorTotal: 40 }]),
    });
    expect(linhas.map((l) => l.item)).toEqual(["Troca do rolete", "Rolete", "Sensor"]);
  });

  it("total gravado na OS e só as condições que existem", () => {
    const equipamento = { id: 1, valor_orcamento: 340, prazo_aprovacao: "2026-11-15" } as Equipamento;
    render(<OrcamentoDaOs equipamento={equipamento} verificacao={verificacao} />);
    const orcamento = screen.getByRole("region", { name: "Orçamento" });
    expect(within(orcamento).getByText("Total do orçamento")).toBeInTheDocument();
    expect(within(orcamento).getByText("Definida na aprovação")).toBeInTheDocument();
    expect(within(orcamento).getByText("2 horas estimadas")).toBeInTheDocument();
    expect(within(orcamento).queryByText("Valor final")).not.toBeInTheDocument();
  });

  it("sem orçamento nem verificação: avisa que não foi elaborado", () => {
    render(<OrcamentoDaOs equipamento={{ id: 1 } as Equipamento} verificacao={null} />);
    expect(screen.getByText(/ainda não foi elaborado/)).toBeInTheDocument();
  });

  it("cabeçalho com envio, prazo e Alterar Orçamento; selo de baixa pendente na peça", () => {
    const onAlterar = vi.fn();
    const equipamento = { id: 1, valor_orcamento: 340, prazo_aprovacao: "2026-11-15" } as Equipamento;
    render(
      <OrcamentoDaOs
        equipamento={equipamento}
        verificacao={verificacao}
        enviadoEm="2026-11-09 17:02:00"
        pendentes={new Set(["a:7"])}
        onAlterar={onAlterar}
      />,
    );
    expect(screen.getByRole("heading", { name: "Orçamento enviado em 09/11 às 14:02" })).toBeInTheDocument();
    expect(screen.getByText("Prazo de aprovação: 15/11/2026")).toBeInTheDocument();
    screen.getByRole("button", { name: "Alterar Orçamento" }).click();
    expect(onAlterar).toHaveBeenCalled();
    const linhaRolete = screen.getByText("Rolete").closest("tr")!;
    expect(within(linhaRolete).getByText("baixa pendente")).toBeInTheDocument();
  });

  it("sem envio registrado o título é só Orçamento e sem ação não há botão", () => {
    render(<OrcamentoDaOs equipamento={{ id: 1, valor_orcamento: 340 } as Equipamento} verificacao={verificacao} />);
    expect(screen.getByRole("heading", { name: "Orçamento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alterar Orçamento" })).toBeNull();
    expect(screen.queryByText("baixa pendente")).toBeNull();
  });

  it("soma dos itens diferente do total: avisa só depois que o orçamento saiu", () => {
    const linhas = linhasDoOrcamento(verificacao);
    // 90 + 210 + 40 (Calibração reprovada não conta) = 340.
    expect(divergenciaDoOrcamento(linhas, 340, "APROVADO")).toBeNull();
    expect(divergenciaDoOrcamento(linhas, 0, "EM_MANUTENCAO")).toBe(340);
    expect(divergenciaDoOrcamento(linhas, 339.99, "AGUARDANDO_APROVACAO")).toBe(340);
    // Em verificação ainda é rascunho: sem aviso.
    expect(divergenciaDoOrcamento(linhas, 0, "EM_VERIFICACAO")).toBeNull();
    expect(divergenciaDoOrcamento([], 0, "APROVADO")).toBeNull();
    // Cliente reprovou tudo e o equipamento voltou: o total antigo fica, sem aviso.
    expect(divergenciaDoOrcamento(linhas.map((l) => ({ ...l, reprovado: true })), 4170, "ENTREGUE")).toBeNull();
  });

  it("mostra o aviso de divergência e aponta Alterar Orçamento quando existe", () => {
    const equipamento = { id: 1, status: "EM_MANUTENCAO", valor_orcamento: 0 } as Equipamento;
    render(<OrcamentoDaOs equipamento={equipamento} verificacao={verificacao} onAlterar={vi.fn()} />);
    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent("A soma dos itens (R$ 340,00) não bate com o total do orçamento (R$ 0,00).");
    expect(aviso).toHaveTextContent("Confira e corrija em Alterar Orçamento.");
  });

  it("sem divergência, sem aviso", () => {
    const equipamento = { id: 1, status: "APROVADO", valor_orcamento: 340 } as Equipamento;
    render(<OrcamentoDaOs equipamento={equipamento} verificacao={verificacao} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
