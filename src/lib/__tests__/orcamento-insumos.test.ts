import { describe, expect, it } from "vitest";
import {
  acoesOrcamentoInsumos,
  calcularTotaisOrcamentoInsumos,
  categoriaOrcavel,
  emailDestinatario,
  formaPagamentoRotulo,
  linhasSemSaldo,
  montarEmailOrcamentoInsumos,
  montarMensagemWhatsappOrcamentoInsumos,
  nomeDestinatario,
  orcamentoInsumosVencido,
  telefoneDestinatario,
  validadePadraoOrcamentoInsumos,
  valorUnitarioPadrao,
} from "@/lib/orcamento-insumos";
import { parseTimestampPostgres } from "@/lib/date-utils";
import { STATUS_ORCAMENTO_INSUMOS, type OrcamentoInsumosDetalhe } from "@/types";

function orcamento(sobrescrever: Partial<OrcamentoInsumosDetalhe> = {}): OrcamentoInsumosDetalhe {
  return {
    id: 7,
    empresa_id: 1,
    numero: 12,
    numero_exibicao: "OI-12",
    cliente_id: 3,
    cliente_nome: "Gráfica Alfa",
    cliente_email: "contato@alfa.test",
    cliente_telefone: "71999990000",
    contato_id: null,
    status: "RASCUNHO",
    validade: "2026-11-01",
    desconto: 5,
    valor_subtotal: 105,
    valor_total: 100,
    criado_em: "2026-10-20 14:03:05.123456+00",
    atualizado_em: "2026-10-20 14:03:05.123456+00",
    total_itens: 2,
    itens: [
      { id: 1, orcamento_id: 7, produto_id: 10, descricao: "Etiqueta 100x50", categoria: "ETIQUETA", quantidade: 3, valor_unitario: 15, valor_total: 45, saldo_estoque: 10 },
      { id: 2, orcamento_id: 7, produto_id: 11, descricao: "Ribbon cera", categoria: "RIBBON", quantidade: 2, valor_unitario: 30, valor_total: 60, saldo_estoque: 5 },
    ],
    ...sobrescrever,
  };
}

describe("calcularTotaisOrcamentoInsumos", () => {
  it("soma os itens e aplica o desconto em centavos", () => {
    const totais = calcularTotaisOrcamentoInsumos(
      [
        { quantidade: 3, valor_unitario: 10.1 },
        { quantidade: 2, valor_unitario: 0.1 },
      ],
      0.3,
    );
    expect(totais.linhas).toEqual([30.3, 0.2]);
    expect(totais.subtotal).toBe(30.5);
    expect(totais.desconto).toBe(0.3);
    expect(totais.total).toBe(30.2);
    expect(totais.descontoExcedido).toBe(false);
  });

  it("sinaliza desconto maior que o subtotal e nunca devolve total negativo", () => {
    const totais = calcularTotaisOrcamentoInsumos([{ quantidade: 1, valor_unitario: 10 }], 10.01);
    expect(totais.descontoExcedido).toBe(true);
    expect(totais.total).toBe(0);
    expect(calcularTotaisOrcamentoInsumos([{ quantidade: 1, valor_unitario: 10 }], 10).descontoExcedido).toBe(false);
  });

  it("ignora quantidades e valores inválidos", () => {
    const totais = calcularTotaisOrcamentoInsumos(
      [
        { quantidade: Number.NaN, valor_unitario: 5 },
        { quantidade: -2, valor_unitario: 5 },
        { quantidade: 2, valor_unitario: -1 },
        { quantidade: 2.9, valor_unitario: 5 },
      ],
      Number.NaN,
    );
    expect(totais.subtotal).toBe(10);
    expect(totais.total).toBe(10);
  });
});

