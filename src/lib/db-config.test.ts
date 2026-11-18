import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

import { DatabaseConfigService, parsePostgresConnectionUrl } from "./db-config";

describe("parsePostgresConnectionUrl", () => {
  it("aceita URL Session pooler e preserva SSL e credenciais codificadas", () => {
    const config = parsePostgresConnectionUrl(
      "postgresql://postgres.projeto:p%40ss@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
    );

    expect(config).toMatchObject({
      host: "aws-0-sa-east-1.pooler.supabase.com",
      port: 5432,
      database: "postgres",
      username: "postgres.projeto",
      password: "p@ss",
    });
    expect(config?.connection_url).toContain("sslmode=require");
    expect(config?.connection_url).toContain("p%40ss");
  });

  it("aceita postgres e aplica a porta padrão", () => {
    expect(parsePostgresConnectionUrl("postgres://user:pass@localhost/database")).toMatchObject({
      host: "localhost",
      port: 5432,
      database: "database",
    });
  });

  it.each([
    "https://user:pass@example.com/database",
    "postgresql://example.com/database",
    "postgresql://user:pass@example.com/",
    "não-é-url",
  ])("rejeita configuração inválida: %s", (value) => {
    expect(parsePostgresConnectionUrl(value)).toBeNull();
  });
});

describe("DatabaseConfigService", () => {
  beforeEach(() => mockInvoke.mockReset());

  it("expõe o tipo e o erro sanitizado da inicialização", async () => {
    const initError = { tipo: "rede", mensagem: "Não foi possível alcançar o banco." };
    mockInvoke.mockResolvedValue(initError);

    await expect(DatabaseConfigService.getInitializationError()).resolves.toEqual(initError);
    expect(mockInvoke).toHaveBeenCalledWith("obter_erro_inicializacao_banco");
  });

  it("reconecta sem enviar configuração nova", async () => {
    mockInvoke.mockResolvedValue(null);

    await expect(DatabaseConfigService.reconnect()).resolves.toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith("tentar_reconectar_banco");
  });
});
