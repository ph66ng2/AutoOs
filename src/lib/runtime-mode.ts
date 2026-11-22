export type AutoOsRuntimeMode = "internal" | "saas";

export function resolveRuntimeMode(value: string | undefined): AutoOsRuntimeMode {
  return value === "saas" ? "saas" : "internal";
}

export const AUTOOS_RUNTIME_MODE = resolveRuntimeMode(import.meta.env.MODE);
export const IS_SAAS_BUILD = AUTOOS_RUNTIME_MODE === "saas";
