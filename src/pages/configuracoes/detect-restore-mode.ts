export type RestoreMode = "pg_restore" | "psql" | null;

export function detectRestoreMode(filePath: string): RestoreMode {
  const normalized = filePath.trim().toLowerCase();
  if (normalized.endsWith(".dump")) {
    return "pg_restore";
  }
  if (normalized.endsWith(".sql")) {
    return "psql";
  }
  return null;
}
