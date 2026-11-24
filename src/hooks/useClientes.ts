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
import { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import { argSegundoPlano } from "@/lib/ao-vivo";
import { useAtualizacaoAoVivo, useDestaquesAoVivo } from "@/hooks/useAtualizacaoAoVivo";
import { db } from "@/lib/db";
import type { Cliente, ContatoInicialInput, FiltroClientes } from "@/types";

/**
 * Parâmetros de pesquisa aceitos pelo hook useClientes.
 *
 * @property busca — Texto opcional para filtrar clientes por nome, documento ou razão social.
 *                    Quando alterado, a lista é recarregada automaticamente.
 */
interface UseClientesParams {
  busca?: string;
  /** Página apresentada pela interface, iniciando em 1. */
  page?: number;
  /** Recorte da lista (Empresas, Pessoas, Com OS aberta, Portal ativo). */
  filtro?: FiltroClientes;
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
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const carregouUmaVez = useRef(false);
  const cargaVisivelPendente = useRef(false);
  // Mudança chegou durante a carga visível: o SELECT dela pode ter rodado antes do COMMIT remoto.
  const recargaPendente = useRef(false);
  const mountedRef = useRef(false);
  const paramsRef = useRef(params);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useLayoutEffect(() => {
    paramsRef.current = params;
    requestIdRef.current += 1;
  }, [params?.busca, params?.page, params?.filtro]);

  /**
   * Carrega a lista de clientes a partir do banco de dados.
   *
   * Chama `db.listarClientes` (→ Rust `listar_clientes`) aplicando o filtro
   * de busca, se informado. É disparada automaticamente via useEffect sempre
   * que o valor de `busca` muda.
   */
  const carregar = useCallback(async (opcoes?: { silencioso?: boolean }) => {
    if (!mountedRef.current) return;
    const silencioso = opcoes?.silencioso === true;
    if (silencioso && cargaVisivelPendente.current) {
      recargaPendente.current = true;
      return;
    }
    const requestId = ++requestIdRef.current;
    const atual = () => mountedRef.current && requestIdRef.current === requestId;
    if (!silencioso) {
      cargaVisivelPendente.current = true;
      setLoading(true);
      setError(null);
    }
    try {
      const params = paramsRef.current;
      const data = await db.listarClientesPaginados(
        params?.busca,
        Math.max((params?.page ?? 1) - 1, 0),
        params?.filtro,
        ...argSegundoPlano(silencioso),
      );
      if (!atual()) return;
      carregouUmaVez.current = true;
      setError(null);
      setClientes(data.items);
      setTotal(data.total);
    } catch (err: any) {
      if (!atual() || (silencioso && carregouUmaVez.current)) return;
      setError(err?.toString() || "Erro ao carregar clientes");
      console.error("Erro ao carregar clientes:", err);
    } finally {
      if (atual()) {
        cargaVisivelPendente.current = false;
        setLoading(false);
        if (!silencioso && recargaPendente.current) {
          recargaPendente.current = false;
          void carregar({ silencioso: true });
        }
      }
    }
  }, []);

  useEffect(() => {
    void carregar();
    return () => {
      requestIdRef.current += 1;
      cargaVisivelPendente.current = false;
      recargaPendente.current = false;
    };
  }, [carregar, params?.busca, params?.page, params?.filtro]);

  // Outro computador mudou algo desta lista: recarrega em silêncio (segundo plano, sem renovar
  // a sessão) e destaca o que mudou. Equipamentos entram porque o filtro "Com OS aberta", a
  // contagem de OS abertas e o último atendimento de cada cliente dependem deles.
  const { destaques, lembrar } = useDestaquesAoVivo(clientes, (item) => item.id, (item) => JSON.stringify(item));

  useAtualizacaoAoVivo(["clientes", "cliente_contatos", "equipamentos"], () => {
    if (cargaVisivelPendente.current) {
      recargaPendente.current = true;
      return;
    }
    lembrar();
    void carregar({ silencioso: true });
  });

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
  const criar = async (cliente: Omit<Cliente, "id">, contatoInicial?: ContatoInicialInput) => {
    try {
      const criado = await db.criarCliente(cliente, contatoInicial);
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
  const atualizar = async (id: number, cliente: Omit<Cliente, "id">, contatoInicial?: ContatoInicialInput) => {
    try {
      await db.atualizarCliente(id, cliente, contatoInicial);
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
    destaques,
    clientes,
    total,
    loading,
    error,
    criar,
    atualizar,
    deletar,
    recarregar: carregar,
  };
}
