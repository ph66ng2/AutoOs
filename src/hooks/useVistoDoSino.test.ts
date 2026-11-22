import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { gravarVistos } from "@/lib/sino-visto";
import { useVistoDoSino } from "./useVistoDoSino";

type Props = { perfilId: number | null; aberto: boolean; chavesNaoLidas: string[]; buscarMaiorPortal: (() => Promise<number>) | null };
const base: Props = { perfilId: 7, aberto: false, chavesNaoLidas: [], buscarMaiorPortal: null };
const montar = (props: Partial<Props> = {}) => renderHook((p: Props) => useVistoDoSino(p), { initialProps: { ...base, ...props } });

describe("useVistoDoSino", () => {
  beforeEach(() => localStorage.clear());

  it("conta do portal pedida antes de abrir o sino não vale depois da abertura", () => {
    const { result } = montar();
    const consulta = result.current.iniciarConsultaPortal();
    act(() => result.current.abrir({ avisosCarregados: true, portalMaiorId: 0 }));
    act(() => result.current.registrarContaPortal(consulta, 3));
    expect(result.current.novosPortal).toBe(0);
    const depois = result.current.iniciarConsultaPortal();
    act(() => result.current.registrarContaPortal(depois, 2));
    expect(result.current.novosPortal).toBe(2);
  });

  it("abrir sobe a marca até o maior não lido de agora (a lista da consulta pode estar atrasada)", async () => {
    const { result } = montar({ buscarMaiorPortal: async () => 15 });
    act(() => result.current.abrir({ avisosCarregados: true, portalMaiorId: 10 }));
    await waitFor(() => expect(result.current.vistos.portalAte).toBe(15));
  });

  it("trocar de perfil carrega o visto dele na hora e descarta a conta pedida para o anterior", () => {
    gravarVistos(8, { chaves: new Set(["aviso:x"]), portalAte: 30 });
    const { result, rerender } = montar();
    const consultaDo7 = result.current.iniciarConsultaPortal();
    rerender({ ...base, perfilId: 8 });
    expect(result.current.iniciarConsultaPortal().portalAte).toBe(30);
    act(() => result.current.registrarContaPortal(consultaDo7, 4));
    expect(result.current.novosPortal).toBe(0);
  });

  it("com o sino aberto, o que chega fica visto e gravado", () => {
    const { result, rerender } = montar({ aberto: true });
    rerender({ ...base, aberto: true, chavesNaoLidas: ["aviso:novo"] });
    expect(result.current.vistos.chaves.has("aviso:novo")).toBe(true);
    expect(JSON.parse(localStorage.getItem("autoos:sino-visto:7") ?? "{}").chaves).toEqual(["aviso:novo"]);
  });
});
