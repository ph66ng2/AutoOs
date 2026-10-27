#!/usr/bin/env bash
# Aceita um id decimal com espaços só nas pontas. Espaço interno, quebra de
# linha ou qualquer outro caractere recusa o valor em vez de colar os dígitos.

normalize_seed_empresa_id() {
  local raw="${1-}"
  if [[ "$raw" =~ ^[[:space:]]*$ ]]; then
    printf '%s' ""
    return 0
  fi
  if [[ "$raw" =~ ^[[:space:]]*([0-9]+)[[:space:]]*$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  echo "empresa_id precisa ser um inteiro, sem espaços internos; nenhuma conexão foi aberta." >&2
  return 1
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  normalize_seed_empresa_id "${1-}"
fi
