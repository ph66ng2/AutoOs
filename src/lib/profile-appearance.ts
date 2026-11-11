import type { SecurityProfile } from "@/types";

/**
 * Avatares geométricos (desenho em `components/perfil/GeometricAvatar.tsx`). Também aceitos
 * pelo backend em `AVATAR_ICONES`. A migration 0046 converte os ícones antigos por ID.
 */
export const AVATAR_SHAPES: { id: string; label: string }[] = [
  { id: "shape-orb", label: "Círculo" },
  { id: "shape-square", label: "Quadrado" },
  { id: "shape-peak", label: "Triângulo" },
  { id: "shape-pill", label: "Cápsula" },
  { id: "shape-bean", label: "Feijão" },
  { id: "shape-hex", label: "Hexágono" },
  { id: "shape-arch", label: "Arco" },
  { id: "shape-cloud", label: "Nuvem" },
  { id: "shape-block", label: "Bloco" },
];

export function isAvatarShape(id: string): boolean {
  return AVATAR_SHAPES.some((item) => item.id === id);
}

/** Mesma lista aceita pelo backend (`AVATAR_CORES` em auth.rs). Todas com contraste para ícone branco. */
export const AVATAR_COLORS: { hex: string; label: string }[] = [
  { hex: "#2563EB", label: "Azul" },
  { hex: "#4F46E5", label: "Índigo" },
  { hex: "#7C3AED", label: "Violeta" },
  { hex: "#C026D3", label: "Magenta" },
  { hex: "#E11D48", label: "Rosa" },
  { hex: "#EA580C", label: "Laranja" },
  { hex: "#B45309", label: "Âmbar" },
  { hex: "#15803D", label: "Verde" },
  { hex: "#0F766E", label: "Petróleo" },
  { hex: "#475569", label: "Grafite" },
];

export type ProfileTheme = "light" | "dark";

export interface ProfileAppearance {
  icon: string;
  color: string;
  theme: ProfileTheme;
}

/**
 * Perfis que ainda não escolheram o visual recebem um padrão estável pelo id,
 * para que a tela de perfis não mostre todos iguais.
 */
export function profileAppearance(profile: Pick<SecurityProfile, "id" | "avatar_icone" | "avatar_cor" | "tema">): ProfileAppearance {
  const fallbackIndex = Math.abs(profile.id);
  return {
    icon: isAvatarShape(profile.avatar_icone ?? "")
      ? profile.avatar_icone!
      : AVATAR_SHAPES[fallbackIndex % AVATAR_SHAPES.length].id,
    color: AVATAR_COLORS.some((item) => item.hex === profile.avatar_cor)
      ? profile.avatar_cor!
      : AVATAR_COLORS[fallbackIndex % AVATAR_COLORS.length].hex,
    theme: profile.tema === "dark" ? "dark" : "light",
  };
}

/** Perfil que exige PIN e ainda não foi ativado neste computador. */
export function needsFirstAccessHere(profile: Pick<SecurityProfile, "pin_required" | "pin_configured">): boolean {
  return Boolean(profile.pin_required) && !profile.pin_configured;
}
