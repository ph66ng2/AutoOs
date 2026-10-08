import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = process.env.AUTOOS_MIGRATION_DATABASE_URL;
const usage = "Uso: AUTOOS_MIGRATION_DATABASE_URL=<PostgreSQL URL> node scripts/reconcile-sqlx-master-0023.mjs [--apply]";
if (!source) {
  console.error(`AUTOOS_MIGRATION_DATABASE_URL não configurada.\n${usage}`);
  process.exit(2);
}
let url;
let databaseName;
let databaseUser;
let databasePassword;
try {
  url = new URL(source);
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !url.hostname || !url.username || !url.pathname.slice(1)) throw new Error("invalid PostgreSQL URL");
  databaseName = decodeURIComponent(url.pathname.slice(1));
  databaseUser = decodeURIComponent(url.username);
  databasePassword = decodeURIComponent(url.password);
  if (!databaseName || !databaseUser) throw new Error("incomplete PostgreSQL URL");
} catch {
  console.error(`AUTOOS_MIGRATION_DATABASE_URL deve ser uma URL PostgreSQL válida.\n${usage}`);
  process.exit(2);
}
const canonicalFile = fileURLToPath(new URL("../src-tauri/migrations/0023_clientes_documento_unico_ativo.sql", import.meta.url));
const canonical = createHash("sha384").update(readFileSync(canonicalFile)).digest("hex");
const master = "d1b63adb27c7decb76facd852fb631a08f35cf7ae1a5282650edbccd76851b1d0b62c4d3f30f6eefe78267740ddd2342";
const env = {
  ...process.env,
  PGHOST: url.hostname.replace(/^\[|\]$/g, ""),
  PGPORT: url.port || "5432",
  PGDATABASE: databaseName,
  PGUSER: databaseUser,
  PGPASSWORD: databasePassword,
  PGCONNECT_TIMEOUT: "10",
};
delete env.PGHOSTADDR;
delete env.PGSERVICE;
if (url.searchParams.has("sslmode")) env.PGSSLMODE = url.searchParams.get("sslmode");

// A transação verifica a variante conhecida e os dois índices equivalentes
// antes de alterar somente o checksum da versão 23.
const guard = `
DO $$
DECLARE current_checksum text;
BEGIN
  SELECT encode(checksum, 'hex') INTO current_checksum
    FROM public._sqlx_migrations WHERE version = 23 AND success = true FOR UPDATE;
  IF current_checksum IS DISTINCT FROM '${master}'
     AND current_checksum IS DISTINCT FROM '${canonical}' THEN
    RAISE EXCEPTION '0023 não corresponde à variante conhecida da master';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.clientes'::regclass
       AND conname IN ('clientes_documento_key', 'clientes_cpf_cnpj_key')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'clientes'
       AND indexname = 'ux_clientes_documento_ativo'
       AND indexdef LIKE '%UNIQUE INDEX%ON public.clientes USING btree (documento)%'
       AND indexdef LIKE '%ativo = true%' AND indexdef LIKE '%documento IS NOT NULL%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'clientes'
       AND indexname = 'ux_clientes_cpf_cnpj_ativo'
       AND indexdef LIKE '%UNIQUE INDEX%ON public.clientes USING btree (cpf_cnpj)%'
       AND indexdef LIKE '%ativo = true%' AND indexdef LIKE '%cpf_cnpj IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION 'Schema da 0023 não corresponde ao SQL equivalente esperado';
  END IF;
END $$;`;
const apply = process.argv.includes("--apply");
const sql = `BEGIN; ${guard} ${apply ? `UPDATE public._sqlx_migrations SET checksum = decode('${canonical}', 'hex') WHERE version = 23 AND encode(checksum, 'hex') = '${master}';` : ""} COMMIT;`;
function runPsql(query) {
  return execFileSync("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query], {
    env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000,
  }).trim();
}
try {
  const current = runPsql("SELECT encode(checksum, 'hex') FROM public._sqlx_migrations WHERE version = 23 AND success = true");
  runPsql(sql);
  if (current === canonical) {
    console.log("SQLX_0023_ALREADY_RECONCILED: checksum e schema canônicos já confirmados.");
  } else {
    console.log(apply
      ? "SQLX_0023_RECONCILED: checksum da variante master atualizado."
      : "SQLX_0023_READY: schema e checksum da master confirmados. Use --apply para reconciliar.");
  }
} catch (error) {
  console.error(`SQLX_0023_BLOCKED: ${error.stderr?.toString().trim() || error.message}`);
  process.exit(1);
}
