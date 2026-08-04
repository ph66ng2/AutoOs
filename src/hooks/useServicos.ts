import { useState, useEffect, useCallback } from "react";
import { powerSyncDb, generateUUID, getEmpresaId } from "@/lib/powersync/client";
import type { ServicoCatalogo } from "@/types";

interface UseServicosParams {
  busca?: string;
  apenasAtivos?: boolean;
}

type ServicoRow = Record<string, unknown>;

function rowToServico(r: ServicoRow): ServicoCatalogo {
  return {
    id: r.id as number,
    nome: r.nome as string,
    descricao: r.descricao as string | undefined,
    preco_padrao: r.preco_padrao as number,
    ativo: !!r.ativo as boolean,
    criado_em: r.criado_em as string | undefined,
    atualizado_em: r.atualizado_em as string | undefined,
  };
}

function rowsToServicos(rows: ServicoRow[]): ServicoCatalogo[] {
  return rows.map(rowToServico);
}

export function useServicos(params?: UseServicosParams) {
  const [servicos, setServicos] = useState<ServicoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apenasAtivos = params?.apenasAtivos ?? true;

  useEffect(() => {
    const abortController = new AbortController();
    const busca = params?.busca;

    let sql = "SELECT * FROM servicos_catalogo WHERE 1 = 1";
    const queryParams: string[] = [];

    if (apenasAtivos) {
      sql += " AND ativo = 1";
    }
    if (busca) {
      sql += " AND (nome LIKE ? OR descricao LIKE ?)";
      const like = `%${busca}%`;
      queryParams.push(like, like);
    }

    sql += " ORDER BY nome";

    powerSyncDb().watch(
      sql,
      queryParams,
      {
        onResult: (result) => {
          if (abortController.signal.aborted) return;
          const rows = (result.rows?._array ?? []) as ServicoRow[];
          setServicos(rowsToServicos(rows));
          setLoading(false);
          setError(null);
        },
        onError: (err) => {
          if (abortController.signal.aborted) return;
          setError(err?.toString() || "Erro ao carregar serviços");
          console.error("useServicos watch error:", err);
          setLoading(false);
        },
      },
      { signal: abortController.signal }
    );

    return () => abortController.abort();
  }, [params?.busca, apenasAtivos]);

  const recarregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let sql = "SELECT * FROM servicos_catalogo WHERE 1 = 1";
      const queryParams: string[] = [];
      if (apenasAtivos) sql += " AND ativo = 1";
      if (params?.busca) {
        sql += " AND (nome LIKE ? OR descricao LIKE ?)";
        const like = `%${params.busca}%`;
        queryParams.push(like, like);
      }
      sql += " ORDER BY nome";
      const rows = await powerSyncDb().getAll<ServicoRow>(sql, queryParams);
      setServicos(rowsToServicos(rows));
    } catch (err: any) {
      setError(err?.toString() || "Erro ao carregar serviços");
      console.error("useServicos recarregar error:", err);
    } finally {
      setLoading(false);
    }
  }, [params?.busca, apenasAtivos]);

  const criar = async (servico: Omit<ServicoCatalogo, "id">) => {
    try {
      const id = generateUUID();
      const empresaId = await getEmpresaId();
      const now = new Date().toISOString();
      await powerSyncDb().execute(
        `INSERT INTO servicos_catalogo
          (id, empresa_id, nome, descricao, preco_padrao, ativo, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, empresaId,
          servico.nome,
          servico.descricao ?? null,
          servico.preco_padrao,
          servico.ativo ? 1 : 0,
          now, now,
        ]
      );
      return { sucesso: true as const };
    } catch (err: any) {
      return { sucesso: false as const, erro: err?.toString() };
    }
  };

  const atualizar = async (id: number, servico: Omit<ServicoCatalogo, "id">) => {
    try {
      const now = new Date().toISOString();
      await powerSyncDb().execute(
        `UPDATE servicos_catalogo SET
           nome = ?, descricao = ?, preco_padrao = ?,
           ativo = ?, atualizado_em = ?
         WHERE id = ?`,
        [
          servico.nome,
          servico.descricao ?? null,
          servico.preco_padrao,
          servico.ativo ? 1 : 0,
          now,
          String(id),
        ]
      );
      return { sucesso: true as const };
    } catch (err: any) {
      return { sucesso: false as const, erro: err?.toString() };
    }
  };

  const deletar = async (id: number) => {
    try {
      await powerSyncDb().execute("DELETE FROM servicos_catalogo WHERE id = ?", [String(id)]);
      return { sucesso: true as const };
    } catch (err: any) {
      return { sucesso: false as const, erro: err?.toString() };
    }
  };

  return {
    servicos,
    loading,
    error,
    criar,
    atualizar,
    deletar,
    recarregar,
  };
}
