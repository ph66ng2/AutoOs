import { describe, expect, it } from "vitest";
import { erroDeCadastroDuplicado, mensagemCadastroDuplicado } from "@/lib/operator-errors";

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
    }
  });
});
