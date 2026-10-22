import { SENSITIVE_PERMISSIONS as P, type SensitivePermission } from "@/types";

// Virar true quando toda a frota estiver na 0.6.0, junto com a migration que
// concede PREPARE_QUOTES a Técnico e Financeiro (a 0.5.6 recusa a chave em perfil não-ADMIN).
export const PREPARE_QUOTES_NOS_MODELOS = false;

export function montarPresets(prepareQuotes: boolean) {
  const quotes: SensitivePermission[] = prepareQuotes ? [P.PREPARE_QUOTES] : [];
  return [
    {
      role: "ATENDENTE",
      label: "Recepção",
      description:
        "Atendimento e rotina operacional, sem poderes administrativos.",
      permissions: [] as SensitivePermission[],
    },
    {
      role: "TECNICO",
      label: "Técnico",
      description: prepareQuotes
        ? "Rotina técnica, orçamentos e estoque."
        : "Rotina técnica e estoque.",
      permissions: [P.STOCK_CONTROL, ...quotes],
    },
    {
      role: "FINANCEIRO",
      label: "Financeiro",
      description: "Orçamentos, aprovações, valores e consulta de despesas.",
      permissions: [P.FINANCIAL_ACTIONS, ...quotes, P.VIEW_EXPENSES],
    },
    {
      role: "ADMIN",
      label: "Administrador",
      description: "Acesso completo, incluindo equipe, exclusões e integrações.",
      permissions: Object.values(P) as SensitivePermission[],
    },
    {
      role: "CUSTOM",
      label: "Personalizado",
      description:
        "Comece pelo acesso básico e escolha as liberações adicionais.",
      permissions: [] as SensitivePermission[],
    },
  ];
}

export const PROFILE_PRESETS = montarPresets(PREPARE_QUOTES_NOS_MODELOS);

export const PERMISSION_DETAILS: Record<
  SensitivePermission,
  { title: string; description: string; critical?: boolean }
> = {
  CONFIG_SMTP: {
    title: "E-mail",
    description: "Configurar SMTP e envios de e-mail.",
  },
  CONFIG_WHATSAPP: {
    title: "WhatsApp",
    description: "Configurar a integração de WhatsApp.",
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
    title: "Portal do Cliente e links de acompanhamento",
    description: "Publicar orçamento no portal, gerenciar acessos de contatos e o contato da empresa, e criar ou revogar links de acompanhamento.",
  },
  VIEW_EXPENSES: {
    title: "Consultar despesas",
    description: "Visualizar gastos e despesas.",
  },
};
