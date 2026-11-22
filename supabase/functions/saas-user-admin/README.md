# SaaS user lifecycle function

`saas-user-admin` is the server-side boundary for employee invites and account lifecycle actions. The desktop sends only an action, a profile ID/email for a new invite, or the target Auth user ID. Tenant and role are resolved from live database rows after the caller's bearer token is verified with Supabase Auth.

## Server configuration

Set these values only as Supabase Edge Function secrets/environment values; never use `VITE_*`, place them in desktop configuration, or commit actual values:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM` (a verified Resend sender, such as `AutoOS <acesso@example.com>`)
- `SAAS_INVITE_REDIRECT_URL` (the application invitation-acceptance route; add it to Supabase Auth's allowed redirect URLs)
- `SAAS_ADMIN_ALLOWED_ORIGINS` (comma-separated exact HTTPS app origins; Tauri's localhost origins are built in)

New Auth users are created unconfirmed without a password or user metadata. The server binds them as `pending`, generates an Auth invite link for the same Auth UUID, and delivers it through Resend. Resending generates a fresh link for that existing pending Auth user; it does not delete/recreate the user. If delivery fails after binding, the response contains the pending Auth UUID so the caller can offer a retry.

The invite link must land on the application acceptance flow. After the email is verified and the employee chooses a password, the authenticated client calls `saas-user-admin` with `{ "action": "accept_invite" }`, then refreshes its Supabase session. Before acceptance, the Auth Hook emits only `app_metadata.autoos_invite_pending`; it strips tenant/profile claims and RLS denies company data. Acceptance activates the live database identity and is audited.

The database lifecycle RPCs are executable only by `service_role`, except `accept_company_user_invite()`, which is callable by `authenticated` and derives its actor from `auth.uid()`. Deactivation flips the live binding first (immediately denying old JWTs at RLS/Auth Hook), then bans the Auth account to stop new sessions/refresh. A failed Auth ban does not restore database access; report it and retry the operation. Reactivation restores the identity and removes the Auth ban.

## Local verification

Run `scripts/test-saas-user-identities-local.sh` for the disposable PostgreSQL migration/RLS/lifecycle suite and `npm run test:server-scripts` for request validation, authorization-boundary orchestration, email-link delivery, and secret-redaction tests. These tests use synthetic users and mocked Auth/Resend adapters; they do not send email or change Staging.
