import { formatarDocumento, formatarTelefone } from "@/lib/validations";
import type { Cliente } from "@/types";

/** Telefone ausente (NULL ou em branco) aparece como traço. */
export function telefoneExibicaoCliente(telefone?: string | null): string {
  if (!telefone?.trim()) return "—";
  return formatarTelefone(telefone);
}

/** Nome de exibição: PJ usa nome_fantasia/razao_social, PF usa nome */
export function nomeExibicaoCliente(c: Cliente): string {
  if (c.tipo_pessoa === "PJ") {
    return c.nome_fantasia || c.razao_social || c.nome || "—";
  }
  return c.nome || "—";
}

/** Documento formatado para exibição em listas e cartões */
export function documentoExibicaoCliente(c: Cliente): string {
  const doc = c.documento || c.cpf_cnpj;
  if (!doc) return "—";
  return formatarDocumento(doc);
}
