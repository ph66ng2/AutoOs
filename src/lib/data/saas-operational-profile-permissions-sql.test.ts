// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SENSITIVE_PERMISSIONS } from "@/types";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const FUNCTION_HEADER = /CREATE OR REPLACE FUNCTION public\.create_saas_operational_profile\s*\(/i;

/** Lista de permissões da última definição da RPC, na ordem de aplicação das migrations. */
function allowlistVigente(): { arquivo: string; permissoes: string[] } {
  const arquivos = readdirSync(MIGRATIONS_DIR).filter((nome) => nome.endsWith(".sql")).sort();
  let vigente: { arquivo: string; permissoes: string[] } | null = null;
  for (const arquivo of arquivos) {
    const sql = readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
    const inicio = sql.search(FUNCTION_HEADER);
    if (inicio < 0) continue;
    const corpo = sql.slice(inicio);
    const lista = corpo.match(/valid_permissions\s+constant\s+text\[\]\s*:=\s*ARRAY\[([^\]]*)\]/i);
    if (!lista) throw new Error(`Allowlist não encontrada em ${arquivo}`);
    const permissoes = [...lista[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    vigente = { arquivo, permissoes };
  }
  if (!vigente) throw new Error("create_saas_operational_profile não encontrada em supabase/migrations");
  return vigente;
}

describe("create_saas_operational_profile (Supabase)", () => {
  it("aceita exatamente as permissões oferecidas pela tela de equipe do SaaS", () => {
    const { arquivo, permissoes } = allowlistVigente();
    expect(arquivo >= "20261113142000").toBe(true);
    expect([...permissoes].sort()).toEqual(Object.values(SENSITIVE_PERMISSIONS).sort());
  });
});
