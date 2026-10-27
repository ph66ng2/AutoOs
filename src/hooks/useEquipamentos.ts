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
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
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
  ordenacao?: "ATUALIZACAO_RECENTE" | "CADASTRO_RECENTE";
  /** Página apresentada pela interface, iniciando em 1. */
  page?: number;
}

type ResultadoCarregamento =
  | { status: "atualizado" }
  | { status: "obsoleto" }
  | { status: "falhou"; erro: string };

function mensagemErro(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : String(error || fallback);
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
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avisoAtualizacao, setAvisoAtualizacao] = useState<string | null>(null);
  const requestIdRef = useRef(0);
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
    // Invalidate the previous filter request as soon as the new params commit,
    // before a resolved promise can publish its stale result.
    requestIdRef.current += 1;
  }, [params?.busca, params?.status, params?.page, params?.ordenacao]);

  /**
   * Carrega a lista de equipamentos do banco de dados.
   * Disparado automaticamente quando os parâmetros de busca/status mudam.
   * Atualiza os estados loading e error durante a execução.
   */
  const carregar = useCallback(async (opcoes?: { silencioso?: boolean; aposGravacao?: boolean }): Promise<ResultadoCarregamento> => {
    if (!mountedRef.current) return { status: "obsoleto" };

    const requestId = ++requestIdRef.current;
    const atual = () => mountedRef.current && requestIdRef.current === requestId;
    // Silencioso: atualização em segundo plano (ex.: cliente respondeu no portal) sem trocar a
    // lista pelo indicador de carregamento.
    const silencioso = opcoes?.silencioso === true;
    if (!silencioso) setLoading(true);
    setError(null);
    setAvisoAtualizacao(null);
    try {
      const params = paramsRef.current;
      const data = await db.listarEquipamentosPaginados(
        params?.busca,
        params?.status === "TODOS" ? undefined : params?.status,
        Math.max((params?.page ?? 1) - 1, 0),
        params?.ordenacao ?? "ATUALIZACAO_RECENTE",
      );
      if (!atual()) return { status: "obsoleto" };
      setEquipamentos(data.items);
      setTotal(data.total);
      return { status: "atualizado" };
    } catch (err: any) {
      if (!atual()) return { status: "obsoleto" };
      const erro = mensagemErro(err, "Erro ao carregar equipamentos");
      setError(erro);
      setAvisoAtualizacao(opcoes?.aposGravacao ? erro : null);
      console.error("Erro ao carregar equipamentos:", err);
      return { status: "falhou", erro };
    } finally {
      if (atual()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    return () => {
      requestIdRef.current += 1;
    };
  }, [carregar, params?.busca, params?.status, params?.page, params?.ordenacao]);

  const recarregar = useCallback(() => carregar(), [carregar]);
  const atualizarEmSegundoPlano = useCallback(() => carregar({ silencioso: true }), [carregar]);

  const recarregarAposGravacao = async () => {
    const resultado = await carregar({ silencioso: true, aposGravacao: true });
    return {
      recargaSucesso: resultado.status === "atualizado",
      ...(resultado.status === "falhou" ? { avisoAtualizacao: resultado.erro } : {}),
    };
  };

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
      return { sucesso: true as const, data, ...(await recarregarAposGravacao()) };
    } catch (err: any) {
      return { sucesso: false as const, erro: err?.toString() };
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
      return { sucesso: true as const, data, ...(await recarregarAposGravacao()) };
    } catch (err: any) {
      return { sucesso: false as const, erro: err?.toString() };
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
      return { sucesso: true as const, ...(await recarregarAposGravacao()) };
    } catch (err: any) {
      return { sucesso: false as const, erro: err?.toString() };
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
    valorFinal?: number,
    expectedUpdatedEm?: string,
    motivoCorrecao?: string,
  ) => {
    try {
      await db.atualizarStatusEquipamento(
        id,
        novoStatus,
        valorOrcamento,
        prazoAprovacao,
        valorFinal,
        expectedUpdatedEm,
        motivoCorrecao,
      );
      return { sucesso: true as const, ...(await recarregarAposGravacao()) };
    } catch (err: any) {
      return { sucesso: false as const, erro: err?.toString() };
    }
  };

  return {
    equipamentos,
    total,
    loading,
    error,
    avisoAtualizacao,
    criar,
    atualizar,
    deletar,
    atualizarStatus,
    recarregar,
    atualizarEmSegundoPlano,
  };
}