describe("saldo e valores padrão", () => {
  it("lista só as linhas cujo saldo não cobre a quantidade", () => {
    const linhas = [
      { produto_id: 1, descricao: "A", categoria: "ETIQUETA", quantidade: 5, valor_unitario: 1, saldo: 4 },
      { produto_id: 2, descricao: "B", categoria: "RIBBON", quantidade: 5, valor_unitario: 1, saldo: 5 },
      { produto_id: 3, descricao: "C", categoria: "OUTROS", quantidade: 9, valor_unitario: 1, saldo: null },
    ];
    expect(linhasSemSaldo(linhas).map((linha) => linha.produto_id)).toEqual([1]);
  });

  it("usa o preço de venda do produto só quando existe", () => {
    expect(valorUnitarioPadrao(12.5)).toBe(12.5);
    expect(valorUnitarioPadrao(0)).toBe(0);
    expect(valorUnitarioPadrao(undefined)).toBe(0);
    expect(valorUnitarioPadrao(null)).toBe(0);
  });

  it("impressora não entra no orçamento de insumos", () => {
    expect(categoriaOrcavel("IMPRESSORA")).toBe(false);
    expect(categoriaOrcavel(" impressora ")).toBe(false);
    for (const categoria of ["ETIQUETA", "RIBBON", "PEÇA", "OUTROS"]) {
      expect(categoriaOrcavel(categoria)).toBe(true);
    }
  });

  it("a validade padrão é hoje mais 7 dias, também na virada de mês", () => {
    expect(validadePadraoOrcamentoInsumos(new Date(2026, 9, 20, 23, 30))).toBe("2026-10-27");
    expect(validadePadraoOrcamentoInsumos(new Date(2026, 9, 28, 8, 0))).toBe("2026-11-04");
    expect(validadePadraoOrcamentoInsumos(new Date(2026, 11, 29, 8, 0))).toBe("2027-01-05");
  });
});

describe("acoesOrcamentoInsumos", () => {
  it("novo orçamento só salva", () => {
    const acoes = acoesOrcamentoInsumos(null);
    expect(acoes).toMatchObject({ editar: true, salvar: true, gerarPdf: false, enviar: false, aprovar: false, cancelar: false, entregar: false });
  });

  it("rascunho e enviado podem editar, enviar, aprovar, reprovar e cancelar", () => {
    for (const status of ["RASCUNHO", "ENVIADO"] as const) {
      expect(acoesOrcamentoInsumos(status)).toMatchObject({
        editar: true, salvar: true, gerarPdf: true, enviar: true, aprovar: true, reprovar: true,
        cancelar: true, entregar: false, cancelarDevolveEstoque: false,
      });
    }
  });

  it("aprovado entrega ou cancela devolvendo o estoque, sem editar", () => {
    expect(acoesOrcamentoInsumos("APROVADO")).toMatchObject({
      editar: false, salvar: false, gerarPdf: true, enviar: false, aprovar: false, reprovar: false,
      cancelar: true, entregar: true, cancelarDevolveEstoque: true,
    });
  });

  it("reprovado, cancelado e entregue só permitem consultar e gerar PDF", () => {
    for (const status of ["REPROVADO", "CANCELADO", "ENTREGUE"] as const) {
      expect(acoesOrcamentoInsumos(status)).toMatchObject({
        editar: false, salvar: false, gerarPdf: true, enviar: false, aprovar: false, reprovar: false, cancelar: false, entregar: false,
      });
    }
  });

  it("cobre todos os status conhecidos", () => {
    for (const status of STATUS_ORCAMENTO_INSUMOS) {
      expect(() => acoesOrcamentoInsumos(status)).not.toThrow();
    }
  });

  it("só cancelado pode ser excluído de vez", () => {
    for (const status of STATUS_ORCAMENTO_INSUMOS) {
      expect(acoesOrcamentoInsumos(status).excluir).toBe(status === "CANCELADO");
    }
    expect(acoesOrcamentoInsumos(null).excluir).toBe(false);
  });
});

