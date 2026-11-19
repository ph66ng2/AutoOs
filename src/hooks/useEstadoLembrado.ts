import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

const PREFIXO = "autoos:lista:";

function ler<T>(chave: string, inicial: T): T {
  try {
    const bruto = sessionStorage.getItem(PREFIXO + chave);
    if (bruto == null) return inicial;
    const valor = JSON.parse(bruto) as unknown;
    return typeof valor === typeof inicial ? (valor as T) : inicial;
  } catch {
    return inicial;
  }
}

/**
 * `useState` que a tela reencontra ao voltar (filtro, busca, página, ordenação).
 * Fica na sessão do app: some ao fechar, para o filtro de ontem não esconder a fila de hoje.
 */
export function useEstadoLembrado(chave: string, inicial: string): [string, Dispatch<SetStateAction<string>>];
export function useEstadoLembrado(chave: string, inicial: number): [number, Dispatch<SetStateAction<number>>];
/** Com tipo explícito, para uniões de texto (`useEstadoLembrado<"A" | "B">(...)`). */
export function useEstadoLembrado<T extends string>(chave: string, inicial: T): [T, Dispatch<SetStateAction<T>>];
export function useEstadoLembrado<T extends string | number>(chave: string, inicial: T): [T, Dispatch<SetStateAction<T>>] {
  const [valor, setValor] = useState<T>(() => ler(chave, inicial));
  useEffect(() => {
    try {
      sessionStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
    } catch {
      // Armazenamento indisponível: a tela só não lembra.
    }
  }, [chave, valor]);
  const definir = useCallback<Dispatch<SetStateAction<T>>>((proximo) => setValor(proximo), []);
  return [valor, definir];
}

/**
 * Volta à página 1 quando o filtro muda, mas não na montagem: ao reabrir a tela
 * com o filtro lembrado, a página lembrada continua valendo.
 */
export function usePrimeiraPaginaAoFiltrar(filtro: readonly unknown[], irParaPrimeira: () => void) {
  const chave = JSON.stringify(filtro);
  const ultima = useRef(chave);
  const ir = useRef(irParaPrimeira);
  ir.current = irParaPrimeira;
  useEffect(() => {
    if (ultima.current === chave) return;
    ultima.current = chave;
    ir.current();
  }, [chave]);
}
