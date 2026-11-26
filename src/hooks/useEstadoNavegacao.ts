import { useContext } from "react";
import { UNSAFE_LocationContext } from "react-router-dom";

/**
 * `location.state` da navegação que abriu a página, ou null fora de um roteador
 * (testes que renderizam a página sozinha). Não lança como `useLocation`.
 */
export function useEstadoNavegacao<T>(): T | null {
  const contexto = useContext(UNSAFE_LocationContext);
  return (contexto?.location?.state as T | undefined) ?? null;
}
