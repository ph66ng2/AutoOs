import { describe, expect, it } from "vitest";
import { MENSAGEM_AGUARDANDO_TOTAL_ZERO, MENSAGEM_ZERAR_APROVADO_PAGO } from "@/lib/orcamento-estoque";
import {
  agruparAcoesOs,
  getProximosStatus,
  getStatusCorrecao,
  mensagemAjusteTotalZero,
  precisaPerguntarQuemRecebeOrcamento,
  secaoAcaoOs,
  totalOrcamentoAjusteValido,
  totalOrcamentoAprovacaoValido,
} from "./equipamentos-page-utils";

describe("totalOrcamentoAprovacaoValido", () => {
  it("recusa 0, vazio e inválido; aceita valor positivo", () => {
    expect(totalOrcamentoAprovacaoValido(0)).toBe(false);
    expect(totalOrcamentoAprovacaoValido(Number.NaN)).toBe(false);
    expect(totalOrcamentoAprovacaoValido(-1)).toBe(false);
    expect(totalOrcamentoAprovacaoValido(0.01)).toBe(true);
    expect(totalOrcamentoAprovacaoValido(150)).toBe(true);
  });
});

describe("totalOrcamentoAjusteValido", () => {
  it("aceita 0 só em OS só de garantia", () => {
    expect(totalOrcamentoAjusteValido(0, false)).toBe(false);
    expect(totalOrcamentoAjusteValido(0, true)).toBe(true);
    expect(totalOrcamentoAjusteValido(10, false)).toBe(true);
    expect(totalOrcamentoAjusteValido(Number.NaN, true)).toBe(false);
  });

  it("recusa R$ 0 em AGUARDANDO_APROVACAO mesmo só de garantia", () => {
    expect(totalOrcamentoAjusteValido(0, true, "AGUARDANDO_APROVACAO")).toBe(false);
    expect(totalOrcamentoAjusteValido(80, true, "AGUARDANDO_APROVACAO")).toBe(true);
    expect(mensagemAjusteTotalZero("AGUARDANDO_APROVACAO")).toBe(MENSAGEM_AGUARDANDO_TOTAL_ZERO);
  });

  it("OS só de garantia não pergunta quem recebe o orçamento", () => {
    expect(precisaPerguntarQuemRecebeOrcamento(true, true)).toBe(false);
    expect(precisaPerguntarQuemRecebeOrcamento(true, false)).toBe(true);
    expect(precisaPerguntarQuemRecebeOrcamento(false, false)).toBe(false);
  });

  it("recusa zerar orçamento APROVADO pago", () => {
    expect(totalOrcamentoAjusteValido(0, true, "APROVADO", 80)).toBe(false);
    expect(totalOrcamentoAjusteValido(0, true, "APROVADO", 0)).toBe(true);
    expect(mensagemAjusteTotalZero("APROVADO", 80)).toBe(MENSAGEM_ZERAR_APROVADO_PAGO);
  });
});

describe("destinos de status", () => {
  it("correção não oferece AGUARDANDO_APROVACAO em APROVADO nem em REPROVADO", () => {
    expect(getStatusCorrecao("APROVADO")).toEqual([]);
    expect(getStatusCorrecao("REPROVADO")).toEqual([]);
    expect(getStatusCorrecao("PRONTO")).toContain("AGUARDANDO_APROVACAO");
  });

  it("Mudar Status em REPROVADO sem pré-seleção não oferece AGUARDANDO_APROVACAO", () => {
    expect(getProximosStatus("REPROVADO", { semPreSelecao: true })).toEqual(["ENTREGUE", "ABANDONADO"]);
  });

  it("mantém o comportamento padrão e a pré-seleção de Nova proposta", () => {
    expect(getProximosStatus("REPROVADO")).toContain("AGUARDANDO_APROVACAO");
    expect(getProximosStatus("REPROVADO", {})).toContain("AGUARDANDO_APROVACAO");
    expect(getProximosStatus("ORCAMENTO_VENCIDO", { semPreSelecao: true })).toContain("AGUARDANDO_APROVACAO");
  });
});

describe("agruparAcoesOs", () => {
  it("define a seção de cada ação da OS", () => {
    expect(secaoAcaoOs("orcamento_pdf")).toBe("Orçamento");
    expect(secaoAcaoOs("corrigir_decisao")).toBe("Corrigir um engano");
    expect(secaoAcaoOs("desfazer_aprovacao")).toBe("Corrigir um engano");
    expect(secaoAcaoOs("editar")).toBe("Equipamento");
  });

  it("ordena por seção e mantém a ordem original dentro de cada uma", () => {
    const acoes = [
      { id: "editar" },
      { id: "corrigir_decisao" },
      { id: "whatsapp_orcamento" },
      { id: "fotos" },
      { id: "orcamento_pdf" },
      { id: "desfazer_aprovacao" },
    ];
    const agrupadas = agruparAcoesOs(acoes);
    expect(agrupadas.map((a) => a.id)).toEqual([
      "whatsapp_orcamento",
      "orcamento_pdf",
      "corrigir_decisao",
      "desfazer_aprovacao",
      "editar",
      "fotos",
    ]);
    expect(agrupadas[0].group).toBe("Orçamento");
    expect(agrupadas[5].group).toBe("Equipamento");
  });

  it("não altera a lista recebida", () => {
    const acoes = [{ id: "editar" }, { id: "orcamento_pdf" }];
    agruparAcoesOs(acoes);
    expect(acoes).toEqual([{ id: "editar" }, { id: "orcamento_pdf" }]);
  });
});