describe("mensagens de envio", () => {
  it("e-mail traz número, itens, desconto, total e validade", () => {
    const { texto, html } = montarEmailOrcamentoInsumos(orcamento());
    expect(texto).toContain("Segue o orçamento de insumos OI-12.");
    expect(texto).toContain("- 3x Etiqueta 100x50: R$");
    expect(texto).toContain("Desconto: R$");
    expect(texto).toContain("Total: R$");
    expect(texto).toContain("válido até 01/11/2026");
    expect(texto).toContain("Olá, Gráfica Alfa.");
    expect(html).toContain("<strong>OI-12</strong>");
    expect(html).toContain("Etiqueta 100x50");
  });

  it("e-mail escapa HTML do nome do produto", () => {
    const { html } = montarEmailOrcamentoInsumos(
      orcamento({ itens: [{ ...orcamento().itens[0], descricao: "<script>x</script>" }] }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("WhatsApp é curto, com número, itens e total", () => {
    const mensagem = montarMensagemWhatsappOrcamentoInsumos(orcamento({ desconto: 0 }));
    expect(mensagem).toContain("orçamento de insumos OI-12");
    expect(mensagem).toContain("- 3x Etiqueta 100x50");
    expect(mensagem).toContain("- 2x Ribbon cera");
    expect(mensagem).not.toContain("Desconto");
    expect(mensagem).toContain("Total: R$");
    expect(mensagem).toContain("Válido até 01/11/2026.");
    expect(mensagem).not.toMatch(/\n{3,}/);
  });

  it("destinatário prefere o contato escolhido e cai no cadastro do cliente", () => {
    const base = orcamento();
    expect(nomeDestinatario(base)).toBe("Gráfica Alfa");
    expect(emailDestinatario(base)).toBe("contato@alfa.test");
    expect(telefoneDestinatario(base)).toBe("71999990000");
    const comContato = orcamento({ contato_nome: "Maria", contato_email: "maria@alfa.test", contato_telefone: "71988880000" });
    expect(nomeDestinatario(comContato)).toBe("Maria");
    expect(emailDestinatario(comContato)).toBe("maria@alfa.test");
    expect(telefoneDestinatario(comContato)).toBe("71988880000");
    expect(emailDestinatario(orcamento({ cliente_email: null }))).toBe("");
  });

  it("rótulo da forma de pagamento", () => {
    expect(formaPagamentoRotulo(null)).toBe("Definida na aprovação");
    expect(formaPagamentoRotulo("PIX")).toBe("Pix");
    expect(formaPagamentoRotulo("OUTRO", " Contrato ")).toBe("Outro: Contrato");
  });
});

describe("orcamentoInsumosVencido", () => {
  const hoje = "2026-10-29";

  it("vence só em RASCUNHO ou ENVIADO com validade anterior a hoje", () => {
    expect(orcamentoInsumosVencido({ status: "RASCUNHO", validade: "2026-10-28" }, hoje)).toBe(true);
    expect(orcamentoInsumosVencido({ status: "ENVIADO", validade: "2026-10-28" }, hoje)).toBe(true);
  });

  it("não vence no próprio dia da validade nem depois", () => {
    expect(orcamentoInsumosVencido({ status: "ENVIADO", validade: "2026-10-29" }, hoje)).toBe(false);
    expect(orcamentoInsumosVencido({ status: "ENVIADO", validade: "2026-11-01" }, hoje)).toBe(false);
  });

  it("validade nula nunca vence", () => {
    expect(orcamentoInsumosVencido({ status: "ENVIADO", validade: null }, hoje)).toBe(false);
    expect(orcamentoInsumosVencido({ status: "RASCUNHO", validade: undefined }, hoje)).toBe(false);
  });

  it("status fora de RASCUNHO e ENVIADO nunca aparece como vencido", () => {
    for (const status of ["APROVADO", "REPROVADO", "CANCELADO", "ENTREGUE"] as const) {
      expect(orcamentoInsumosVencido({ status, validade: "2026-01-01" }, hoje)).toBe(false);
    }
  });

  it("usa a data local de hoje quando nenhuma data é passada", () => {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const y = amanha.getFullYear();
    const m = String(amanha.getMonth() + 1).padStart(2, "0");
    const d = String(amanha.getDate()).padStart(2, "0");
    expect(orcamentoInsumosVencido({ status: "ENVIADO", validade: `${y}-${m}-${d}` })).toBe(false);
    expect(orcamentoInsumosVencido({ status: "ENVIADO", validade: "2000-01-01" })).toBe(true);
  });
});

describe("parseTimestampPostgres", () => {
  it("lê o texto do PostgreSQL com microssegundos e fuso curto", () => {
    expect(parseTimestampPostgres("2026-10-20 14:03:05.123456+00").toISOString()).toBe("2026-10-20T14:03:05.123Z");
    expect(parseTimestampPostgres("2026-10-20 11:03:05-03").toISOString()).toBe("2026-10-20T14:03:05.000Z");
  });
});
