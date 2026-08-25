#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_STAGING_DATABASE_URL:?Set SUPABASE_STAGING_DATABASE_URL only in the operations terminal.}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "${script_dir}/.." && pwd)"

# PostgreSQL DDL is transactional. The integrity test ends in ROLLBACK, so this
# validates the full schema without leaving tables or synthetic rows in staging.
psql "${SUPABASE_STAGING_DATABASE_URL}" \
  --set ON_ERROR_STOP=on \
  --command 'BEGIN;' \
  --file "${project_dir}/supabase/schema.sql" \
  --file "${project_dir}/supabase/tests/staging-schema-integrity.sql"

printf 'Staging schema dry-run passed and was rolled back.\n'
