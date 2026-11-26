import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESTORED_NOTICE_MS, useDatabaseHealth } from "@/hooks/useDatabaseHealth";
import { reportarFalhaDeComando } from "@/lib/database-health";

const { verificarSaudeBanco } = vi.hoisted(() => ({ verificarSaudeBanco: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { verificarSaudeBanco } }));

const rede = { tipo: "rede" as const, mensagem: "Não foi possível alcançar o banco." };

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function passarSegundos(segundos: number) {
  for (let i = 0; i < segundos; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
}

describe("useDatabaseHealth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    verificarSaudeBanco.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("não checa nada enquanto nenhum comando falha", async () => {
    const { result } = renderHook(() => useDatabaseHealth());
    await passarSegundos(60);
    expect(verificarSaudeBanco).not.toHaveBeenCalled();
    expect(result.current.health.status).toBe("ok");
  });

  it("falha de dado não dispara checagem", async () => {
    renderHook(() => useDatabaseHealth());
    reportarFalhaDeComando("criar_cliente", "AUTOOS:23505:ux_clientes_documento_ativo#ABCD2345\nJá existe");
    await flush();
    expect(verificarSaudeBanco).not.toHaveBeenCalled();
  });

  it("suspeita que não se confirma não mostra aviso", async () => {
    verificarSaudeBanco.mockResolvedValue(null);
    const { result } = renderHook(() => useDatabaseHealth());
    reportarFalhaDeComando("listar_clientes", "pool timed out while waiting for an open connection");
    await flush();
    expect(verificarSaudeBanco).toHaveBeenCalledTimes(1);
    expect(result.current.health.status).toBe("ok");
  });

  it("queda confirmada tenta de novo com espera crescente e avisa quando volta", async () => {
    verificarSaudeBanco.mockResolvedValueOnce(rede).mockResolvedValueOnce(rede).mockResolvedValueOnce(null);
    const { result } = renderHook(() => useDatabaseHealth());

    reportarFalhaDeComando("listar_clientes", "pool timed out while waiting for an open connection");
    await flush();
    expect(result.current.health).toMatchObject({ status: "caiu", secondsLeft: 5, error: rede });

    await passarSegundos(5);
    expect(verificarSaudeBanco).toHaveBeenCalledTimes(2);
    expect(result.current.health).toMatchObject({ status: "caiu", secondsLeft: 10 });

    await passarSegundos(10);
    expect(verificarSaudeBanco).toHaveBeenCalledTimes(3);
    expect(result.current.health.status).toBe("restabelecida");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESTORED_NOTICE_MS);
    });
    expect(result.current.health.status).toBe("ok");
  });

  it("erro que pede o administrador não tenta sozinho, mas aceita tentar agora", async () => {
    verificarSaudeBanco.mockResolvedValue({ tipo: "credencial", mensagem: "Usuário ou senha do banco inválidos." });
    const { result } = renderHook(() => useDatabaseHealth());

    reportarFalhaDeComando("listar_clientes", "AUTOOS:DB:08006#ABCD2345\nx");
    await flush();
    expect(result.current.health).toMatchObject({ status: "caiu", secondsLeft: null });

    await passarSegundos(60);
    expect(verificarSaudeBanco).toHaveBeenCalledTimes(1);

    act(() => result.current.tentarAgora());
    await flush();
    expect(verificarSaudeBanco).toHaveBeenCalledTimes(2);
  });

  it("guarda o início da queda entre tentativas", async () => {
    verificarSaudeBanco.mockResolvedValue(rede);
    const { result } = renderHook(() => useDatabaseHealth());
    reportarFalhaDeComando("listar_clientes", "pool timed out");
    await flush();
    const inicio = result.current.health.status === "caiu" ? result.current.health.downSince : 0;

    await passarSegundos(5);
    expect(result.current.health).toMatchObject({ status: "caiu", downSince: inicio });
  });

  it("com a queda confirmada, novas falhas de comando não antecipam a tentativa", async () => {
    const lotado = { tipo: "capacidade" as const, mensagem: "SQLSTATE 53300: too many clients" };
    verificarSaudeBanco.mockResolvedValue(lotado);
    const { result } = renderHook(() => useDatabaseHealth());

    reportarFalhaDeComando("listar_clientes", "pool timed out");
    await flush();
    expect(result.current.health).toMatchObject({ status: "caiu", secondsLeft: 30 });

    await passarSegundos(3);
    reportarFalhaDeComando("contar_alertas_portal_nao_lidos", "pool timed out");
    await flush();
    expect(verificarSaudeBanco).toHaveBeenCalledTimes(1);
    expect(result.current.health).toMatchObject({ status: "caiu", secondsLeft: 27 });
  });

  it("a volta da rede checa na hora mesmo durante a espera", async () => {
    verificarSaudeBanco.mockResolvedValueOnce(rede).mockResolvedValueOnce(null);
    const { result } = renderHook(() => useDatabaseHealth());

    reportarFalhaDeComando("listar_clientes", "pool timed out");
    await flush();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await flush();
    expect(verificarSaudeBanco).toHaveBeenCalledTimes(2);
    expect(result.current.health.status).toBe("restabelecida");
  });
});
