#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"
[[ -n "$target" && -d "$target" ]] || {
  printf 'Uso: %s /caminho/do/repositorio\n' "${0##*/}" >&2
  exit 64
}

here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$target/.workflow/scripts" "$target/.cursor/rules"
cp "$here/.workflow/README.md" "$target/.workflow/README.md"
cp "$here/.workflow/scripts/waves.sh" "$target/.workflow/scripts/waves.sh"
chmod +x "$target/.workflow/scripts/waves.sh"
cp "$here/.cursor/rules/ticket-workflow.mdc" "$target/.cursor/rules/ticket-workflow.mdc"

if [[ -f "$target/.workflow/workflow.json" ]]; then
  printf 'Mantido workflow.json já existente em %s\n' "$target/.workflow/workflow.json"
else
  cp "$here/.workflow/workflow.template.json" "$target/.workflow/workflow.json"
  printf 'Criado %s a partir do template. Ajuste project, baseBranch e promotionTarget.\n' "$target/.workflow/workflow.json"
fi

printf 'Regras instaladas em %s\n' "$target"
