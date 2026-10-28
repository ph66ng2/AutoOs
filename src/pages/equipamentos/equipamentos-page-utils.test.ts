import { describe, expect, it } from "vitest";
import { MENSAGEM_AGUARDANDO_TOTAL_ZERO, MENSAGEM_ZERAR_APROVADO_PAGO } from "@/lib/orcamento-estoque";
import { mensagemAjusteTotalZero, precisaPerguntarQuemRecebeOrcamento, totalOrcamentoAjusteValido, totalOrcamentoAprovacaoValido } from "./equipamentos-page-utils";

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
