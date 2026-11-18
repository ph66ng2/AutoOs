import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OrcamentoDaOs, linhasDoOrcamento } from "./OrcamentoDaOs";
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
});
