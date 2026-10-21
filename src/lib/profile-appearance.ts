import {
  Coffee,
  Flame,
  Gamepad2,
  Headphones,
  Heart,
  Leaf,
  Music,
  Printer,
  Rocket,
  Star,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { SecurityProfile } from "@/types";

/** Mesma lista aceita pelo backend (`AVATAR_ICONES` em auth.rs). Sem upload de imagem. */
export const AVATAR_ICONS: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: "headphones", label: "Fone", Icon: Headphones },
  { id: "wrench", label: "Chave", Icon: Wrench },
  { id: "printer", label: "Impressora", Icon: Printer },
  { id: "coffee", label: "Café", Icon: Coffee },
  { id: "star", label: "Estrela", Icon: Star },
  { id: "zap", label: "Raio", Icon: Zap },
  { id: "leaf", label: "Folha", Icon: Leaf },
  { id: "flame", label: "Chama", Icon: Flame },
  { id: "rocket", label: "Foguete", Icon: Rocket },
  { id: "heart", label: "Coração", Icon: Heart },
  { id: "music", label: "Música", Icon: Music },
  { id: "gamepad-2", label: "Controle", Icon: Gamepad2 },
];

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
    icon: AVATAR_ICONS.some((item) => item.id === profile.avatar_icone)
      ? profile.avatar_icone!
      : AVATAR_ICONS[fallbackIndex % AVATAR_ICONS.length].id,
    color: AVATAR_COLORS.some((item) => item.hex === profile.avatar_cor)
      ? profile.avatar_cor!
      : AVATAR_COLORS[fallbackIndex % AVATAR_COLORS.length].hex,
    theme: profile.tema === "dark" ? "dark" : "light",
  };
}

export function avatarIcon(id: string): LucideIcon {
  return (AVATAR_ICONS.find((item) => item.id === id) ?? AVATAR_ICONS[0]).Icon;
}

/** Perfil que exige PIN e ainda não foi ativado neste computador. */
export function needsFirstAccessHere(profile: Pick<SecurityProfile, "pin_required" | "pin_configured">): boolean {
  return Boolean(profile.pin_required) && !profile.pin_configured;
}
