import type { StatusEquipamento } from "@/types";

/**
 * Quais ações a linha de uma OS oferece em cada status, sem ícone nem handler.
 * Equipamentos.tsx transforma cada id em botão; as permissões são checadas lá
 * e chegam aqui só como booleanos. Orçamento, correção, Editar e Excluir são
 * acrescentados pela página (seções fixas do menu ⋯), não por esta função.
 */
export type AcaoStatusId =
  | "iniciar_verificacao"
  | "abrir_verificacao"
  | "enviar_orcamento"
  | "aprovar"
  | "reprovar"
  | "iniciar_manutencao"
  | "marcar_pronto"
  | "retomar_manutencao"
  | "registrar_entrega"
  | "reabrir_orcamento"
  | "renovar_orcamento"
  | "status"
  | "mudar_status"
  | "os_pdf"
  | "whatsapp_orcamento"
  | "whatsapp_pronto"
  | "desfazer_aprovacao";

export interface AcaoStatus {
  id: AcaoStatusId;
  rotulo: string;
  /** Status para o qual a ação leva, quando ela muda o status diretamente. */
  destino?: StatusEquipamento;
}

export interface ContextoAcoes {
  /** Financeiro ou "Elaborar e enviar orçamentos". */
  podeOrcamentoValores: boolean;
  /** Ações financeiras (desfazer aprovação). */
  podeFinanceiro: boolean;
  temTelefone: boolean;
  /** Há próximo status válido (só usado em status sem ação própria). */
  temProximosStatus: boolean;
}

export interface AcoesDoStatus {
  principal: AcaoStatus;
  secundaria?: AcaoStatus;
  /** Seção "Neste status" do menu ⋯, na ordem de exibição. */
  nesteStatus: AcaoStatus[];
}

const A = {
  status: { id: "status", rotulo: "Status" },
  mudarStatus: { id: "mudar_status", rotulo: "Mudar Status" },
  osPdf: { id: "os_pdf", rotulo: "OS PDF" },
  whatsappOrcamento: { id: "whatsapp_orcamento", rotulo: "WhatsApp" },
  whatsappPronto: { id: "whatsapp_pronto", rotulo: "WhatsApp" },
} satisfies Record<string, AcaoStatus>;

export function acoesPorStatus(status: string, ctx: ContextoAcoes): AcoesDoStatus {
  const { podeOrcamentoValores, podeFinanceiro, temTelefone } = ctx;
  switch (status) {
    case "RECEBIDO":
      return {
        principal: { id: "iniciar_verificacao", rotulo: "Iniciar Verificação", destino: "EM_VERIFICACAO" },
        secundaria: A.status,
        nesteStatus: [A.osPdf],
      };
    case "EM_VERIFICACAO":
      return {
        principal: { id: "abrir_verificacao", rotulo: "Abrir Verificação" },
        secundaria: A.status,
        nesteStatus: [],
      };
    case "VERIFICADO":
      return {
        ...(podeOrcamentoValores
          ? { principal: { id: "enviar_orcamento", rotulo: "Enviar Orçamento", destino: "AGUARDANDO_APROVACAO" }, secundaria: A.status }
          : { principal: A.status }),
        nesteStatus: temTelefone ? [A.whatsappOrcamento] : [],
      };
    case "AGUARDANDO_APROVACAO":
      if (podeOrcamentoValores) {
        return {
          principal: { id: "aprovar", rotulo: "Aprovar", destino: "APROVADO" },
          secundaria: { id: "reprovar", rotulo: "Reprovar", destino: "REPROVADO" },
          nesteStatus: [A.status, ...(temTelefone ? [A.whatsappOrcamento] : [])],
        };
      }
      return { principal: A.status, nesteStatus: temTelefone ? [A.whatsappOrcamento] : [] };
    case "APROVADO":
      return {
        principal: { id: "iniciar_manutencao", rotulo: "Iniciar Manutenção", destino: "EM_MANUTENCAO" },
        secundaria: A.status,
        nesteStatus: podeFinanceiro ? [{ id: "desfazer_aprovacao", rotulo: "Desfazer aprovação" }] : [],
      };
    case "EM_MANUTENCAO":
      return {
        principal: { id: "marcar_pronto", rotulo: "Marcar Pronto", destino: "PRONTO" },
        secundaria: A.status,
        nesteStatus: [],
      };
    case "AGUARDANDO_PECA":
      return {
        principal: { id: "retomar_manutencao", rotulo: "Retomar Manutenção", destino: "EM_MANUTENCAO" },
        secundaria: A.status,
        nesteStatus: [],
      };
    case "PRONTO":
      return {
        principal: { id: "registrar_entrega", rotulo: "Registrar Entrega", destino: "ENTREGUE" },
        secundaria: A.status,
        nesteStatus: temTelefone ? [A.whatsappPronto] : [],
      };
    case "REPROVADO":
      // Reabrir pergunta entre corrigir engano e nova proposta; não tem destino único.
      return podeOrcamentoValores
        ? { principal: { id: "reabrir_orcamento", rotulo: "Reabrir Orçamento" }, nesteStatus: [A.mudarStatus] }
        : { principal: A.status, nesteStatus: [] };
    case "ORCAMENTO_VENCIDO":
      return podeOrcamentoValores
        ? {
          principal: { id: "renovar_orcamento", rotulo: "Renovar orçamento", destino: "AGUARDANDO_APROVACAO" },
          secundaria: A.status,
          nesteStatus: [],
        }
        : { principal: A.status, nesteStatus: [] };
    default:
      return {
        principal: A.status,
        ...(ctx.temProximosStatus ? { secundaria: A.mudarStatus } : {}),
        nesteStatus: [],
      };
  }
}
