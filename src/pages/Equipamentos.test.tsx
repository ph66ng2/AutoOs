import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Equipamentos from "./Equipamentos";

const { dbMocks, status } = vi.hoisted(() => ({
  dbMocks: {
    buscarEquipamento: vi.fn(),
    buscarVerificacao: vi.fn(),
    listarComunicacoes: vi.fn(),
    listarImagensEquipamento: vi.fn(),
    listarHistoricoEquipamento: vi.fn(),
  },
  status: { unlocked: true, active_profile_id: 1, profiles: [] },
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ status, hasPermission: () => true }),
}));
vi.mock("@/hooks/useEquipamentos", () => {
  const equipamentos = [];
  return { useEquipamentos: () => ({ equipamentos, total: 0, contagens: {}, destaques: new Set() }) };
});
vi.mock("@/hooks/useTecnicos", () => ({ useTecnicos: () => [], useNomesFiltroTecnico: () => [] }));
vi.mock("@/hooks/useAtualizacaoAoVivo", () => ({ useAtualizacaoAoVivo: () => {} }));

function RotaDeTeste() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <>
      <output>{pathname}</output>
      <button onClick={() => navigate("/equipamentos/2")}>Abrir B</button>
      <button onClick={() => navigate("/equipamentos/nova")}>Ir para entrada</button>
      <Equipamentos />
    </>
  );
}

function abrir(rota = "/equipamentos/1") {
  return render(<MemoryRouter initialEntries={[rota]}><RotaDeTeste /></MemoryRouter>);
}

function os(id: number) {
  return { id, marca: "Marca", modelo: `Modelo ${id}`, status: "RECEBIDO", serial_number: `S-${id}` };
}

function buscaPendente() {
  let resolver!: (eq: ReturnType<typeof os>) => void;
  let rejeitar!: (erro: Error) => void;
  dbMocks.buscarEquipamento.mockImplementationOnce(() => new Promise((resolve, reject) => {
    resolver = resolve;
    rejeitar = reject;
  }));
  return { resolver: (eq: ReturnType<typeof os>) => resolver(eq), rejeitar: (erro: Error) => rejeitar(erro) };
}

beforeEach(() => {
  vi.resetAllMocks();
  dbMocks.buscarVerificacao.mockResolvedValue(null);
  dbMocks.listarComunicacoes.mockResolvedValue([]);
  dbMocks.listarImagensEquipamento.mockResolvedValue([]);
  dbMocks.listarHistoricoEquipamento.mockResolvedValue([]);
});

describe("abertura dos detalhes pela rota", () => {
  it("mantém a OS B quando a resposta da OS A chega depois", async () => {
    const a = buscaPendente();
    dbMocks.buscarEquipamento.mockResolvedValueOnce(os(2));
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Abrir B" }));
    expect(await screen.findByRole("heading", { name: "Marca Modelo 2" })).toBeInTheDocument();
    await act(async () => { a.resolver(os(1)); });
    expect(screen.getByText("/equipamentos/2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Marca Modelo 2" })).toBeInTheDocument();
    expect(dbMocks.buscarVerificacao).not.toHaveBeenCalledWith(1);
  });

  it.each(["resposta", "erro"])("mantém Nova entrada após %s tardio da OS A", async (resultado) => {
    const a = buscaPendente();
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Ir para entrada" }));
    expect(await screen.findByRole("heading", { name: "Nova entrada" })).toBeInTheDocument();
    await act(async () => {
      if (resultado === "resposta") a.resolver(os(1));
      else a.rejeitar(new Error("Falha na busca de A"));
    });
    expect(screen.getByText("/equipamentos/nova")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nova entrada" })).toBeInTheDocument();
    expect(dbMocks.buscarVerificacao).not.toHaveBeenCalledWith(1);
  });
});
