/** Utilitários para datas sem horário armazenadas como YYYY-MM-DD. */
export function todayLocalIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Formata uma data sem deixá-la passar pelo fuso horário UTC. */
export function formatDatePtBr(value?: string | null, fallback = "—"): string {
  if (!value) return fallback;
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toLocaleDateString("pt-BR");
}

/**
 * Formata um instante para o fuso operacional da AutoOS (Salvador, Bahia).
 * O fuso explícito evita que histórico e documentos mudem de horário conforme
 * a configuração regional do computador que abriu o sistema.
 */
export function formatDateTimeSalvador(value?: string | Date | null, fallback = "—"): string {
  if (!value) return fallback;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;

  return parsed.toLocaleString("pt-BR", {
    timeZone: "America/Bahia",
  });
}

/**
 * Lê o instante que o PostgreSQL devolve como texto ("2026-10-20 14:03:05.123456+00").
 * Normaliza para ISO 8601 antes de criar a data, porque nem todo WebView aceita o espaço
 * no lugar do "T" nem o deslocamento "+00" sem minutos.
 */
export function parseTimestampPostgres(value: string): Date {
  const iso = value
    .trim()
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d{2})$/, "$1:00");
  return new Date(iso);
}

/** Converte uma data sem horário para meio-dia local, seguro para ordenação. */
export function dateOnlyToLocalDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
}
