#!/usr/bin/env bash
set -euo pipefail

# Validates only the staging operator environment. It never reads the app's
# src-tauri/.env, preventing accidental validation against the internal baseline.
required_vars=(
  SUPABASE_STAGING_URL
  SUPABASE_STAGING_DATABASE_URL
  POWERSYNC_STAGING_URL
)

for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required staging variable: %s\n' "$name" >&2
    exit 64
  fi
done

if [[ ! "$SUPABASE_STAGING_URL" =~ ^https://[^/]+\.supabase\.co/?$ ]]; then
  printf 'SUPABASE_STAGING_URL must be an https://<project-ref>.supabase.co URL.\n' >&2
  exit 65
fi

if [[ ! "$POWERSYNC_STAGING_URL" =~ ^wss:// ]]; then
  printf 'POWERSYNC_STAGING_URL must use wss://.\n' >&2
  exit 65
fi

if [[ -n "${AUTOOS_INTERNAL_SUPABASE_URL:-}" ]] && [[ "$SUPABASE_STAGING_URL" == "$AUTOOS_INTERNAL_SUPABASE_URL" ]]; then
  printf 'Staging Supabase URL matches the internal baseline. Refusing to continue.\n' >&2
  exit 66
fi

if ! command -v psql >/dev/null 2>&1; then
  printf 'psql is required to validate the staging database connection.\n' >&2
  exit 69
fi

psql "$SUPABASE_STAGING_DATABASE_URL" \
  --no-psqlrc \
  --set=ON_ERROR_STOP=1 \
  --tuples-only \
  --no-align \
  --command 'SELECT 1' >/dev/null

printf 'Staging isolation checks passed.\n'
