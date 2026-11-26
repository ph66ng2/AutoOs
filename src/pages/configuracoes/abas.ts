export type AbaConfiguracoesId = "geral" | "smtp" | "portal" | "infra" | "seguranca" | "observabilidade";

export type PermissoesAbasConfiguracoes = {
  smtp: boolean;
  whatsapp: boolean;
  portal: boolean;
  admin: boolean;
};

/** Abas que podem ser abertas pelo endereço (`/configuracoes?aba=portal`). */
export const ABAS_CONFIGURACOES: AbaConfiguracoesId[] = ["geral", "smtp", "portal", "infra", "seguranca", "observabilidade"];

/**
 * Geral (deste computador) é aberta a qualquer perfil e é a aba inicial.
 * Integrações (SMTP, WhatsApp, túnel de fotos) e Portal do Cliente são abas separadas:
 * o portal tem permissão própria (gerenciar acessos) e não fica mais no fim de Integrações.
 */
export function abasConfiguracoes({ smtp, whatsapp, portal, admin }: PermissoesAbasConfiguracoes): {
  integracoes: boolean;
  portal: boolean;
  admin: boolean;
  inicial: AbaConfiguracoesId;
} {
  const integracoes = smtp || whatsapp;

  return {
    integracoes,
    portal,
    admin,
    inicial: "geral",
  };
}
