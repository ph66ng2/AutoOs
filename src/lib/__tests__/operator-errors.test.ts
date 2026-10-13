import { describe, expect, it } from "vitest";
import { mensagemCadastroDuplicado } from "@/lib/operator-errors";

describe("mensagem de cadastro duplicado", () => {
  it("explica cliente repetido sem falar de chave ou restrição", () => {
    const message = mensagemCadastroDuplicado(
      'error returned from database: duplicate key value violates unique constraint "ux_clientes_documento_ativo"',
    );
    expect(message).toContain("cliente já está cadastrado");
    expect(message).toContain("CPF ou CNPJ");
    expect(message?.toLowerCase()).not.toContain("constraint");
    expect(message).not.toContain("23505");
  });

  it("explica código de insumo e chave primária", () => {
    expect(mensagemCadastroDuplicado(
      'duplicate key value violates unique constraint "ux_produtos_empresa_codigo_ativo"',
    )).toContain("código de insumo");

    const chave = mensagemCadastroDuplicado(
      'duplicar valor da chave viola a restrição de unicidade "clientes_pkey"',
    );
    expect(chave).toContain("cadastro já existe");
    expect(chave?.toLowerCase()).not.toContain("unicidade");
  });

  it("não altera um erro que não é duplicidade", () => {
    expect(mensagemCadastroDuplicado("Conflito de concorrência")).toBeNull();
  });
});
