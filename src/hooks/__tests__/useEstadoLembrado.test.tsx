import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useEstadoLembrado, usePrimeiraPaginaAoFiltrar } from "../useEstadoLembrado";

function useLista() {
  const [filtro, setFiltro] = useEstadoLembrado("teste:filtro", "TODOS");
  const [pagina, setPagina] = useEstadoLembrado("teste:pagina", 1);
  usePrimeiraPaginaAoFiltrar([filtro], () => setPagina(1));
  return { filtro, setFiltro, pagina, setPagina };
}

describe("useEstadoLembrado", () => {
  it("reabrir a tela devolve filtro e página; mudar o filtro volta à página 1", () => {
    const primeira = renderHook(() => useLista());
    act(() => primeira.result.current.setFiltro("PRONTO"));
    act(() => primeira.result.current.setPagina(3));
    primeira.unmount();

    const segunda = renderHook(() => useLista());
    expect(segunda.result.current.filtro).toBe("PRONTO");
    expect(segunda.result.current.pagina).toBe(3);
    act(() => segunda.result.current.setFiltro("RECEBIDO"));
    expect(segunda.result.current.pagina).toBe(1);
  });

  it("valor guardado de outro tipo é ignorado", () => {
    sessionStorage.setItem("autoos:lista:teste:pagina", JSON.stringify("x"));
    const { result } = renderHook(() => useEstadoLembrado("teste:pagina", 1));
    expect(result.current[0]).toBe(1);
  });
});
