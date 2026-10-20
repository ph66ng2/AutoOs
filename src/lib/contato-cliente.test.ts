import { describe, expect, it } from "vitest";
import {
  telefoneParaExibir,
  contatoParaRetorno,
  emailValido,
  mensagemInicialContato,
  montarLinkEmail,
  montarLinkWhatsapp,
  telefoneParaWhatsapp,
} from "@/lib/contato-cliente";
import type { Equipamento } from "@/types";

describe("contato-cliente", () => {
  it("exibe o telefone formatado, com ou sem DDI", () => {
    expect(telefoneParaExibir("71991234567")).toBe("(71) 99123-4567");
    expect(telefoneParaExibir("5571991234567")).toBe("(71) 99123-4567");
    expect(telefoneParaExibir("7132345678")).toBe("(71) 3234-5678");
    expect(telefoneParaExibir("123")).toBe("123");
  });

  it("normaliza telefone brasileiro para o wa.me", () => {
    expect(telefoneParaWhatsapp("(71) 98888-7777")).toBe("5571988887777");
    expect(telefoneParaWhatsapp("7133334444")).toBe("557133334444");
    expect(telefoneParaWhatsapp("+55 71 98888-7777")).toBe("5571988887777");
    expect(telefoneParaWhatsapp("1234")).toBeNull();
    expect(telefoneParaWhatsapp("")).toBeNull();
    expect(telefoneParaWhatsapp(null)).toBeNull();
  });

  it("monta links de WhatsApp e e-mail com o texto codificado", () => {
    expect(montarLinkWhatsapp("71988887777", "Olá & tudo bem?")).toBe(
      "https://wa.me/5571988887777?text=Ol%C3%A1%20%26%20tudo%20bem%3F",
    );
    expect(montarLinkWhatsapp("abc", "x")).toBeNull();
    expect(montarLinkEmail("ana@cliente.com", "Assunto", "Corpo")).toBe("mailto:ana@cliente.com?subject=Assunto&body=Corpo");
    expect(montarLinkEmail("sem-arroba", "a", "b")).toBeNull();
    expect(emailValido(" ana@cliente.com ")).toBe(true);
  });

  it("a mensagem inicial cita o equipamento, o protocolo e o primeiro nome", () => {
    const texto = mensagemInicialContato({ marca: "HP", modelo: "M404" }, { id: 31, tipo: "NEGOCIAR", contato: "Ana Souza" });
    expect(texto).toContain("Olá, Ana!");
    expect(texto).toContain("negociar o orçamento");
    expect(texto).toContain("HP M404");
    expect(texto).toContain("protocolo S-31");
  });

  it("prefere o contato da solicitação; senão usa o responsável e depois o cadastro", () => {
    const base = { marca: "HP", modelo: "M404" } as Equipamento;
    const daSolicitacao = contatoParaRetorno(
      { contatoTelefone: "71988887777", contatoEmail: "ana@cliente.com" },
      { ...base, responsavel_telefone: "21977776666", cliente_email: "cad@empresa.com" },
    );
    expect(daSolicitacao).toMatchObject({ telefone: "71988887777", telefoneOrigem: "cliente", email: "ana@cliente.com", emailOrigem: "cliente" });

    const doCadastro = contatoParaRetorno({}, { ...base, responsavel_telefone: "21977776666", cliente_email: "cad@empresa.com" });
    expect(doCadastro).toMatchObject({ telefone: "21977776666", telefoneOrigem: "cadastro", email: "cad@empresa.com", emailOrigem: "cadastro" });
    expect(doCadastro.podeWhatsapp && doCadastro.podeEmail).toBe(true);

    const nenhum = contatoParaRetorno({}, base);
    expect(nenhum).toMatchObject({ telefone: null, email: null, podeWhatsapp: false, podeEmail: false });
  });
});
