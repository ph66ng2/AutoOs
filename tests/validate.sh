#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
waves="$here/.workflow/scripts/waves.sh"
fixtures="$here/tests/fixtures"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail() {
  printf 'FALHOU: %s\n' "$1" >&2
  exit 1
}

chmod +x "$waves"

"$waves" plan "$here/.workflow/workflow.template.json" >/dev/null \
  || fail "template vazio deveria passar no plan"

if "$waves" plan "$fixtures/invalid-missing-fields.json" >/dev/null 2>"$tmp/invalid.err"; then
  fail "JSON incompleto deveria ser recusado"
fi
grep -q 'inválido' "$tmp/invalid.err" || fail "erro de JSON incompleto sem mensagem esperada"

if "$waves" plan "$fixtures/invalid-missing-dependency.json" >/dev/null 2>"$tmp/dep.err"; then
  fail "blockedBy ausente deveria ser recusado"
fi
grep -q 'blockedBy' "$tmp/dep.err" || fail "erro de dependência sem mensagem esperada"

plan_out="$("$waves" plan "$fixtures/valid-ready-and-blocked.json")"
printf '%s\n' "$plan_out" | grep -qx $'PRONTA\tPROJ-001\tTicket raiz' \
  || fail "PROJ-001 deveria aparecer como PRONTA"
printf '%s\n' "$plan_out" | grep -q $'BLOQUEADA\tPROJ-002\tTicket dependente' \
  || fail "PROJ-002 deveria aparecer como BLOQUEADA"

printf 'ok: contrato do planejador válido\n'
