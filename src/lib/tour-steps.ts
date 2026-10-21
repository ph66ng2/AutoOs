import type { SensitivePermission } from "@/types";

/**
 * Mapeamento único "o que o perfil pode fazer → onde mostrar no tour".
 * Ao criar uma permissão nova em auth.rs, acrescente o passo dela aqui;
 * o teste em tour-steps.test.ts falha se alguma permissão ficar sem passo.
 */
export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Valor de `data-tour` do elemento destacado. Sem alvo, o card aparece centralizado. */
  target?: string;
  /** Rota aberta antes de destacar o alvo, quando ele não está no menu lateral. */
  route?: string;
}

/** Telas que todo perfil usa, sem permissão sensível. */
export const BASE_MODULES: { title: string }[] = [
  { title: "Equipamentos" },
  { title: "Clientes" },
  { title: "Serviços" },
  { title: "Balcão" },
];

const BASE_TOUR: TourStep[] = [
  {
    id: "menu",
    title: "Seu menu",
    body: "Aqui ficam as telas que o seu perfil pode usar. Se uma tela não aparece, ela ainda não foi liberada para você.",
    target: "nav",
  },
  {
    id: "equipamentos",
    title: "Equipamentos",
    body: "Toda impressora que chega começa aqui: cliente, defeito relatado, fotos pelo celular e o status até a entrega.",
    target: "nav-/equipamentos",
  },
  {
    id: "clientes",
    title: "Clientes",
    body: "Cadastro de pessoas e empresas, com CPF/CNPJ conferidos e os contatos que recebem avisos.",
    target: "nav-/clientes",
  },
  {
    id: "servicos",
    title: "Serviços",
    body: "Catálogo de serviços e valores usados nos orçamentos.",
    target: "nav-/servicos",
  },
  {
    id: "perfil",
    title: "Seu perfil",
    body: "Troque de perfil, mude nome, ícone e tema, e reveja este tour quando quiser em Perfil › Tutorial.",
    target: "profile-card",
  },
  {
    id: "balcao",
    title: "Modo Balcão",
    body: "Tela simplificada para a recepção: nova entrada, busca de equipamento e cliente, consulta de estoque. Troque em Perfil › Modo deste computador; a escolha vale só neste computador. Aprovar ou mudar valores ali pede a permissão de orçamentos.",
    target: "perfil-modo",
    route: "/perfil",
  },
];

export const PERMISSION_TOUR: Record<SensitivePermission, TourStep> = {
  FINANCIAL_ACTIONS: {
    id: "financeiro",
    title: "Orçamentos e valores",
    body: "Você pode aprovar, reprovar e alterar valores e prazos de orçamento nos equipamentos.",
    target: "nav-/equipamentos",
  },
  VIEW_EXPENSES: {
    id: "gastos",
    title: "Gastos",
    body: "Consulte os gastos fixos e variáveis da empresa e o resumo de cada mês.",
    target: "nav-/gastos",
  },
  STOCK_CONTROL: {
    id: "estoque",
    title: "Estoque",
    body: "Movimente e edite o estoque de peças e insumos.",
    target: "nav-/insumos",
  },
  MANAGE_STATUS_LINKS: {
    id: "links",
    title: "Portal do Cliente",
    body: "Publique orçamentos no portal, gerencie os acessos dos contatos e crie ou revogue os links de acompanhamento da OS. Em Configurações › Integrações, ligue o portal e edite o contato da empresa.",
    target: "nav-/equipamentos",
  },
  DELETE_RECORDS: {
    id: "exclusoes",
    title: "Excluir registros",
    body: "Os botões de excluir aparecem nos cadastros protegidos. Toda exclusão pede confirmação e fica na auditoria.",
  },
  MANAGE_PROFILES: {
    id: "equipe",
    title: "Equipe",
    body: "Crie perfis, gere códigos de primeiro acesso e ajuste o que cada pessoa pode fazer.",
    target: "perfil-tab-equipe",
    route: "/perfil",
  },
  CONFIG_SMTP: {
    id: "integracoes",
    title: "Integrações",
    body: "Configure o envio de e-mail e o WhatsApp em Configurações.",
    target: "nav-/configuracoes",
  },
  CONFIG_WHATSAPP: {
    id: "integracoes",
    title: "Integrações",
    body: "Configure o envio de e-mail e o WhatsApp em Configurações.",
    target: "nav-/configuracoes",
  },
};

export type TourKind = "completo" | "novidades";

function permissionSteps(permissions: SensitivePermission[]): TourStep[] {
  const steps: TourStep[] = [];
  for (const permission of permissions) {
    const step = PERMISSION_TOUR[permission];
    if (step && !steps.some((item) => item.id === step.id)) steps.push(step);
  }
  return steps;
}

export function newPermissions(permissions: SensitivePermission[], seen: SensitivePermission[] | null | undefined): SensitivePermission[] {
  if (!seen) return [...permissions];
  return permissions.filter((permission) => !seen.includes(permission));
}

/** Passos do tour completo (base + tudo o que o perfil pode fazer). */
export function fullTour(permissions: SensitivePermission[]): TourStep[] {
  return [...BASE_TOUR, ...permissionSteps(permissions)];
}

/**
 * Qual tour o perfil deve ver ao entrar: o completo se nunca viu nenhum,
 * só as novidades se ganhou permissões desde o último, ou nenhum.
 * Permissões retiradas não geram tour.
 */
export function pendingTour(
  permissions: SensitivePermission[],
  seen: SensitivePermission[] | null | undefined,
): { kind: TourKind; steps: TourStep[] } | null {
  if (!seen) return { kind: "completo", steps: fullTour(permissions) };
  const added = newPermissions(permissions, seen);
  if (added.length === 0) return null;
  return { kind: "novidades", steps: permissionSteps(added) };
}
