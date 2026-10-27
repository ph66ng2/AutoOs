export type AbaConfiguracoesId = "smtp" | "infra" | "seguranca" | "observabilidade";

export type PermissoesAbasConfiguracoes = {
  smtp: boolean;
  whatsapp: boolean;
  portal: boolean;
  admin: boolean;
};

export function abasConfiguracoes({ smtp, whatsapp, portal, admin }: PermissoesAbasConfiguracoes): {
  integracoes: boolean;
  admin: boolean;
  inicial: AbaConfiguracoesId;
} {
  const integracoes = smtp || whatsapp || portal;

  return {
    integracoes,
    admin,
    inicial: integracoes ? "smtp" : "infra",
  };
}
