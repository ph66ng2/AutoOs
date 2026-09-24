#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "${script_dir}/.." && pwd)"
container_name="autoos-saas-identity-test-$$-$(date +%s)"
container_started=false

cleanup() {
  if [[ "${container_started}" == true ]]; then
    docker stop "${container_name}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

docker run --rm --detach \
  --name "${container_name}" \
  -e POSTGRES_PASSWORD=autoos_test_only_local \
  postgres:16-alpine >/dev/null
container_started=true

ready=false
for attempt in {1..30}; do
  if docker exec "${container_name}" pg_isready -U postgres >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "${ready}" != true ]]; then
  docker logs "${container_name}" >&2
  exit 1
fi

docker exec -i "${container_name}" psql -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE supabase_auth_admin NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    email text,
    raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE auth.sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id)
);
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
    SELECT COALESCE(
        NULLIF(current_setting('request.jwt.claim.sub', true), ''),
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    )::uuid;
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE
AS $$
    SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
$$;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
SQL

apply_sql() {
  docker exec -i "${container_name}" psql -U postgres -v ON_ERROR_STOP=1 >/dev/null < "$1"
}

apply_sql "${project_dir}/supabase/schema.sql"
apply_sql "${project_dir}/supabase/migrations/20260827180517_provision_saas_admin_identity.sql"

# Earlier migrations compile against the previously installed helper. This
# temporary local-only stub is replaced by the real implementation in the new
# migration below and is never present in Staging or in a checked-in SQL file.
docker exec "${container_name}" psql -U postgres -v ON_ERROR_STOP=1 >/dev/null \
  --command "CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';"

for migration in "${project_dir}"/supabase/migrations/*.sql; do
  [[ "${migration}" == *20260827180517* ]] && continue
  [[ "${migration}" == *20260923151000* ]] && continue
  [[ "${migration}" == *20260923173239* ]] && continue
  [[ "${migration}" == *20260923211404* ]] && continue
  apply_sql "${migration}"
done

apply_sql "${project_dir}/supabase/migrations/20260923151000_individual_saas_user_identities.sql"
apply_sql "${project_dir}/supabase/migrations/20260923173239_saas_current_operational_profile_and_individual_devices.sql"
apply_sql "${project_dir}/supabase/rls.sql"
apply_sql "${project_dir}/supabase/migrations/20260923211404_saas_server_side_sensitive_authorization.sql"

docker exec -i "${container_name}" psql -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO auth.users (id, email) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'auth-test-a@example.invalid'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'auth-test-b@example.invalid');
SQL
apply_sql "${project_dir}/supabase/operations/bootstrap-auth-test-tenants.sql"

docker exec -i "${container_name}" psql -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO public.company_admin_identities (auth_user_id, empresa_id, profile_id) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000011'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000011');
SQL

docker exec -i "${container_name}" psql -U postgres -v ON_ERROR_STOP=1 \
  --command 'BEGIN;' >/dev/null < "${project_dir}/supabase/tests/staging-schema-integrity.sql"
apply_sql "${project_dir}/supabase/tests/auth-admin-identity.sql"
apply_sql "${project_dir}/supabase/tests/individual-user-identity.sql"
apply_sql "${project_dir}/supabase/tests/saas-server-side-authorization.sql"

server_logs="$(docker logs "${container_name}" 2>&1)"
if ! grep -Fq \
  'AUTOOS_SAAS_AUTHZ_DENIED auth_user_id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa tenant_id=a0000000-0000-4000-8000-000000000001 action=equipamentos.UPDATE' \
  <<<"${server_logs}"; then
  printf '%s\n' "${server_logs}" >&2
  printf 'Expected server-side denial audit log was not emitted.\n' >&2
  exit 1
fi

printf 'Local SaaS identity, server-side authorization, audit immutability, ADMIN compatibility, RLS, stale-JWT, and schema checks passed.\n'
