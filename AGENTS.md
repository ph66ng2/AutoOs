# AUTOOS KNOWLEDGE BASE

**Generated:** 2026-07-08

## OVERVIEW

Desktop app for printer management, technical reception, operational communications, and supply stock control. Tauri 2.x + React 18 + PostgreSQL backend.

## STRUCTURE

```
./
├── src/                          # React frontend
│   ├── components/
│   │   ├── equipamentos/         # Equipment-specific UI (dialogs, photos, budget)
│   │   ├── clientes/             # Client sub-components
│   │   ├── configuracoes/          # Settings sub-components
│   │   └── ui/                   # shadcn/ui base components
│   ├── hooks/                    # Domain CRUD hooks + auth + notifications
│   ├── lib/                      # Services (db bridge, email, pdf, whatsapp, validations)
│   ├── pages/                    # Route pages (large files: Equipamentos.tsx ≈ 2510 lines)
│   ├── types/                    # TypeScript types
│   └── test/setup.ts             # Vitest setup (jest-dom matchers)
├── src-tauri/
│   ├── migrations/               # PostgreSQL migrations (source of truth)
│   ├── src/
│   │   ├── commands/             # IPC handlers (auth, clientes, equipamentos, produtos, etc.)
│   │   │   ├── auth.rs           # 1404 lines — profiles, PIN, permissions, audit, keyring
│   │   │   ├── equipamentos.rs   # 625 lines — equipment CRUD + status workflow
│   │   │   ├── produtos.rs       # 543 lines — stock movement with atomic transactions
│   │   │   ├── util.rs           # 1495 lines — backup/restore, schema, support bundle
│   │   │   ├── smtp.rs           # 476 lines — email sending, config in keyring
│   │   │   ├── photo_server.rs   # 973 lines — Axum HTTP server for mobile QR uploads
│   │   │   └── types.rs          # 574 lines — all IPC structs + SQL SELECT constants
│   │   ├── db.rs                 # Global POOL + DATABASE_URL resolution + migrations
│   │   ├── main.rs               # Tracing init → housekeeping → block_on db init → commands
│   │   └── bin/                  # 10 integration test binaries (runtime_smoke, p1_*, test_*)
│   ├── Cargo.toml                # 10 [[bin]] entries for integration tests
│   ├── build.rs                  # Standard tauri_build::build()
│   ├── tauri.conf.json           # Windows signing timestampUrl (DigiCert); certThumbprint = null
│   └── .env                      # DATABASE_URL (also searched in exe parent dirs)
├── .github/
│   ├── copilot-instructions.md   # Main guidance (ALWAYS read first)
│   └── workflows/
│       ├── ci.yml                # Lint → Vitest → cargo check/clippy → e2e:real → build
│       └── build.yml             # Windows release build on tag push
├── e2e/                          # Playwright tests (uses VITE_E2E_MOCK=1 alias)
├── scripts/
│   └── apply-windows-bundle-signing.mjs  # Injects cert thumbprint at build time
├── docs/
│   ├── RELEASE.md                # Version checklist and freeze rules
│   └── WINDOWS_CODE_SIGNING.md   # Signing certificate management
└── README.md                     # Overview, stack, execution
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Client CRUD | `src/pages/Clientes.tsx` + `clientes.rs` | PF/PJ with CPF/CNPJ validation, soft delete |
| Equipment management | `src/pages/Equipamentos.tsx` + `equipamentos.rs` | God page (2510 lines). 5 dialogs, 12-status workflow, photo upload, PDF/WhatsApp |
| Supply stock | `src/pages/Insumos.tsx` + `produtos.rs` | Currently blocked in routing (`BlockedInsumosPage`) |
| Settings/security | `src/pages/Configuracoes.tsx` + `auth.rs` + `util.rs` | Profiles, PIN, audit, backup, schema status |
| Auth/permissions | `auth.rs` | PINs in OS keyring (never DB), XOR session obfuscation |
| Database | `db.rs` + `migrations/` | sqlx runtime queries only (no `query!` macros) |
| PDF generation | `src/lib/pdf-service.ts` | jsPDF + autotable, 1211 lines with BMITAG branding |
| Email/WhatsApp | `src/lib/email-service.ts`, `whatsapp-service.ts` | SMTP + Evolution API. Email CC hardcoded to `medeiros@bmitag.com.br` |
| Mobile photo upload | `photo_server.rs` + `qr_code.rs` | Axum server, auto-shutdown after 15min idle |
| Backup/restore | `util.rs` | Orchestrates `pg_dump`/`pg_restore`/`psql`. Restore path restricted to `~/AutoOS/backups` |

## COMMANDS

### Daily development

```bash
npm run dev              # Vite dev server (port 1420, ignores src-tauri/)
npm run tauri dev        # Full Tauri dev (frontend + Rust backend)
npm run lint             # tsc --noEmit (tsconfig excludes **/*.test.ts)
npm run test:run         # Vitest unit tests (jsdom, pool=threads, maxWorkers=1)
npm run e2e              # Playwright E2E (uses VITE_E2E_MOCK=1, mocks Tauri IPC)
```

### Rust backend

```bash
cd src-tauri && cargo check              # Type check
cd src-tauri && cargo clippy -- -W warnings
```

### Integration tests (require PostgreSQL running)

```bash
cargo run --manifest-path src-tauri/Cargo.toml --bin runtime_smoke              # End-to-end CRUD smoke
cargo run --manifest-path src-tauri/Cargo.toml --bin p1_critical_integration    # Permission enforcement
cargo run --manifest-path src-tauri/Cargo.toml --bin p1_communication_integration # SMTP + WhatsApp with fake servers
cargo run --manifest-path src-tauri/Cargo.toml --bin p1_concurrency_integration # Concurrent update races
cargo run --manifest-path src-tauri/Cargo.toml --bin p1_windows_support_check    # Support bundle generation
cargo run --manifest-path src-tauri/Cargo.toml --bin test_auth_integration      # Comprehensive auth tests
npm run qa:integrations          # Runs p1_critical + p1_communication
npm run e2e:real                 # qa:integrations + Playwright E2E (needs real DB)
npm run qa:tier:jornada-real     # lint + test:run + e2e:real (full pipeline)
```

### Build

```bash
npm run tauri build              # Local desktop build
npm run bundle:prep:windows:sign # Injects certThumbprint from env into tauri.conf.json
```

### CI pipeline order (`.github/workflows/ci.yml`)

`lint` → `test-frontend` → `test-rust` → `qa-real` (needs PostgreSQL 16 service) → `build-tauri` (master push only)

## CONVENTIONS

### Backend (Rust)

- **PostgreSQL ONLY** — never reintroduce SQLite references in code, docs, or comments.
- **`.env` at `src-tauri/.env`** for `DATABASE_URL`. Also searched in executable parent directories (up to 3 levels up) and fallback `database-config.json` in app data dir.
- **Migrations** are sequential in `src-tauri/migrations/`. New schema changes always get a new file (`0011_...`, `0012_...`).
- **sqlx uses runtime queries only** — `sqlx::query("...")`, `sqlx::query_as::<_, RowType>("...")`, `sqlx::QueryBuilder`. **No `query!` / `query_as!` macros, no `.sqlx/` offline mode.** SQL errors are only caught at runtime, not by `cargo check`.
- **Database init blocks Tauri startup** — `main.rs` calls `tauri::async_runtime::block_on(db::init_database())` in `.setup()`. If it fails, the app continues in "configuration mode" (frontend shows DB config dialog).
- **Global singleton pool** — `static POOL: Mutex<Option<PgPool>>`. Not injected via Tauri State.
- **Concurrency control** — optimistic locking via `atualizado_em` timestamp. UPDATE includes `WHERE atualizado_em = $token`. If no rows affected → "Conflito de concorrência".
- **Financial permission gating** — `require_permission(PERMISSION_FINANCIAL_ACTIONS)` required for: status changes to APROVADO/REPROVADO/ENTREGUE/ORCAMENTO_VENCIDO, any `valor_orcamento`/`prazo_aprovacao`/`valor_final` changes, verification cost fields.
- **Security audit** — every sensitive action calls `record_security_event()` (fire-and-forget background INSERT to `security_audit_log`).
- **PINs in OS keyring** — stored via `keyring` crate (`autoos` service, `sensitive_access_profile_{id}` user). **Never in the database.** Legacy single-PIN migration supported.
- **Session obfuscation** — active profile stored in memory XOR-obfuscated with rotating session key. `current_session_profile()` deobfuscates on each access.
- **Inactivity lock** — `INACTIVITY_LOCK_ENABLED` is an `AtomicBool` synced from `configuracoes_sistema` table. When enabled, session expires after 15min.
- **Error handling** — all IPC commands return `Result<T, String>` (not `anyhow::Result`). DB errors: `map_err(|e| e.to_string())?`.
- **SMTP TLS nuance** — port 465 uses `relay()` (implicit TLS). Port 587 uses `starttls_relay()`. Wrong method causes indefinite hang.
- **Integration test binaries** use `#[path = "../db.rs"]` and `#[path = "../commands/mod.rs"]` to share modules. They share the same statics (POOL, SESSION) as the main app.

