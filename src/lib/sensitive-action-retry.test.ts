import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSensitiveAccessLockedError,
  registerSensitiveAccessPrompt,
  withSensitiveAccessRetry,
} from "@/lib/sensitive-action-retry";

describe("reautenticação de ações sensíveis", () => {
  let unregister: (() => void) | undefined;

  afterEach(() => {
    unregister?.();
    unregister = undefined;
  });

  it("abre o PIN e repete a operação uma única vez quando a sessão expirou", async () => {
    const prompt = vi.fn().mockResolvedValue(true);
    const operation = vi.fn()
      .mockRejectedValueOnce("Acesso sensível bloqueado. Informe o PIN para continuar.")
      .mockResolvedValueOnce("ok");
    unregister = registerSensitiveAccessPrompt(prompt);

    await expect(withSensitiveAccessRetry(operation)).resolves.toBe("ok");
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("não repete quando o usuário cancela o diálogo", async () => {
    const prompt = vi.fn().mockResolvedValue(false);
    const operation = vi.fn().mockRejectedValue("Sessão sensível bloqueada");
    unregister = registerSensitiveAccessPrompt(prompt);

    await expect(withSensitiveAccessRetry(operation)).rejects.toBe("Sessão sensível bloqueada");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("não entra em ciclo quando a repetição também é recusada", async () => {
    const prompt = vi.fn().mockResolvedValue(true);
    const operation = vi.fn().mockRejectedValue("Acesso sensível bloqueado");
    unregister = registerSensitiveAccessPrompt(prompt);

    await expect(withSensitiveAccessRetry(operation)).rejects.toBe("Acesso sensível bloqueado");
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("não abre PIN para erro de permissão ou validação", async () => {
    const prompt = vi.fn().mockResolvedValue(true);
    const operation = vi.fn().mockRejectedValue("Perfil sem permissão FINANCIAL_ACTIONS");
    unregister = registerSensitiveAccessPrompt(prompt);

    await expect(withSensitiveAccessRetry(operation)).rejects.toBe("Perfil sem permissão FINANCIAL_ACTIONS");
    expect(prompt).not.toHaveBeenCalled();
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("compartilha um único diálogo entre falhas simultâneas", async () => {
    let releasePrompt: ((value: boolean) => void) | undefined;
    const prompt = vi.fn(() => new Promise<boolean>((resolve) => { releasePrompt = resolve; }));
    const first = vi.fn()
      .mockRejectedValueOnce("Acesso sensível bloqueado")
      .mockResolvedValueOnce("primeira");
    const second = vi.fn()
      .mockRejectedValueOnce("Acesso sensível bloqueado")
      .mockResolvedValueOnce("segunda");
    unregister = registerSensitiveAccessPrompt(prompt);

    const results = Promise.all([withSensitiveAccessRetry(first), withSensitiveAccessRetry(second)]);
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    releasePrompt?.(true);

    await expect(results).resolves.toEqual(["primeira", "segunda"]);
  });

  it("reconhece apenas as mensagens de sessão bloqueada", () => {
    expect(isSensitiveAccessLockedError(new Error("Acesso sensível bloqueado. Informe o PIN"))).toBe(true);
    expect(isSensitiveAccessLockedError("Conflito de concorrência")).toBe(false);
  });
});
