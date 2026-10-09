import { describe, expect, it } from "vitest";
import { isTemporaryDatabaseAccessMessage, sensitiveAccessErrorMessage } from "./sensitive-access-error";

describe("mensagens de acesso sensível", () => {
  it("explica o limite de acessos simultâneos sem expor o erro interno", () => {
    const message = sensitiveAccessErrorMessage(
      "error returned from database: (EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15",
      "Falha ao validar o acesso sensível.",
    );

    expect(message).toContain("limite de acessos ao mesmo tempo");
    expect(message).toContain("Seu PIN não foi recusado");
    expect(message).not.toMatch(/EMAXCONNSESSION|pool_size|session mode/);
  });

  it("preserva outros erros e usa uma mensagem padrão quando não há descrição", () => {
    expect(sensitiveAccessErrorMessage(new Error("PIN incorreto"), "Falha")).toBe("PIN incorreto");
    expect(sensitiveAccessErrorMessage({ message: "Perfil indisponível" }, "Falha")).toBe("Perfil indisponível");
    expect(sensitiveAccessErrorMessage(null, "Falha ao validar o acesso sensível.")).toBe("Falha ao validar o acesso sensível.");
  });

  it.each([
    "MaxClientsInSessionMode: max clients reached",
    "error returned from database: (53300) too many clients already",
    "SQLSTATE 53300",
  ])("explica outra forma de limite de acessos: %s", (error) => {
    const message = sensitiveAccessErrorMessage(error, "Falha");
    expect(message).toContain("limite de acessos ao mesmo tempo");
    expect(isTemporaryDatabaseAccessMessage(message)).toBe(true);
  });

  it("traduz atrasos e erros crus sem esconder erros funcionais", () => {
    expect(sensitiveAccessErrorMessage("pool timed out while waiting for an open connection", "Falha"))
      .toContain("O banco demorou para responder");
    expect(sensitiveAccessErrorMessage("error returned from database: unknown error", "Falha"))
      .toContain("Não foi possível consultar o banco");
    expect(sensitiveAccessErrorMessage("PIN incorreto", "Falha")).toBe("PIN incorreto");
  });
});
