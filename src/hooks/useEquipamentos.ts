/**
 * @file useEquipamentos.ts
 * @description Hook React para gerenciamento de estado de equipamentos (CRUD + status).
 *
 * Encapsula as chamadas ao módulo db.ts com estado React (loading, error)
 * e atualização automática da lista via carregar() após cada operação.
 *
 * @depends lib/db.ts - ponte de comunicação com o backend Rust (Tauri commands)
 * @depends types/index.ts - interface Equipamento
 * @usedBy pages/Equipamentos.tsx - página principal de equipamentos
 */
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/db";
import type { Equipamento } from "@/types";

/**
 * Parâmetros de busca e filtro para a listagem de equipamentos.
 * @property busca - Texto livre para busca por nome, modelo, número de série, etc.
 * @property status - Filtro por status do equipamento (ex: "ABERTO", "EM_REPARO"). Use "TODOS" para ignorar o filtro.
 */
interface UseEquipamentosParams {
  busca?: string;
  status?: string;
}

/**
 * Hook principal de equipamentos. Gerencia o estado da lista, loading e erros,
 * expondo funções CRUD e de atualização de status.
 *
 * @param params - Parâmetros opcionais de busca/filtro
 * @returns Objeto com a lista de equipamentos, estados de loading/error e funções de mutação
 */
export function useEquipamentos(params?: UseEquipamentosParams) {
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega a lista de equipamentos do banco de dados.
   * Disparado automaticamente quando os parâmetros de busca/status mudam.
   * Atualiza os estados loading e error durante a execução.
   */
  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await db.listarEquipamentos(
        params?.busca,
        params?.status === "TODOS" ? undefined : params?.status
      );
      setEquipamentos(data);
    } catch (err: any) {
      setError(err?.toString() || "Erro ao carregar equipamentos");
      console.error("Erro ao carregar equipamentos:", err);
    } finally {
      setLoading(false);
    }
  }, [params?.busca, params?.status]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /**
   * Cria um novo equipamento e recarrega a lista.
   * Chama db.criarEquipamento → Rust criar_equipamento.
   *
   * @param equipamento - Dados do equipamento (sem id, gerado pelo banco)
   * @returns Objeto com { sucesso: boolean, erro?: string }
   */
  const criar = async (equipamento: Omit<Equipamento, "id">) => {
    try {
      const data = await db.criarEquipamento(equipamento);
      await carregar();
      return { sucesso: true, data };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  /**
   * Atualiza um equipamento existente e recarrega a lista.
   * Chama db.atualizarEquipamento → Rust atualizar_equipamento.
   *
   * @param id - ID do equipamento a ser atualizado
   * @param equipamento - Novos dados do equipamento
   * @returns Objeto com { sucesso: boolean, erro?: string }
   */
  const atualizar = async (id: number, equipamento: Omit<Equipamento, "id">) => {
    try {
      const data = await db.atualizarEquipamento(id, equipamento);
      await carregar();
      return { sucesso: true, data };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  /**
   * Remove um equipamento do banco e recarrega a lista.
   * Chama db.deletarEquipamento → Rust deletar_equipamento.
   *
   * @param id - ID do equipamento a ser removido
   * @returns Objeto com { sucesso: boolean, erro?: string }
   */
  const deletar = async (id: number) => {
    try {
      await db.deletarEquipamento(id);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  /**
   * Altera o status de um equipamento com parâmetros opcionais de orçamento/prazo.
   * Chama db.atualizarStatusEquipamento → Rust atualizar_status_equipamento.
   *
   * @param id - ID do equipamento
   * @param novoStatus - Novo status (ex: "AGUARDANDO_APROVACAO", "EM_REPARO", "CONCLUIDO")
   * @param valorOrcamento - Valor do orçamento (opcional, usado ao enviar orçamento)
   * @param prazoAprovacao - Data limite para aprovação (opcional)
   * @param valorFinal - Valor final cobrado (opcional, usado ao concluir)
   * @returns Objeto com { sucesso: boolean, erro?: string }
   */
  const atualizarStatus = async (
    id: number,
    novoStatus: string,
    valorOrcamento?: number,
    prazoAprovacao?: string,
    valorFinal?: number
  ) => {
    try {
      await db.atualizarStatusEquipamento(id, novoStatus, valorOrcamento, prazoAprovacao, valorFinal);
      await carregar();
      return { sucesso: true };
    } catch (err: any) {
      return { sucesso: false, erro: err?.toString() };
    }
  };

  return {
    equipamentos,
    loading,
    error,
    criar,
    atualizar,
    deletar,
    atualizarStatus,
    recarregar: carregar,
  };
}
