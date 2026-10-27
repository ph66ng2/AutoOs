/**
 * Prepara o Postgres local descartável usado pelos screenshots de UI.
 *
 * Apaga o schema public de test_autoos, aplica as migrations SQL do repositório,
 * insere dados sintéticos e grava e2e/fixtures/ui-screenshot-seed.json.
 *
 * Recusa qualquer host que não seja local e qualquer banco que não seja test_autoos.
 * Não é chamado pelo workflow de migrations de produção.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.DATABASE_URL ?? "";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertDisposableDatabase(url) {
  if (!url) {
    fail("DATABASE_URL é obrigatória. Use postgres://test_user:test_password@127.0.0.1:5432/test_autoos");
  }
  if (process.env.AUTOOS_MIGRATION_MODE === "production") {
    fail("Recusado: AUTOOS_MIGRATION_MODE=production. Screenshots não aplicam migrations de produção.");
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail("DATABASE_URL inválida.");
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    fail(`Recusado: screenshots só aceitam PostgreSQL local. Host recebido: ${host}`);
  }
  if (database !== "test_autoos") {
    fail(`Recusado: o banco precisa ser test_autoos. Recebido: ${database || "(vazio)"}`);
  }

  const lowered = url.toLowerCase();
  for (const banned of ["supabase", "pooler", "bmitag", "production"]) {
    if (lowered.includes(banned)) {
      fail(`Recusado: DATABASE_URL contém "${banned}".`);
    }
  }
}

function psql(args, input) {
  return execFileSync("psql", [databaseUrl, "--no-psqlrc", "--set", "ON_ERROR_STOP=1", ...args], {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

assertDisposableDatabase(databaseUrl);

try {
  execFileSync("psql", ["--version"], { stdio: "ignore" });
} catch {
  fail("psql não está no PATH. Instale o cliente PostgreSQL antes de preparar os screenshots.");
}

console.log("Recriando o schema public de test_autoos (banco local descartável).");
psql(
  ["--quiet", "--file", "-"],
  `
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO PUBLIC;
  `,
);

const migrationsDir = resolve(root, "src-tauri/migrations");
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (migrations.length === 0) {
  fail(`Nenhuma migration em ${migrationsDir}.`);
}

for (const name of migrations) {
  process.stdout.write(`migration ${name}\n`);
  psql(["--quiet", "--file", resolve(migrationsDir, name)]);
}

console.log("Inserindo dados sintéticos de screenshot.");
psql(["--quiet", "--file", resolve(root, "scripts/seed-ui-screenshots.sql")]);

const json = psql(
  ["--tuples-only", "--no-align", "--file", resolve(root, "scripts/export-ui-screenshot-seed.sql")],
).trim();

let seed;
try {
  seed = JSON.parse(json);
} catch {
  fail(`Exportação do fixture não é JSON válido:\n${json.slice(0, 500)}`);
}

if (seed.marker !== "CI-UI-SCREENSHOT") fail("Fixture sem o marcador CI-UI-SCREENSHOT.");
if (!seed.empresa?.id) fail("Empresa sintética ausente.");
if (!Array.isArray(seed.profiles) || seed.profiles.length < 3) fail("Perfis sintéticos ausentes.");
if (!Array.isArray(seed.clientes) || seed.clientes.length < 2) fail("Clientes sintéticos ausentes.");
if (!Array.isArray(seed.equipamentos) || seed.equipamentos.length < 3) fail("Equipamentos sintéticos ausentes.");
if (!Array.isArray(seed.produtos) || seed.produtos.length < 2) fail("Produtos sintéticos ausentes.");
if (seed.portal?.portalAtivo !== true || seed.portal?.respostasAtivas !== true) {
  fail("Configuração sintética do portal ausente.");
}
if (seed.portal?.contato?.nomeExibicao !== "Recepção Sintética CI") {
  fail("Contato sintético do portal ausente.");
}
if (seed.database_name !== "test_autoos") fail("O fixture não saiu de test_autoos.");

const latestVersion = Number(migrations.at(-1)?.slice(0, 4));
seed.schema = {
  database_name: "test_autoos",
  schema_name: "public",
  applied_count: migrations.length,
  known_count: migrations.length,
  pending_count: 0,
  latest_applied_version: latestVersion,
  latest_known_version: latestVersion,
  migrations: [],
};
delete seed.database_name;

const fixtureDir = resolve(root, "e2e/fixtures");
mkdirSync(fixtureDir, { recursive: true });
const fixturePath = resolve(fixtureDir, "ui-screenshot-seed.json");
writeFileSync(fixturePath, `${JSON.stringify(seed, null, 2)}\n`);
console.log(`CI_UI_SCREENSHOT_DB_OK migrations=${migrations.length} fixture=${fixturePath}`);
