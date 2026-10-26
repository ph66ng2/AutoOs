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
 * Colunas `TIMESTAMP` (sem fuso) do PostgreSQL chegam como texto "2026-10-18 21:35:12.345678" e o
 * banco as grava em UTC. `new Date()` lê esse texto como horário do computador, o que desloca
 * o instante em algumas horas; aqui ele é lido como UTC. Textos que já trazem fuso ficam como são.
 * Para `TIMESTAMPTZ` (com deslocamento, ex.: "+00"), use `parseTimestampPostgres`.
 */
export function parseDbTimestampUtc(value?: string | null): Date | null {
  if (!value) return null;
  const iso = value.trim().replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
  const hasZone = /T.*(Z|[+-]\d{2}(:?\d{2})?)$/.test(iso);
  const parsed = new Date(hasZone ? iso : `${iso}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
