/** Mesma regra do backend (`validar_email_profissional`): obrigatório e no formato nome@dominio.tld. */
export function erroEmailProfissional(valor: string): string | null {
  const email = valor.trim();
  if (!email) return "Informe o e-mail profissional.";
  if (/\s/.test(email) || !/^[^@]+@[^@]+\.[^@]+$/.test(email) || email.endsWith(".")) return "E-mail profissional inválido.";
  return null;
}
