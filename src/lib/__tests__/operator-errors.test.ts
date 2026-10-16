import { describe, expect, it } from "vitest";
import { erroDeCadastroDuplicado, mensagemCadastroDuplicado, mensagemDeBanco, mensagemVisivelAoOperador, lerCodigoTecnico } from "@/lib/operator-errors";

describe("mensagem de cadastro duplicado", () => {
  it("explica cliente repetido a partir do código estruturado, sem chave nem restrição", () => {
    const message = mensagemCadastroDuplicado("AUTOOS:23505:ux_clientes_documento_ativo");
    expect(erroDeCadastroDuplicado("AUTOOS:23505:ux_clientes_documento_ativo")).toBe(true);
    expect(message).toContain("cliente já está cadastrado");
    expect(message).toContain("CPF ou CNPJ");
    expect(message?.toLowerCase()).not.toContain("constraint");
    expect(message).not.toContain("23505");
    expect(message).not.toContain("ux_clientes_documento_ativo");
  });

  it("explica código de insumo e chave primária pelo código estruturado", () => {
    expect(mensagemCadastroDuplicado("AUTOOS:23505:ux_produtos_empresa_codigo_ativo")).toContain("código de insumo");

    const chave = mensagemCadastroDuplicado("AUTOOS:23505:clientes_pkey");
    expect(erroDeCadastroDuplicado("AUTOOS:23505:clientes_pkey")).toBe(true);
    expect(chave).toContain("cadastro já existe");
    expect(chave?.toLowerCase()).not.toContain("unicidade");
    expect(chave).not.toContain("clientes_pkey");
    expect(chave).not.toContain("23505");
  });

  it("não classifica texto solto com 23505 ou unicidade como cadastro duplicado", () => {
    const soltos = [
      "o código 23505 apareceu no texto",
      "restrição de unicidade qualquer",
      'duplicate key value violates unique constraint "ux_clientes_documento_ativo"',
      'duplicar valor da chave viola a restrição de unicidade "clientes_pkey"',
      "SQLSTATE 23505",
      "erro 23505 de unicidade no cadastro",
      "Conflito de concorrência",
    ];

    for (const texto of soltos) {
      expect(erroDeCadastroDuplicado(texto)).toBe(false);
      expect(mensagemCadastroDuplicado(texto)).toBeNull();
      expect(mensagemVisivelAoOperador(texto)).toBeNull();
    }
  });

  it("mostra a frase embutida no código e deixa número de negócio passar inteiro", () => {
    const negocio = "A OS 23500 do lote 42001 permanece em aberto. A unicidade do patrimônio foi conferida.";
    expect(erroDeCadastroDuplicado(negocio)).toBe(false);
    expect(mensagemDeBanco(negocio)).toBeNull();
    expect(mensagemVisivelAoOperador(negocio)).toBeNull();

    const banco = "AUTOOS:DB\nNão foi possível concluir esta ação. O detalhe técnico foi registrado no log do aplicativo.";
    expect(erroDeCadastroDuplicado(banco)).toBe(false);
    expect(mensagemDeBanco(banco)).toBe("Não foi possível concluir esta ação. O detalhe técnico foi registrado no log do aplicativo.");
    expect(mensagemDeBanco(banco)).not.toContain("AUTOOS:DB");
    expect(mensagemDeBanco(banco)).not.toContain("42601");

    const duplicado = "AUTOOS:23505:ux_clientes_documento_ativo\nfrase que não deve vazar a restrição";
    expect(erroDeCadastroDuplicado(duplicado)).toBe(true);
    const visivel = mensagemVisivelAoOperador(duplicado);
    expect(visivel).toContain("cliente já está cadastrado");
    expect(visivel).not.toContain("ux_clientes_documento_ativo");
    expect(visivel).not.toContain("23505");
  });

  it("lê código técnico e referência sem mostrar ao operador", () => {
    const resposta = "AUTOOS:DB:40P01#ABCD2345\nNão foi possível concluir esta ação. O detalhe técnico foi registrado no log do aplicativo.";
    expect(mensagemDeBanco(resposta)).not.toContain("40P01");
    expect(lerCodigoTecnico(resposta)).toEqual({ codigo: "AUTOOS:DB:40P01", referencia: "ABCD2345", descricao: expect.stringContaining("deadlock") });
    expect(lerCodigoTecnico("AUTOOS:DB:POOL_TIMEOUT#ABCD2345\nx")?.descricao).toContain("conexão livre");
    expect(lerCodigoTecnico("AUTOOS:OP#ABCD2345\nx")?.codigo).toBe("AUTOOS:OP");
    expect(mensagemDeBanco("AUTOOS:OP#ABCD2345\nfrase")).toBe("frase");
    expect(erroDeCadastroDuplicado("AUTOOS:23505:ux_clientes_documento_ativo#ABCD2345\nx")).toBe(true);
    expect(mensagemCadastroDuplicado("AUTOOS:23505:ux_clientes_documento_ativo#ABCD2345\nx")).toContain("cliente já está cadastrado");
    expect(lerCodigoTecnico("Prazo inválido: informe uma data futura.")).toBeNull();
  });
});
