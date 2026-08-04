import { useState, useEffect, useCallback } from "react";
import { powerSyncDb, generateUUID, getEmpresaId } from "@/lib/powersync/client";
import type { Cliente } from "@/types";

interface UseClientesParams {
  busca?: string;
}

type ClienteRow = Record<string, unknown>;

function rowToCliente(r: ClienteRow): Cliente {
  return {
    id: r.id as number,
    nome: r.nome as string | undefined,
    tipo_pessoa: r.tipo_pessoa as string | undefined,
    documento: r.documento as string | undefined,
    razao_social: r.razao_social as string | undefined,
    nome_fantasia: r.nome_fantasia as string | undefined,
    inscricao_estadual: r.inscricao_estadual as string | undefined,
    cpf_cnpj: r.cpf_cnpj as string | undefined,
    telefone: r.telefone as string,
    telefone_secundario: r.telefone_secundario as string | undefined,
    email: r.email as string | undefined,
    cep: r.cep as string | undefined,
    endereco: r.endereco as string | undefined,
    numero: r.numero as string | undefined,
    complemento: r.complemento as string | undefined,
    bairro: r.bairro as string | undefined,
    cidade: r.cidade as string | undefined,
    uf: r.uf as string | undefined,
    receber_email: !!r.receber_email as boolean,
    receber_whatsapp: !!r.receber_whatsapp as boolean,
    observacoes: r.observacoes as string | undefined,
    ativo: !!r.ativo as boolean,
    criado_em: r.criado_em as string | undefined,
    atualizado_em: r.atualizado_em as string | undefined,
  };
}

function rowsToClientes(rows: ClienteRow[]): Cliente[] {
  return rows.map(rowToCliente);
}

export function useClientes(params?: UseClientesParams) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    const busca = params?.busca;

    let sql = "SELECT * FROM clientes WHERE ativo = 1";
    const queryParams: string[] = [];

    if (busca) {
      const like = `%${busca}%`;
      sql += " AND (nome LIKE ? OR documento LIKE ? OR razao_social LIKE ?)";
      queryParams.push(like, like, like);
    }

    sql += " ORDER BY nome";

    powerSyncDb().watch(
      sql,
      queryParams,
      {
        onResult: (result) => {
          if (abortController.signal.aborted) return;
          const rows = (result.rows?._array ?? []) as ClienteRow[];
          setClientes(rowsToClientes(rows));
          setLoading(false);
          setError(null);
        },
        onError: (err) => {
          if (abortController.signal.aborted) return;
          setError(err?.toString() || "Erro ao carregar clientes");
          console.error("useClientes watch error:", err);
          setLoading(false);
        },
      },
      { signal: abortController.signal }
    );

    return () => abortController.abort();
  }, [params?.busca]);

  const recarregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const busca = params?.busca;
      let sql = "SELECT * FROM clientes WHERE ativo = 1";
      const queryParams: string[] = [];
      if (busca) {
        const like = `%${busca}%`;
        sql += " AND (nome LIKE ? OR documento LIKE ? OR razao_social LIKE ?)";
        queryParams.push(like, like, like);
      }
      sql += " ORDER BY nome";
      const rows = await powerSyncDb().getAll<ClienteRow>(sql, queryParams);
      setClientes(rowsToClientes(rows));
    } catch (err: any) {
      setError(err?.toString() || "Erro ao carregar clientes");
      console.error("useClientes recarregar error:", err);
    } finally {
      setLoading(false);
    }
  }, [params?.busca]);

  const criar = async (cliente: Omit<Cliente, "id">) => {
    try {
      const id = generateUUID();
      const empresaId = await getEmpresaId();
      const now = new Date().toISOString();
      await powerSyncDb().execute(
        `INSERT INTO clientes
          (id, empresa_id, nome, tipo_pessoa, documento, razao_social, nome_fantasia,
           inscricao_estadual, cpf_cnpj, telefone, telefone_secundario, email,
           cep, endereco, numero, complemento, bairro, cidade, uf,
           receber_email, receber_whatsapp, observacoes, ativo, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, 1, ?, ?)`,
        [
          id, empresaId,
          cliente.nome ?? null, cliente.tipo_pessoa ?? null,
          cliente.documento ?? null, cliente.razao_social ?? null,
          cliente.nome_fantasia ?? null, cliente.inscricao_estadual ?? null,
          cliente.cpf_cnpj ?? null, cliente.telefone ?? "",
          cliente.telefone_secundario ?? null, cliente.email ?? null,
          cliente.cep ?? null, cliente.endereco ?? null,
          cliente.numero ?? null, cliente.complemento ?? null,
          cliente.bairro ?? null, cliente.cidade ?? null,
          cliente.uf ?? null, cliente.receber_email ? 1 : 0,
          cliente.receber_whatsapp ? 1 : 0, cliente.observacoes ?? null,
          now, now,
        ]
      );
      return { sucesso: true as const, id: id as unknown as number };
    } catch (err: any) {
      return { sucesso: false as const, erro: err?.toString() };
    }
  };

  const atualizar = async (id: number, cliente: Omit<Cliente, "id">) => {
    try {
      const now = new Date().toISOString();
      await powerSyncDb().execute(
        `UPDATE clientes SET
           nome = ?, tipo_pessoa = ?, documento = ?, razao_social = ?,
           nome_fantasia = ?, inscricao_estadual = ?, cpf_cnpj = ?,
           telefone = ?, telefone_secundario = ?, email = ?,
           cep = ?, endereco = ?, numero = ?, complemento = ?,
           bairro = ?, cidade = ?, uf = ?,
           receber_email = ?, receber_whatsapp = ?,
           observacoes = ?, atualizado_em = ?
         WHERE id = ?`,
        [
          cliente.nome ?? null, cliente.tipo_pessoa ?? null,
          cliente.documento ?? null, cliente.razao_social ?? null,
          cliente.nome_fantasia ?? null, cliente.inscricao_estadual ?? null,
          cliente.cpf_cnpj ?? null, cliente.telefone ?? "",
          cliente.telefone_secundario ?? null, cliente.email ?? null,
          cliente.cep ?? null, cliente.endereco ?? null,
          cliente.numero ?? null, cliente.complemento ?? null,
          cliente.bairro ?? null, cliente.cidade ?? null,
          cliente.uf ?? null, cliente.receber_email ? 1 : 0,
          cliente.receber_whatsapp ? 1 : 0, cliente.observacoes ?? null,
          now, String(id),
        ]
      );
      return { sucesso: true as const };
    } catch (err: any) {
      return { sucesso: false as const, erro: err?.toString() };
    }
  };

  const deletar = async (id: number) => {
    try {
      await powerSyncDb().execute("DELETE FROM clientes WHERE id = ?", [String(id)]);
      return { sucesso: true as const };
    } catch (err: any) {
      return { sucesso: false as const, erro: err?.toString() };
    }
  };

  return {
    clientes,
    loading,
    error,
    criar,
    atualizar,
    deletar,
    recarregar,
  };
}
