#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"

# Documentation may name prohibited credentials to define the boundary. The
# executable client surface must not contain their names or read paths.
if git grep -n -E 'SUPABASE_SERVICE_ROLE_KEY|supabase_service_key|service_role[[:space:]_-]*(key|token)' -- \
  'src/**' 'src-tauri/**' ':!src-tauri/.env.example'; then
  printf 'Privileged Supabase credential reference found in client code.\n' >&2
  exit 1
fi

if git grep -n -E "current_setting\\('app\\.empresa_id'|empresa_id[[:space:]]+IS[[:space:]]+NULL" -- \
  supabase/rls.sql; then
  printf 'Legacy permissive tenant policy found in supabase/rls.sql.\n' >&2
  exit 1
fi

printf 'SaaS client credential scan passed.\n'
