import { useCallback, useEffect, useRef, useState } from "react";
import { assinarMudancas, calcularDestaques, type Destaque, type MudancaAoVivo } from "@/lib/ao-vivo";

/**
 * Recarrega em silêncio quando outro computador muda as `tabelas` (ou ao reconectar e ao
 * voltar o foco). `recarregar` não deve mostrar "carregando": a tela fica como está e só o
 * que mudou troca.
 */
export function useAtualizacaoAoVivo(tabelas: string[], recarregar: (mudancas: MudancaAoVivo[]) => void) {
  const ref = useRef(recarregar);
  ref.current = recarregar;
  const chave = tabelas.join(",");
  useEffect(() => assinarMudancas(chave.split(","), (mudancas) => ref.current(mudancas)), [chave]);
}

const DURACAO_DESTAQUE_MS = 2500;

/**
 * Destaques de uma lista que mudou ao vivo: antes de recarregar, `lembrar()` guarda a lista
 * atual; quando a nova chega, os itens novos e alterados ganham destaque por alguns segundos.
 * Trocas de página, filtro ou busca não destacam nada (só a atualização ao vivo chama `lembrar`).
 */
export function useDestaquesAoVivo<T>(
  itens: readonly T[],
  chave: (item: T) => number | string | null | undefined,
  versao: (item: T) => unknown,
) {
  const [destaques, setDestaques] = useState<Map<number | string, Destaque>>(() => new Map());
  const antes = useRef<readonly T[] | null>(null);
  const atual = useRef(itens);
  atual.current = itens;
  const chaveRef = useRef(chave);
  chaveRef.current = chave;
  const versaoRef = useRef(versao);
  versaoRef.current = versao;

  const lembrar = useCallback(() => { antes.current = atual.current; }, []);

  useEffect(() => {
    const anterior = antes.current;
    if (!anterior || anterior === itens) return;
    antes.current = null;
    const novos = calcularDestaques(anterior, itens, chaveRef.current, versaoRef.current);
    if (novos.size > 0) setDestaques(novos);
  }, [itens]);

  // O destaque some sozinho; outra lista chegando no meio não cancela isso (o prazo é do destaque).
  useEffect(() => {
    if (destaques.size === 0) return;
    const timer = window.setTimeout(() => setDestaques(new Map()), DURACAO_DESTAQUE_MS);
    return () => window.clearTimeout(timer);
  }, [destaques]);

  return { destaques, lembrar };
}
