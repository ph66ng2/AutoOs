export function securityRoleLabel(role?: string | null): string {
  if (!role) return "Perfil não identificado";
  if (role === "ADMIN") return "Administrador";
  if (role === "CUSTOM") return "Personalizado";
  if (role === "ATENDENTE") return "Atendente";
  if (role === "TECNICO") return "Técnico";
  return role.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
