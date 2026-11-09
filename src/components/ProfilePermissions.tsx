import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AVISO_COMPATIBILIDADE_056,
  COMPATIBILIDADE_056_ATIVA,
  permissoesNovas,
} from "@/lib/compatibilidade-056";
import { PERMISSION_DETAILS } from "@/lib/profile-presets";
import { SENSITIVE_PERMISSIONS, type SensitivePermission } from "@/types";

export function ProfilePermissions({
  permissions,
  onChange,
  disabled = false,
  role = "CUSTOM",
  travaAtiva = COMPATIBILIDADE_056_ATIVA,
}: {
  permissions: SensitivePermission[];
  onChange: (permissions: SensitivePermission[]) => void;
  disabled?: boolean;
  role?: string;
  travaAtiva?: boolean;
}) {
  const restrito = travaAtiva && role !== "ADMIN";
  const novas = permissoesNovas(Object.values(SENSITIVE_PERMISSIONS));
  const oferecidas = Object.values(SENSITIVE_PERMISSIONS).filter(
    (permission) =>
      !restrito || !novas.includes(permission) || permissions.includes(permission),
  );
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-3 text-sm font-medium">
        Permissões adicionais
      </legend>
      <p className="text-sm text-muted-foreground">
        Sem liberações adicionais, a pessoa mantém apenas o acesso operacional
        básico. As restrições de cada módulo continuam valendo.
      </p>
      {restrito && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {AVISO_COMPATIBILIDADE_056}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {oferecidas.map((permission) => {
          const detail = PERMISSION_DETAILS[permission];
          const checked = permissions.includes(permission);
          return (
            <label
              key={permission}
              className={`flex items-start gap-3 rounded-xl border p-4 ${checked ? "border-cyan-600/40 bg-cyan-500/5" : "bg-background"} ${disabled ? "opacity-70" : "cursor-pointer"}`}
            >
              <Checkbox
                aria-label={detail.title}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(value) =>
                  onChange(
                    value
                      ? [...permissions, permission]
                      : permissions.filter((item) => item !== permission),
                  )
                }
              />
              <span className="space-y-1">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {detail.title}
                  {detail.critical && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 text-amber-700 dark:text-amber-400"
                    >
                      Sensível
                    </Badge>
                  )}
                </span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  {detail.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