### Frontend (React/TypeScript)

- **`invoke()` centralized in `lib/db.ts`** — never call `invoke` directly from pages/hooks except for one-off runtime ops (photo server, QR code, temp files in `Equipamentos.tsx`).
- **Canonical data hook pattern** — every domain hook (`useClientes`, `useEquipamentos`, etc.) follows the same template:
  1. `useState` for `data`, `loading`, `error`
  2. `useCallback` for `carregar()` function
  3. `useEffect` auto-triggers `carregar()` when params change
  4. Write operations call `db.*` then `await carregar()` to refresh
  5. Returns `{ data, loading, error, ...mutations, recarregar: carregar }`
  No React Query, no SWR, no caching.
- **No Zustand stores exist in `src/`** — despite `copilot-instructions.md` mentioning "Zustand onde já existir". All state is React local state + `SensitiveAccessProvider` Context.
- **Forms** use React Hook Form + Zod (`zodResolver`). `validations.ts` has custom CPF/CNPJ digit-verifier algorithms (not just regex).
- **shadcn/ui** components in `src/components/ui/` — lightly customized, kept close to original. `cn()` from `lib/utils.ts` used everywhere.
- **Sensitive routes** use `<SensitiveRoute>` wrapper component (renders lock screen if unauthorized), not route guards in `App.tsx` logic.
- **Boot splash mandatory** — `MIN_BOOT_SPLASH_MS = 1100ms` in `useSensitiveAccess`. Ensures splash is visible even if backend resolves instantly.
- **Insumos module temporarily blocked** — marked with `[BLOQUEIO-TEMPORARIO-INSUMOS]` comments across `App.tsx`, `Layout.tsx`, `Dashboard.tsx`.

