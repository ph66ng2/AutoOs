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
                  "flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-[box-shadow,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
                  "flex h-10 w-10 items-center justify-center rounded-xl ring-offset-2 ring-offset-background transition-[box-shadow,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
          <ThemeOption label="Claro" scope="light" selected={theme === "light"} onSelect={() => onThemeChange("light")} />
          <ThemeOption label="Escuro" scope="dark" selected={theme === "dark"} onSelect={() => onThemeChange("dark")} />
        </div>
      </fieldset>
    </div>
  );
}

function ThemeOption({
  label,
  scope,
  selected,
  onSelect,
}: {
  label: string;
  scope: "light" | "dark";
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className="group flex h-12 items-center gap-3 rounded-xl text-left transition-[box-shadow,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:active:scale-100 focus-visible:outline-none"
    >
      <span aria-hidden="true" className={scope}>
        <span
          className={cn(
            "flex h-7 w-10 overflow-hidden rounded-md bg-background p-0.5 ring-offset-2 ring-offset-background transition-[box-shadow] duration-150 ease-out group-focus-visible:ring-2 group-focus-visible:ring-ring",
            selected ? "ring-2 ring-primary" : "ring-1 ring-border",
          )}
        >
          <span className="w-2.5 rounded-sm bg-sidebar" />
          <span className="flex flex-1 items-start p-0.5 pl-1">
            <span className="h-full w-full rounded-sm bg-card" />
          </span>
        </span>
      </span>
      <span className="text-sm">{label}</span>
    </button>
  );
}
