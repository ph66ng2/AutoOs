import type { Equipamento } from "@/types";

export type RecipientChannel = "email" | "telefone";
export type RecipientOrigin = "responsavel" | "cadastro_empresa" | "manual" | "sem_envio";

export interface ResolvedRecipient {
  nome: string;
  endereco: string;
  origem: RecipientOrigin;
}

function clean(value?: string | null) {
  return value?.trim() || "";
}

function recipientName(equipamento: Equipamento) {
  return clean(equipamento.responsavel_nome) || clean(equipamento.cliente_nome) || "Cliente";
}

/**
 * Resolve um canal sem misturar e-mail e telefone.
 * O contato responsável só ganha prioridade quando possui endereço no canal
 * solicitado; assim, um responsável sem e-mail ainda usa o e-mail geral.
 */
export function resolveRecipient(
  equipamento: Equipamento,
  canal: RecipientChannel,
  manual?: string,
): ResolvedRecipient {
  const responsavel = canal === "email"
    ? clean(equipamento.responsavel_email)
    : clean(equipamento.responsavel_telefone);
  if (responsavel) {
    return { nome: recipientName(equipamento), endereco: responsavel, origem: "responsavel" };
  }

  const cadastroEmpresa = canal === "email"
    ? clean(equipamento.cliente_email)
    : clean(equipamento.cliente_telefone);
  if (cadastroEmpresa) {
    return {
      nome: clean(equipamento.cliente_nome) || "Cliente",
      endereco: cadastroEmpresa,
      origem: "cadastro_empresa",
    };
  }

  const manualAddress = clean(manual);
  if (manualAddress) {
    return {
      nome: recipientName(equipamento),
      endereco: manualAddress,
      origem: "manual",
    };
  }

  return { nome: recipientName(equipamento), endereco: "", origem: "sem_envio" };
}

export function recipientOriginLabel(origem: RecipientOrigin) {
  switch (origem) {
    case "responsavel":
      return "Responsável pelo equipamento";
    case "cadastro_empresa":
      return "Cadastro da empresa/cliente";
    case "manual":
      return "Manual";
    default:
      return "Sem endereço cadastrado";
  }
}