### Migrations (PostgreSQL)

- **Never edit an applied migration** — sqlx stores SHA-256 checksums in `_sqlx_migrations`. Editing breaks existing installs with `migration N was previously applied but has been modified`.
- **Idempotency patterns**:
  - Standard: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`
  - PostgreSQL-specific workaround (no `ADD CONSTRAINT IF NOT EXISTS`): `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END; $$` — used in `0009_idempotencia_final.sql`.
- **`NOT VALID` CHECK constraints** — migration `0002` adds many `CHECK ... NOT VALID` constraints. Existing bad data is grandfathered in; new inserts/updates must comply.
- **BYTEA image storage** — equipment images stored as binary blobs in PostgreSQL (`equipamento_imagens.conteudo BYTEA`), not filesystem references.
- **`serial_number` is no longer unique** — `0008` dropped the UNIQUE constraint to allow multiple maintenance cycles per physical device.

## ANTI-PATTERNS (THIS PROJECT)

- Don't add SQLite references in code, docs, or comments.
- Don't edit applied migrations in shared environments.
- Don't remove PIN/confirmation for destructive actions (restore requires explicit textual confirmation).
- Don't use Zustand for new state management (hooks are preferred and already used everywhere).
- Don't call `invoke()` from pages — route through `lib/db.ts`.
- Don't introduce `query!` / `query_as!` sqlx macros — the project uses runtime queries exclusively.
- Don't assume `serial_number` is a unique business key (multiple `equipamentos` rows can share it).
- Don't store sensitive data (PINs, SMTP passwords, WhatsApp tokens) in the database — use OS keyring.

## UNIQUE STYLES

- **Large page files** — `Equipamentos.tsx` ≈ 2510 lines (god page with 5 dialogs, 4-tab details, photo upload, PDF generation, WhatsApp/Email automation, budget divergence handling). `Configuracoes.tsx` ≈ 993 lines.
- **Integration tests as Rust binaries** — 10 `[[bin]]` entries in `Cargo.toml`, not `#[cfg(test)]` modules. Tests create temporary security profiles and clean them up.
- **Agent docs in `.github/agents/`** — reality-checker, senior-developer, etc.
- **Frontend tests mock `db` centrally** — standard pattern: `vi.hoisted()` + `vi.mock("@/lib/db", () => ({ db: { ... } }))`.
- **tsconfig excludes test files** — `"exclude": ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"]` means `tsc --noEmit` does not check tests.
- **Vitest Windows stability** — `pool: 'threads'`, `fileParallelism: false`, `maxWorkers: 1` to avoid fork/AV issues on Windows.
- **Playwright mock mode** — E2E tests run with `VITE_E2E_MOCK=1` which aliases `@tauri-apps/api/core` to `e2e/mocks/tauri-core.ts`. This validates UI flows with in-memory mock data, **not** real Tauri + PostgreSQL.
- **Email CC hardcoded** — `email-service.ts` always CCs `medeiros@bmitag.com.br`. Technician emails mapped by name (`ivan` → `ivan@bmicode.com`).
- **Windows code signing** — `certificateThumbprint` is `null` in `tauri.conf.json`. Build-time script `scripts/apply-windows-bundle-signing.mjs` injects it from env var for CI/release builds.

