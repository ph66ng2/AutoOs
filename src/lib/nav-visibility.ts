import type { SensitivePermission } from "@/types";

/**
 * Decide se um item da sidebar aparece. Com a sessão bloqueada o backend devolve
 * `permissions` vazio, então a lista vazia ainda não significa "sem permissão":
 * itens marcados com `showWhenLocked` ficam visíveis e a própria rota pede o PIN.
 */
export function navItemVisible(
  item: { permission?: SensitivePermission | SensitivePermission[]; showWhenLocked?: boolean },
  status: { unlocked: boolean; permissions: SensitivePermission[] } | null | undefined,
): boolean {
  if (!item.permission) {
    return true;
  }

  if (item.showWhenLocked && !status?.unlocked) {
    return true;
  }

  const permissions = status?.permissions ?? [];
  return Array.isArray(item.permission)
    ? item.permission.some((permission) => permissions.includes(permission))
    : permissions.includes(item.permission);
}
