// Desligar (false) quando todos os PCs estiverem na 0.6.0, junto com a migration
// que concede PREPARE_QUOTES a Técnico/Financeiro. Na 0.5.6, perfil que não é
// Administrador sem permissão, ou com permissão fora destas 7, trava o login.
export const COMPATIBILIDADE_056_ATIVA = true;

export const PERMISSOES_056: readonly string[] = [
  "CONFIG_SMTP",
  "CONFIG_WHATSAPP",
  "DELETE_RECORDS",
  "FINANCIAL_ACTIONS",
  "STOCK_CONTROL",
  "MANAGE_PROFILES",
  "VIEW_EXPENSES",
];

export const AVISO_COMPATIBILIDADE_056 =
  "Algumas opções ficam indisponíveis até todos os computadores atualizarem para a 0.6.0.";
export const MOTIVO_SEM_PERMISSAO_056 =
  "Escolha ao menos uma permissão: há computadores na versão 0.5.6.";
export const MENSAGEM_TRAVA_056 =
  "Ainda há computadores na versão 0.5.6. Até todos atualizarem, perfis que não são Administrador precisam de ao menos uma permissão e não podem usar as permissões novas (Elaborar e enviar orçamentos, Links e Portal do Cliente).";

export function permissoesNovas(perms: readonly string[]): string[] {
  return perms.filter((p) => !PERMISSOES_056.includes(p));
}

export function perfilCompativel056(
  role: string,
  perms: readonly string[],
  ativa: boolean = COMPATIBILIDADE_056_ATIVA,
): { ok: boolean; motivo?: string } {
  if (!ativa || role === "ADMIN") return { ok: true };
  if (perms.length === 0) return { ok: false, motivo: MOTIVO_SEM_PERMISSAO_056 };
  if (permissoesNovas(perms).length > 0) {
    return {
      ok: false,
      motivo: "Há computadores na versão 0.5.6: remova as permissões novas.",
    };
  }
  return { ok: true };
}