## NOTES

- **DATABASE_URL resolution chain** (highest to lowest priority): `env var` → `src-tauri/.env` (via dotenv) → executable directory + up to 3 parent dirs (searched for `.env`) → `database-config.json` in local app data dir (`~/.local/share/AutoOS/database-config.json` on Linux). The frontend can write DB connection to this JSON file for runtime switching.
- **Required in PATH for full backup/restore**: `pg_dump`, `pg_restore`, `psql`. Backup uses `--format=custom`. Restore runs `run_pending_migrations()` afterward to bridge schema gaps.
- **Logs**: `~/.local/share/AutoOS/logs/autoos.log.YYYY-MM-DD` (Linux), `%LOCALAPPDATA%\AutoOS\logs` (Windows). Daily rolling via `tracing-appender`.
- **Support packages**: `~/.local/share/AutoOS/support` (Linux), `%LOCALAPPDATA%\AutoOS\support` (Windows). JSON snapshots exported from `Configurações > Segurança`.
- **Temp files**: `/tmp/autoos` (Linux), `%TEMP%\autoos` (Windows). Pruned by housekeeping on startup.
- **Restore path restriction**: restore only accepts files inside `~/AutoOS/backups` (Linux) or `%USERPROFILE%\Documents\AutoOS\backups` (Windows).
- **CSP in tauri.conf.json** allows `https://viacep.com.br` (Brazilian ZIP code lookup API).
- **Version alignment**: `package.json` (0.2.0), `Cargo.toml` (0.2.0), `tauri.conf.json` (0.2.0) should match `docs/RELEASE.md` checklist.
