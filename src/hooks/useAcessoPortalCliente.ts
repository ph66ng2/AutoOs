import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { Cliente, ClienteContato } from "@/types";

export type AcessoPortalCliente = {
  /** Login do portal (CPF ou CNPJ, só dígitos). Null quando o cadastro não tem documento válido. */
  documento: string | null;
  /** Contatos ativos com acesso ao portal (responder ou só acompanhar). */
  contatos: ClienteContato[];
};

function documentoValido(valor?: string | null): string | null {
  const digitos = (valor ?? "").replace(/\D/g, "");
  return digitos.length === 11 || digitos.length === 14 ? digitos : null;
}

/** Login do portal e quem do cliente tem acesso a ele. `versao` muda para recarregar após alterar contatos. */
export function useAcessoPortalCliente(clienteId?: number | null, empresaId?: number | null, versao = 0) {
  const [data, setData] = useState<AcessoPortalCliente | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!clienteId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const cliente: Cliente | null = await db.buscarCliente(clienteId);
      const empresa = empresaId ?? cliente?.empresa_id;
      const todos = empresa ? await db.listarClienteContatos(clienteId, empresa) : [];
      const contatos = todos.filter(
        (contato) => contato.ativo && (contato.portal_acesso === "DECIDIR" || contato.portal_acesso === "ACOMPANHAR"),
      );
      setData({ documento: documentoValido(cliente?.documento || cliente?.cpf_cnpj), contatos });
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [clienteId, empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  return { data, loading, error, recarregar: carregar };
}
