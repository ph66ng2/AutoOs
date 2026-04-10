/**
 * @file useInsumos.ts
 *
 * Hook React para gerenciamento de estado de produtos/insumos de estoque.
 * Fornece operações CRUD completas (criar, ler, atualizar, deletar) e
 * registro de movimentações de estoque (entradas e saídas).
 *
 * @dependência lib/db.ts - Bridge de comunicação com o banco de dados SQLite via Tauri
 * @dependência types/index.ts - Interface {@link Produto} que define a estrutura de um produto
 *
 * @utilizadoPor pages/Insumos.tsx - Página de gestão de insumos/estoque
 *
 * @recursoChave `insumosAbaixoMinimo` — propriedade computada que retorna a
 * quantidade de produtos cujo estoque atual está abaixo do estoque mínimo
 * configurado, utilizada para alertas de estoque baixo no Dashboard.
 */
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/db";
import type { Produto } from "@/types";

/**
 * Parâmetros de filtragem para o hook {@link useInsumos}.
 *
 * @property busca - Texto livre para busca por nome ou código do produto.
 * @property categoria - Categoria para filtrar os produtos (ex.: "TONER", "CILINDRO").
 *   O valor especial "TODOS" é tratado como sem filtro.
 * @property apenasEstoqueBaixo - Quando `true`, retorna apenas produtos cujo
 *   estoque atual está abaixo da quantidade mínima configurada.
 */
interface UseInsumosParams {
  busca?: string;
  categoria?: string;
  apenasEstoqueBaixo?: boolean;
}

/**
 * Hook principal de gerenciamento de produtos/insumos.
 *
 * Gerencia a lista de produtos com controle de estoque, incluindo:
 * - Listagem com filtros (busca, categoria, estoque baixo)
 * - Criação, atualização e exclusão lógica de produtos
 * - Registro de movimentações de estoque (entrada/saída)
 * - Cálculo reativo de insumos abaixo do estoque mínimo
 *
 * @param params - Parâmetros opcionais de filtragem ({@link UseInsumosParams})
 * @returns Objeto contendo a lista de produtos, estados de loading/error,
 *   contagem de insumos abaixo do mínimo e funções CRUD + movimentação.
 */
export function useInsumos(params?: UseInsumosParams) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega a lista de produtos do banco de dados aplicando os filtros atuais.
   *
   * Chama `db.listarProdutos` que internamente invoca o comando Tauri
   * `listar_produtos` no backend Rust. Atualiza os estados `produtos`,
   * `loading` e `error` conforme o resultado.
   *
   * É memoizada via `useCallback` e re-executada automaticamente quando
   * os parâmetros de filtro mudam.
   */
  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await db.listarProdutos(
        params?.busca,
        params?.categoria === "TODOS" ? undefined : params?.categoria,
        params?.apenasEstoqueBaixo
      );
      setProdutos(data);
    } catch (err: any) {
      setError(err?.toString() || "Erro ao carregar produtos");
      console.error("Erro ao carregar produtos:", err);
    } finally {
      setLoading(false);
    }
  }, [params?.busca, params?.categoria, params?.apenasEstoqueBaixo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /**
   * Cria um novo produto no banco de dados.
   *
   * Fluxo: `db.criarProduto(produto)` → comando Tauri `criar_produto` (Rust).
   * Após criação bem-sucedida, recarrega a lista de produtos automaticamente.
   *
   * @param produto - Dados do novo produto a ser criado.
   * @returns Objeto com `{ sucesso: true }` ou `{ sucesso: false, erro: string }`.
   */
  const criar = async (produto: any) => {
    try {
      await db.criarProduto(produto);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  /**
   * Atualiza os dados de um produto existente.
   *
   * Fluxo: `db.atualizarProduto(id, produto)` → comando Tauri `atualizar_produto` (Rust).
   * Após atualização bem-sucedida, recarrega a lista de produtos automaticamente.
   *
   * @param id - ID do produto a ser atualizado.
   * @param produto - Dados atualizados do produto.
   * @returns Objeto com `{ sucesso: true }` ou `{ sucesso: false, erro: string }`.
   */
  const atualizar = async (id: number, produto: any) => {
    try {
      await db.atualizarProduto(id, produto);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  /**
   * Realiza a exclusão lógica (soft delete) de um produto, marcando `ativo = 0`.
   *
   * Fluxo: `db.deletarProduto(id)` → comando Tauri `deletar_produto` (Rust).
   * O produto não é removido fisicamente do banco, apenas desativado.
   * Após exclusão, recarrega a lista de produtos automaticamente.
   *
   * @param id - ID do produto a ser desativado.
   * @returns Objeto com `{ sucesso: true }` ou `{ sucesso: false, erro: string }`.
   */
  const deletar = async (id: number) => {
    try {
      await db.deletarProduto(id);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  /**
   * Registra uma movimentação de estoque (ENTRADA ou SAÍDA) para um produto.
   *
   * Fluxo: `db.registrarMovimentacao(...)` → comando Tauri
   * `registrar_movimentacao_estoque` (Rust). O backend Rust atualiza
   * automaticamente a `quantidade_estoque` do produto após o registro.
   * Após a movimentação, recarrega a lista para refletir o novo saldo.
   *
   * @param produtoId - ID do produto que receberá a movimentação.
   * @param tipo - Tipo da movimentação: `"ENTRADA"` (aumenta estoque) ou `"SAIDA"` (diminui estoque).
   * @param quantidade - Quantidade de unidades movimentadas (sempre positiva).
   * @param origem - Origem/motivo da movimentação (ex.: "COMPRA", "CONSUMO", "AJUSTE").
   * @param referencia - Referência opcional (ex.: número da nota fiscal, ID do equipamento).
   * @returns Objeto com `{ sucesso: true }` ou `{ sucesso: false, erro: string }`.
   */
  const registrarMovimentacao = async (
    produtoId: number,
    tipo: "ENTRADA" | "SAIDA",
    quantidade: number,
    origem: string,
    referencia?: string
  ) => {
    try {
      await db.registrarMovimentacao(produtoId, tipo, quantidade, origem, referencia);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  /**
   * Contagem computada de produtos cujo estoque atual (`quantidade_estoque`)
   * está abaixo do estoque mínimo configurado (`quantidade_minima`).
   *
   * Utilizado para exibir alertas de estoque baixo no Dashboard e na
   * página de Insumos. Recalculado automaticamente sempre que a lista
   * de produtos é atualizada.
   */
  const insumosAbaixoMinimo = produtos.filter(
    (p) => p.quantidade_estoque < p.quantidade_minima
  ).length;

  return {
    produtos,
    loading,
    error,
    insumosAbaixoMinimo,
    criar,
    atualizar,
    deletar,
    registrarMovimentacao,
    recarregar: carregar,
  };
}
