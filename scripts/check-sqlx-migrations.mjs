import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationDir = fileURLToPath(new URL("../src-tauri/migrations/", import.meta.url));
const files = readdirSync(migrationDir).filter((file) => file.endsWith(".sql")).sort();
const byVersion = new Map();
const errors = [];

for (const file of files) {
  const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(file);
  if (!match) {
    errors.push(`Nome inválido: ${file}`);
    continue;
  }

  const version = Number(match[1]);
  if (byVersion.has(version)) {
    errors.push(`Versão ${match[1]} duplicada: ${byVersion.get(version)} e ${file}`);
  } else {
    byVersion.set(version, file);
  }
}

for (let version = 1; version <= Math.max(0, ...byVersion.keys()); version += 1) {
  if (!byVersion.has(version)) {
    errors.push(`Versão ${String(version).padStart(4, "0")} ausente`);
  }
}

if (errors.length > 0) {
  console.error("Sequência de migrations SQLx inválida:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`SQLX_MIGRATIONS_OK count=${byVersion.size}`);
}
