import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.AUTOOS_MIGRATION_DATABASE_URL;
const minimumAppliedVersion = 23;
if (!databaseUrl) {
  console.error("Defina AUTOOS_MIGRATION_DATABASE_URL para conferir o histórico antes de migrar.");
  process.exit(2);
}

let url;
try {
  url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !url.hostname || !url.username || !url.pathname.slice(1)) {
    throw new Error("URL incompleta");
  }
} catch {
  console.error("AUTOOS_MIGRATION_DATABASE_URL deve ser uma URL PostgreSQL válida.");
  process.exit(2);
}

const migrationDir = fileURLToPath(new URL("../src-tauri/migrations/", import.meta.url));
const checksums = new Map(
  readdirSync(migrationDir)
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
    .map((file) => [Number(file.slice(0, 4)), {
      file,
      checksum: createHash("sha384").update(readFileSync(join(migrationDir, file))).digest("hex"),
    }]),
);

// Checksum dos arquivos antigos da feature. Apenas para diagnóstico: este
// verificador nunca altera _sqlx_migrations nem tenta reparar o banco.
const oldFeatureChecksums = new Map([
  [16, "fe5ddecba615f65548ea499039d1a9d2ad8970da83a75cf962723309707129d3e262d65c4455be8c5595fc932b3378b7"],
  [17, "ea58a93fe07810407411f0d4807c48d77492a94ada648d25cd6c282cdef54f8e887939c30b905b1d3bfdd5060e1df29c"],
  [20, "646e0290138f493dfd97b515d0efa525187b0dcee760753ab2db03967bf95f3de9bd6a4d2e9013d4463f43a2b847510b"],
  [21, "4ba9262d14525738d628cad84dba534b2e6653a7a9483d3e06e8da394bf475d4d6d47fe1eb0fb37ea947b0089aea84a4"],
  [22, "9aca5a749bdb63b8ead286f76cc2fc196a86c03928155afa88d380b47ce33d6ef72349457b88a945938b28b9fc4dd42e"],
]);
const equivalentMasterChecksums = new Map([
  [23, "d1b63adb27c7decb76facd852fb631a08f35cf7ae1a5282650edbccd76851b1d0b62c4d3f30f6eefe78267740ddd2342"],
]);

const env = {
  ...process.env,
  PGHOST: url.hostname.replace(/^\[|\]$/g, ""),
  PGPORT: url.port || "5432",
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGCONNECT_TIMEOUT: "10",
};
delete env.PGHOSTADDR;
delete env.PGSERVICE;
if (url.searchParams.has("sslmode")) env.PGSSLMODE = url.searchParams.get("sslmode");

function query(sql) {
  try {
    return execFileSync("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15000,
    }).trim();
  } catch (error) {
    console.error(`Falha ao consultar o histórico SQLx: ${error.stderr?.toString().trim() || error.message}`);
    process.exit(2);
  }
}

if (query("SELECT to_regclass('public._sqlx_migrations') IS NOT NULL") === "f") {
  console.error("SQLX_DATABASE_HISTORY_INCOMPATIBLE: tabela _sqlx_migrations ausente.");
  process.exit(1);
}

const rows = query("SELECT version, success, encode(checksum, 'hex') FROM public._sqlx_migrations ORDER BY version");
const errors = [];
const applied = new Set();
let highestApplied = 0;
let count = 0;
for (const row of rows.split("\n").filter(Boolean)) {
  const [rawVersion, success, checksum] = row.split("|");
  const version = Number(rawVersion);
  const expected = checksums.get(version);
  applied.add(version);
  highestApplied = Math.max(highestApplied, version);
  count += 1;
  if (success !== "t") errors.push(`Versão ${rawVersion} está registrada como falha.`);
  if (!expected) {
    errors.push(`Versão ${rawVersion} aplicada, mas ausente do repositório.`);
  } else if (checksum !== expected.checksum) {
    const legacy = oldFeatureChecksums.get(version) === checksum
      ? " (histórico antigo da feature)"
      : equivalentMasterChecksums.get(version) === checksum
        ? " (variante da master com SQL equivalente; requer reconciliação auditada do checksum)"
        : "";
    errors.push(`Versão ${rawVersion}: checksum incompatível com ${expected.file}${legacy}.`);
  }
}
for (let version = 1; version <= Math.min(highestApplied, Math.max(...checksums.keys())); version += 1) {
  if (!applied.has(version)) {
    errors.push(`Versão ${String(version).padStart(4, "0")} ausente no histórico aplicado.`);
  }
}
if (highestApplied < minimumAppliedVersion) {
  errors.push(`Histórico SQLx incompleto: exigidas 0001–${String(minimumAppliedVersion).padStart(4, "0")}; última versão registrada ${String(highestApplied).padStart(4, "0")}.`);
}

if (errors.length) {
  console.error("SQLX_DATABASE_HISTORY_INCOMPATIBLE: migração bloqueada antes de qualquer alteração.");
  for (const error of errors) console.error(`- ${error}`);
  if (highestApplied < minimumAppliedVersion) {
    console.error("Audite as versões ausentes antes de migrar. O reconciliador da 0023 não preenche o histórico anterior.");
  } else {
    console.error("Para a variante 0023 da master, use scripts/reconcile-sqlx-master-0023.mjs para conferir o schema e --apply para reconciliar após backup. Outras divergências exigem auditoria manual.");
  }
  process.exit(1);
}

console.log(`SQLX_DATABASE_HISTORY_OK applied=${count}`);
