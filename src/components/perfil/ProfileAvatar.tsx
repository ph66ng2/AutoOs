import { cn } from "@/lib/utils";
import { avatarIcon } from "@/lib/profile-appearance";

const SIZES = {
  sm: { box: "h-8 w-8 rounded-lg", icon: "h-4 w-4" },
  md: { box: "h-10 w-10 rounded-xl", icon: "h-5 w-5" },
  lg: { box: "h-[72px] w-[72px] rounded-[20px]", icon: "h-8 w-8" },
  xl: { box: "h-[104px] w-[104px] rounded-[28px]", icon: "h-11 w-11" },
} as const;

export function ProfileAvatar({
  icon,
  color,
  size = "md",
  pending = false,
  className,
}: {
  icon: string;
  color: string;
  size?: keyof typeof SIZES;
  /** Perfil ainda não ativado: moldura tracejada no lugar do ícone. */
  pending?: boolean;
  className?: string;
}) {
  const sizing = SIZES[size];
  if (pending) {
    return (
      <span
        aria-hidden="true"
        className={cn("inline-flex shrink-0 border-2 border-dashed border-muted-foreground/40", sizing.box, className)}
      />
    );
  }
  const Icon = avatarIcon(icon);
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center text-white", sizing.box, className)}
      style={{ backgroundColor: color }}
    >
      <Icon className={sizing.icon} strokeWidth={1.8} />
    </span>
  );
}
