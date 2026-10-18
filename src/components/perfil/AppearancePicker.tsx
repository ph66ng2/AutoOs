import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { AVATAR_COLORS, AVATAR_ICONS, type ProfileTheme } from "@/lib/profile-appearance";

/** Seletores de cor, ícone e tema usados no primeiro acesso e em Perfil › Personalizar. */
export function AppearancePicker({
  color,
  icon,
  theme,
  onColorChange,
  onIconChange,
  onThemeChange,
  disabled = false,
}: {
  color: string;
  icon: string;
  theme: ProfileTheme;
  onColorChange: (color: string) => void;
  onIconChange: (icon: string) => void;
  onThemeChange: (theme: ProfileTheme) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-6">
      <fieldset disabled={disabled}>
        <legend className="mb-3 text-sm font-medium">Cor</legend>
        <div className="flex flex-wrap gap-2.5">
          {AVATAR_COLORS.map((item) => {
            const selected = item.hex === color;
            return (
              <button
                key={item.hex}
                type="button"
                aria-label={item.label}
                aria-pressed={selected}
                onClick={() => onColorChange(item.hex)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "ring-2",
                )}
                style={{ backgroundColor: item.hex, ["--tw-ring-color" as string]: item.hex }}
              >
                {selected && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="mb-3 text-sm font-medium">Ícone</legend>
        <div className="flex flex-wrap gap-2.5">
          {AVATAR_ICONS.map(({ id, label, Icon }) => {
            const selected = id === icon;
            return (
              <button
                key={id}
                type="button"
                aria-label={label}
                aria-pressed={selected}
                onClick={() => onIconChange(id)}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl ring-offset-2 ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "text-white ring-2" : "bg-muted text-muted-foreground hover:text-foreground",
                )}
                style={selected ? { backgroundColor: color, ["--tw-ring-color" as string]: color } : undefined}
              >
                <Icon className="h-5 w-5" strokeWidth={1.8} />
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="mb-3 text-sm font-medium">Tema</legend>
        <div className="grid max-w-md grid-cols-2 gap-3">
          <ThemeOption label="Claro" selected={theme === "light"} onSelect={() => onThemeChange("light")}>
            <span className="flex h-20 overflow-hidden rounded-lg bg-[#F8F9FB]">
              <span className="w-8 bg-[#1B2232]" />
              <span className="flex flex-1 flex-col gap-1.5 p-2.5">
                <span className="h-2 w-3/5 rounded bg-[#E1E5EB]" />
                <span className="h-7 rounded-md border border-[#E1E5EB] bg-white" />
              </span>
            </span>
          </ThemeOption>
          <ThemeOption label="Escuro" selected={theme === "dark"} onSelect={() => onThemeChange("dark")}>
            <span className="flex h-20 overflow-hidden rounded-lg bg-[#0B0E13]">
              <span className="w-8 border-r border-[#1A2130] bg-[#0F131B]" />
              <span className="flex flex-1 flex-col gap-1.5 p-2.5">
                <span className="h-2 w-3/5 rounded bg-[#20293B]" />
                <span className="h-7 rounded-md border border-[#20293B] bg-[#11151D]" />
              </span>
            </span>
          </ThemeOption>
        </div>
      </fieldset>
    </div>
  );
}

function ThemeOption({
  label,
  selected,
  onSelect,
  children,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className="group flex flex-col gap-2 text-left focus-visible:outline-none"
    >
      <span
        className={cn(
          "block rounded-xl p-0.5 ring-offset-2 ring-offset-background transition group-focus-visible:ring-2 group-focus-visible:ring-ring",
          selected ? "ring-2 ring-primary" : "ring-1 ring-border",
        )}
      >
        {children}
      </span>
      <span className="text-sm">{label}</span>
    </button>
  );
}
