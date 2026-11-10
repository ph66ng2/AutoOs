import { SENSITIVE_PERMISSIONS as P, type SensitivePermission } from "@/types";
import { COMPATIBILIDADE_056_ATIVA } from "@/lib/compatibilidade-056";

// Ligada em 10/11/2026, com toda a frota na 0.6.2, junto com a migration 0045 que
// concede PREPARE_QUOTES a Técnico e Financeiro (a 0.5.6 recusava a chave em perfil não-ADMIN).
export const PREPARE_QUOTES_NOS_MODELOS = true;

export const MOTIVO_RECEPCAO_INDISPONIVEL =
  "Indisponível até todos os computadores atualizarem para a 0.6.0.";

export function montarPresets(
  prepareQuotes: boolean,
  travaAtiva: boolean = COMPATIBILIDADE_056_ATIVA,
) {
  const quotes: SensitivePermission[] = prepareQuotes ? [P.PREPARE_QUOTES] : [];
  const portal: SensitivePermission[] = travaAtiva ? [] : [P.MANAGE_STATUS_LINKS];
  return [
    {
      role: "ATENDENTE",
      label: "Recepção",
      description:
        "Atendimento e rotina operacional, sem poderes administrativos.",
      permissions: [...portal],
      disponivel: !travaAtiva,
      motivoIndisponivel: travaAtiva ? MOTIVO_RECEPCAO_INDISPONIVEL : undefined,
    },
    {
      role: "TECNICO",
      label: "Técnico",
      description: prepareQuotes
        ? "Rotina técnica, orçamentos e estoque."
        : "Rotina técnica e estoque.",
      permissions: [P.STOCK_CONTROL, ...quotes, ...portal],
      disponivel: true,
      motivoIndisponivel: undefined as string | undefined,
    },
    {
      role: "FINANCEIRO",
      label: "Financeiro",
      description: "Orçamentos, aprovações, valores e consulta de despesas.",
      permissions: [P.FINANCIAL_ACTIONS, ...quotes, P.VIEW_EXPENSES, ...portal],
      disponivel: true,
      motivoIndisponivel: undefined as string | undefined,
    },
    {
      role: "ADMIN",
      label: "Administrador",
      description: "Acesso completo, incluindo equipe, exclusões e integrações.",
      permissions: Object.values(P) as SensitivePermission[],
      disponivel: true,
      motivoIndisponivel: undefined as string | undefined,
    },
    {
      role: "CUSTOM",
      label: "Personalizado",
      description:
        "Comece pelo acesso básico e escolha as liberações adicionais.",
      permissions: [] as SensitivePermission[],
      disponivel: true,
      motivoIndisponivel: undefined as string | undefined,
    },
  ];
}

export const PROFILE_PRESETS = montarPresets(PREPARE_QUOTES_NOS_MODELOS);

export const PERMISSION_DETAILS: Record<
  SensitivePermission,
  { title: string; description: string; critical?: boolean }
> = {
  COMMUNICATION_SETTINGS: {
    title: "Comunicação externa",
    description: "Configurar SMTP e WhatsApp e ligar ou desligar o Portal do Cliente.",
    critical: true,
  },
  DELETE_RECORDS: {
    title: "Excluir registros",
    description: "Autorizar exclusões de registros nos módulos protegidos.",
    critical: true,
  },
  FINANCIAL_ACTIONS: {
    title: "Orçamentos e valores",
    description: "Alterar orçamentos, aprovações e valores financeiros.",
  },
  STOCK_CONTROL: {
    title: "Estoque",
    description: "Movimentar e editar o estoque.",
  },
  PREPARE_QUOTES: {
    title: "Elaborar e enviar orçamentos",
    description: "Finalizar verificação com orçamento, editar orçamento ainda não decidido, prorrogar prazo e publicar no portal.",
  },
  MANAGE_PROFILES: {
    title: "Gerenciar equipe",
    description: "Criar e administrar perfis, PINs e consultar auditoria.",
    critical: true,
  },
  MANAGE_STATUS_LINKS: {
    title: "Acessos do portal",
    description: "Enviar links de acompanhamento, criar ou redefinir senhas e acessos de contatos, publicar orçamentos e editar o contato da empresa. Não permite ligar ou desligar o portal.",
  },
  VIEW_EXPENSES: {
    title: "Consultar despesas",
    description: "Visualizar gastos e despesas.",
  },
};
