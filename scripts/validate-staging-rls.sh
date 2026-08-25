#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_STAGING_DATABASE_URL:?Set SUPABASE_STAGING_DATABASE_URL only in the operations terminal.}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "${script_dir}/.." && pwd)"

psql "${SUPABASE_STAGING_DATABASE_URL}" \
  --set ON_ERROR_STOP=on \
  --file "${project_dir}/supabase/rls.sql"

psql "${SUPABASE_STAGING_DATABASE_URL}" \
  --set ON_ERROR_STOP=on \
  --file "${project_dir}/supabase/tests/rls-tenant-isolation.sql"

printf 'Staging RLS tenant-isolation checks passed.\n'
