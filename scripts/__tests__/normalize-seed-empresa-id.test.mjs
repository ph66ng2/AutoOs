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
  assert.equal(source.split("normalize-seed-empresa-id.sh").length - 1, 2);
});
