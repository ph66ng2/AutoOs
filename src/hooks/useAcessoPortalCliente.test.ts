import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAcessoPortalCliente } from "@/hooks/useAcessoPortalCliente";

const mocks = vi.hoisted(() => ({ buscarCliente: vi.fn(), listar: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    buscarCliente: mocks.buscarCliente,
    listarClienteContatos: mocks.listar,
  },
}));

const base = { empresa_id: 1, cliente_id: 2 };
const decide = { ...base, id: 5, nome: "Ana Souza", ativo: true, portal_acesso: "DECIDIR" as const };
const acompanha = { ...base, id: 6, nome: "Bruno Lima", ativo: true, portal_acesso: "ACOMPANHAR" as const };
const semAcesso = { ...base, id: 7, nome: "Carla Dias", ativo: true, portal_acesso: "NENHUM" as const };
const inativo = { ...base, id: 8, nome: "Dário Melo", ativo: false, portal_acesso: "DECIDIR" as const };

describe("useAcessoPortalCliente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("lista só contatos ativos com acesso ao portal", async () => {
    mocks.buscarCliente.mockResolvedValue({ id: 2, empresa_id: 1, documento: "11222333000181" });
    mocks.listar.mockResolvedValue([decide, acompanha, semAcesso, inativo]);
    const { result } = renderHook(() => useAcessoPortalCliente(2, 1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.contatos.map((c) => c.nome)).toEqual(["Ana Souza", "Bruno Lima"]);
    expect(mocks.listar).toHaveBeenCalledWith(2, 1);
  });

  it("normaliza o documento para só dígitos", async () => {
    mocks.buscarCliente.mockResolvedValue({ id: 2, empresa_id: 1, documento: "11.222.333/0001-81" });
    mocks.listar.mockResolvedValue([]);
    const { result } = renderHook(() => useAcessoPortalCliente(2, 1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.documento).toBe("11222333000181");
  });

  it("documento inválido vira null, sem cair no cpf_cnpj", async () => {
    mocks.buscarCliente.mockResolvedValue({ id: 2, empresa_id: 1, documento: "123", cpf_cnpj: "52998224725" });
    mocks.listar.mockResolvedValue([]);
    const { result } = renderHook(() => useAcessoPortalCliente(2, 1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.documento).toBeNull();
  });

  it("cai em cpf_cnpj quando documento está vazio", async () => {
    mocks.buscarCliente.mockResolvedValue({ id: 2, empresa_id: 1, documento: "", cpf_cnpj: "529.982.247-25" });
    mocks.listar.mockResolvedValue([]);
    const { result } = renderHook(() => useAcessoPortalCliente(2, 1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.documento).toBe("52998224725");
  });

  it("sem clienteId não consulta nada e devolve null", async () => {
    const { result } = renderHook(() => useAcessoPortalCliente(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(mocks.buscarCliente).not.toHaveBeenCalled();
    expect(mocks.listar).not.toHaveBeenCalled();
  });
});
