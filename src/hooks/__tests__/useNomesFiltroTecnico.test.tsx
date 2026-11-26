import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { definirTecnicosDaEmpresa } from "@/lib/tecnicos";
import type { SecurityProfile } from "@/types";

const { db } = vi.hoisted(() => ({ db: { listarNomesTecnicosVerificacoes: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

import { useNomesFiltroTecnico } from "../useTecnicos";

const ivan = { id: 1, nome: "Ivan", role: "TECNICO", permissions: [], pin_configured: true, pin_required: true, is_default: false, ativo: true, atende_tecnico: true } as SecurityProfile;

describe("useNomesFiltroTecnico", () => {
  beforeEach(() => { definirTecnicosDaEmpresa([]); db.listarNomesTecnicosVerificacoes.mockReset(); });

  it("junta técnicos atuais e nomes antigos, e busca de novo quando a sessão destrava", async () => {
    db.listarNomesTecnicosVerificacoes.mockRejectedValueOnce(new Error("sem sessão")).mockResolvedValue(["Isaias"]);
    const { result } = renderHook(() => useNomesFiltroTecnico());
    await waitFor(() => expect(db.listarNomesTecnicosVerificacoes).toHaveBeenCalledTimes(1));
    expect(db.listarNomesTecnicosVerificacoes).toHaveBeenLastCalledWith(true);
    expect(result.current).toEqual([]);
    act(() => definirTecnicosDaEmpresa([ivan]));
    await waitFor(() => expect(result.current).toEqual(["Isaias", "Ivan"]));
    expect(db.listarNomesTecnicosVerificacoes).toHaveBeenLastCalledWith(true);
  });

  it("descarta a resposta anterior quando a equipe é publicada de novo", async () => {
    let responder!: (nomes: string[]) => void;
    db.listarNomesTecnicosVerificacoes
      .mockReturnValueOnce(new Promise<string[]>((resolve) => { responder = resolve; }))
      .mockResolvedValueOnce(["Isaias"]);
    const { result } = renderHook(() => useNomesFiltroTecnico());
    await waitFor(() => expect(db.listarNomesTecnicosVerificacoes).toHaveBeenCalledTimes(1));

    act(() => definirTecnicosDaEmpresa([ivan]));
    await waitFor(() => expect(result.current).toEqual(["Isaias", "Ivan"]));

    await act(async () => responder(["Nome antigo"]));
    expect(result.current).toEqual(["Isaias", "Ivan"]);
  });
});
