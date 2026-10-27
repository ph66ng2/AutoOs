import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../normalize-seed-empresa-id.sh", import.meta.url));
const workflow = fileURLToPath(new URL("../../.github/workflows/apply-estoque-seed.yml", import.meta.url));

function run(value) {
  try {
    const stdout = execFileSync("bash", [script, value], { encoding: "utf8" });
    return { ok: true, stdout };
  } catch (error) {
    return {
      ok: false,
      status: error.status,
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? "",
    };
  }
}

test("empresa_id aceita inteiro com espaços só nas pontas", () => {
  assert.deepEqual(run(" 2 "), { ok: true, stdout: "2" });
  assert.deepEqual(run("\t12\t"), { ok: true, stdout: "12" });
  assert.deepEqual(run(" 12 "), { ok: true, stdout: "12" });
  assert.deepEqual(run("7"), { ok: true, stdout: "7" });
  assert.deepEqual(run(""), { ok: true, stdout: "" });
  assert.deepEqual(run("   "), { ok: true, stdout: "" });
  assert.deepEqual(run("\n"), { ok: true, stdout: "" });
});

test("empresa_id recusa espaço ou quebra internos em vez de juntar os dígitos", () => {
  for (const value of ["1 2", "2\n3", "1\t2", "2\r3", "12a", " 1 2 ", "2 3\n"]) {
    const result = run(value);
    assert.equal(result.ok, false, value);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /sem espaços internos/);
  }
});

test("o workflow usa o normalizador e não apaga espaço interno", () => {
  const source = readFileSync(workflow, "utf8");
  assert.equal(source.includes("//[[:space:]]/"), false);
  assert.equal(source.split("normalize-seed-empresa-id.sh").length - 1, 3);
});

test("a conferência pós-seed conta os códigos só na empresa resolvida", () => {
  const source = readFileSync(workflow, "utf8");
  const confirm = readFileSync(new URL("../confirm-estoque-seed-empresa.sql", import.meta.url), "utf8");
  const seed = readFileSync(new URL("../seed-estoque-ribbons-bopp.sql", import.meta.url), "utf8");
  assert.equal(source.includes("empresa_id IS NOT NULL"), false);
  assert.match(source, /steps\.seed\.outputs\.empresa_id/);
  assert.match(source, /seed\.empresa_id=\$\{alvo\}/);
  assert.match(source, /seed\.empresa_id=\$\{seed_empresa_id\}/);
  assert.equal(confirm.includes("empresa_id IS NOT NULL"), false);
  assert.match(confirm, /empresa_id = target_empresa/);
  assert.match(confirm, /Esperados 42 SKUs na empresa/);

  const codes = (sql) => [...sql.matchAll(/'(ETQ-[^']+|RIB-[^']+|PEC-[^']+)'/g)].map((match) => match[1]);
  const seedCodes = [...new Set(codes(seed))].sort();
  const confirmCodes = [...new Set(codes(confirm))].sort();
  assert.equal(seedCodes.length, 42);
  assert.deepEqual(confirmCodes, seedCodes);
});
