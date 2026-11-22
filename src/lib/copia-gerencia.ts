/**
 * Se os e-mails automáticos da empresa da sessão levam a cópia fixa da gerência (`CC_GERENCIA`,
 * da BMITAG). Vem do backend (`copia_gerencia_da_empresa`): sim quando a instalação tem uma só
 * empresa ativa ou quando a sessão é da empresa vinculada ao canal de suporte. Recarregado pelo
 * provedor de sessão junto com os técnicos; enquanto não se sabe (sem sessão, bloqueada, troca de
 * perfil, falha), a cópia não vai: nunca mandar a cópia da BMITAG para e-mail de outra empresa.
 */
let copiaGerencia: boolean | null = null;

export function definirCopiaGerencia(valor: boolean | null | undefined) {
  copiaGerencia = typeof valor === "boolean" ? valor : null;
}

/** true só quando o backend confirmou para a empresa da sessão atual. */
export function copiaGerenciaPermitida(): boolean {
  return copiaGerencia === true;
}
