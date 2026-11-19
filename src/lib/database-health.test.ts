import { describe, expect, it, vi } from "vitest";
import { ouvirPossivelQuedaDeConexao, pareceFalhaDeConexao, reportarFalhaDeComando } from "./database-health";

describe("pareceFalhaDeConexao", () => {
  it.each([
    "AUTOOS:DB:REDE#ABCD2345\nNão foi possível concluir esta ação.",
    "AUTOOS:DB:POOL_TIMEOUT#ABCD2345\nNão foi possível concluir esta ação.",
    "AUTOOS:DB:08006#ABCD2345\nNão foi possível concluir esta ação.",
    "AUTOOS:DB:53300#ABCD2345\nNão foi possível concluir esta ação.",
    "AUTOOS:DB:57P01#ABCD2345\nNão foi possível concluir esta ação.",
    "pool timed out while waiting for an open connection",
    "error communicating with database: Connection reset by peer (os error 104)",
    "Não foi possível alcançar o banco. Verifique a internet, DNS ou compatibilidade IPv4/IPv6.",
    new Error("O banco demorou para responder: a checagem de conexão excedeu 5 segundos."),
  ])("reconhece queda de conexão: %s", (erro) => {
    expect(pareceFalhaDeConexao(erro)).toBe(true);
  });

  it.each([
    "AUTOOS:23505:ux_clientes_documento_ativo#ABCD2345\nEsse cliente já está cadastrado.",
    "AUTOOS:DB:23503#ABCD2345\nNão foi possível concluir esta ação.",
    "AUTOOS:DB:42P01#ABCD2345\nNão foi possível concluir esta ação.",
    "AUTOOS:OP#ABCD2345\nNão foi possível concluir esta ação.",
    // Código estruturado manda: texto de rede dentro de outro código não conta.
    "AUTOOS:DB:23505#ABCD2345\nconnection refused",
    "Conflito de concorrência",
    "Acesso sensível bloqueado",
    undefined,
  ])("não confunde com erro de dado: %s", (erro) => {
    expect(pareceFalhaDeConexao(erro)).toBe(false);
  });
});

describe("reportarFalhaDeComando", () => {
  it("avisa quem ouve só quando parece queda, e ignora os comandos de saúde", () => {
    const ouvinte = vi.fn();
    const parar = ouvirPossivelQuedaDeConexao(ouvinte);

    reportarFalhaDeComando("listar_clientes", "AUTOOS:DB:23503#ABCD2345\nx");
    reportarFalhaDeComando("verificar_saude_banco", "pool timed out");
    expect(ouvinte).not.toHaveBeenCalled();

    reportarFalhaDeComando("listar_clientes", "pool timed out while waiting for an open connection");
    expect(ouvinte).toHaveBeenCalledTimes(1);

    parar();
    reportarFalhaDeComando("listar_clientes", "pool timed out");
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it("guarda a suspeita que chegou antes de alguém ouvir e entrega ao primeiro ouvinte", async () => {
    reportarFalhaDeComando("get_sensitive_access_status", "pool timed out while waiting for an open connection");
    const ouvinte = vi.fn();
    const parar = ouvirPossivelQuedaDeConexao(ouvinte);
    await Promise.resolve();
    expect(ouvinte).toHaveBeenCalledTimes(1);

    const outro = vi.fn();
    const pararOutro = ouvirPossivelQuedaDeConexao(outro);
    await Promise.resolve();
    expect(outro).not.toHaveBeenCalled();
    parar();
    pararOutro();
  });
});
