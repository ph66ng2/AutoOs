import { cn } from "@/lib/utils";
import { AVATAR_SHAPES, isAvatarShape } from "@/lib/profile-appearance";
import { GeometricAvatar } from "@/components/perfil/GeometricAvatar";

const SIZES = {
  sm: { box: "h-8 w-8 rounded-lg" },
  md: { box: "h-10 w-10 rounded-xl" },
  lg: { box: "h-[72px] w-[72px] rounded-[20px]" },
  xl: { box: "h-[104px] w-[104px] rounded-[28px]" },
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
  /** Perfil ainda não ativado: moldura tracejada no lugar da forma. */
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
  const shape = isAvatarShape(icon) ? icon : AVATAR_SHAPES[0].id;
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 overflow-hidden", sizing.box, className)}>
      <GeometricAvatar shape={shape} color={color} className="h-full w-full" />
    </span>
  );
}
