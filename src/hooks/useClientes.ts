/**
 * @file useClientes.ts
 * @description Hook React para gerenciamento de estado de clientes (CRUD completo).
 *
 * Dependências:
 *  - lib/db.ts       — ponte de comunicação com o backend Rust via Tauri invoke
 *  - types/index.ts  — interface Cliente (PF e PJ)
 *
 * Utilizado por:
 *  - pages/Clientes.tsx        — página principal de cadastro e gestão de clientes
 *  - components/equipamentos/ClienteSelector.tsx — seletor de cliente (usa o id retornado por `criar`)
 *
 * Funcionamento:
 *  Encapsula as chamadas ao db.ts com estado React (loading, error) e re-fetch
 *  automático sempre que o termo de busca (`busca`) é alterado.
 *  O método `criar` retorna o ID do novo cliente, permitindo que outros
 *  componentes o utilizem imediatamente após a criação.
 */
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/db";
import type { Cliente } from "@/types";

/**
 * Parâmetros de pesquisa aceitos pelo hook useClientes.
 *
 * @property busca — Texto opcional para filtrar clientes por nome, documento ou razão social.
 *                    Quando alterado, a lista é recarregada automaticamente.
 */
interface UseClientesParams {
  busca?: string;
}

/**
 * Hook principal de gerenciamento da lista de clientes (PF e PJ).
 *
 * Retorna a lista de clientes, estados de carregamento/erro e métodos CRUD
 * (criar, atualizar, deletar, recarregar). Toda operação de escrita dispara
 * automaticamente um re-fetch da lista.
 *
 * @param params — Parâmetros opcionais de filtragem ({@link UseClientesParams}).
 * @returns Objeto com { clientes, loading, error, criar, atualizar, deletar, recarregar }.
 */
export function useClientes(params?: UseClientesParams) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega a lista de clientes a partir do banco de dados.
   *
   * Chama `db.listarClientes` (→ Rust `listar_clientes`) aplicando o filtro
   * de busca, se informado. É disparada automaticamente via useEffect sempre
   * que o valor de `busca` muda.
   */
  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await db.listarClientes(params?.busca);
      setClientes(data);
    } catch (err: any) {
      setError(err?.toString() || "Erro ao carregar clientes");
      console.error("Erro ao carregar clientes:", err);
    } finally {
      setLoading(false);
    }
  }, [params?.busca]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /**
   * Cria um novo cliente (PF ou PJ) no banco de dados.
   *
   * Fluxo: `db.criarCliente` → Rust `criar_cliente` (INSERT no PostgreSQL).
   * Após a criação, recarrega a lista automaticamente.
   *
   * @param cliente — Dados do cliente sem o campo `id` (gerado pelo banco).
   * @returns `{ sucesso: true, id }` com o ID do novo registro, ou
   *          `{ sucesso: false, erro }` em caso de falha.
   *          O `id` retornado é utilizado por ClienteSelector.tsx para
   *          vincular o cliente recém-criado a um equipamento.
   */
  const criar = async (cliente: Omit<Cliente, "id">) => {
    try {
      const criado = await db.criarCliente(cliente);
      await carregar();
      return { sucesso: true, id: criado.id! };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  /**
   * Atualiza os dados de um cliente existente.
   *
   * Fluxo: `db.atualizarCliente` → Rust `atualizar_cliente` (UPDATE no PostgreSQL).
   * Após a atualização, recarrega a lista automaticamente.
   *
   * @param id      — ID do cliente a ser atualizado.
   * @param cliente — Novos dados do cliente (sem o campo `id`).
   * @returns `{ sucesso: true }` ou `{ sucesso: false, erro }` em caso de falha.
   */
  const atualizar = async (id: number, cliente: Omit<Cliente, "id">) => {
    try {
      await db.atualizarCliente(id, cliente);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  /**
   * Remove um cliente do banco de dados.
   *
   * Fluxo: `db.deletarCliente` → Rust `deletar_cliente` (DELETE no PostgreSQL).
   * Após a exclusão, recarrega a lista automaticamente.
   *
   * @param id — ID do cliente a ser removido.
   * @returns `{ sucesso: true }` ou `{ sucesso: false, erro }` em caso de falha.
   */
  const deletar = async (id: number) => {
    try {
      await db.deletarCliente(id);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  return {
    clientes,
    loading,
    error,
    criar,
    atualizar,
    deletar,
    recarregar: carregar,
  };
}
