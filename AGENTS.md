# AUTOOS KNOWLEDGE BASE

**Generated:** 2026-05-05
**Commit:** 5824f38
**Branch:** master

## OVERVIEW

Desktop app for printer management, technical reception, operational communications, and supply stock control. Tauri 2.x + React 18 + PostgreSQL backend.

## STRUCTURE

```
./
├── src/                          # React frontend
│   ├── components/equipamentos/ # Equipment-specific UI components
│   ├── components/ui/            # shadcn/ui base components
│   ├── hooks/                  # React hooks (useClientes, useEquipamentos, useInsumos)
│   ├── lib/                    # Services (db, email, pdf, whatsapp), utils, validations
│   ├── pages/                 # Route pages (Clientes, Equipamentos, Insumos, Configuracoes)
│   └── types/                # TypeScript types
├── src-tauri/                   # Tauri desktop backend
│   ├── migrations/            # PostgreSQL migrations (source of truth)
│   └── src/
│       ├── commands/         # IPC handlers (auth, clientes, equipamentos, produtos, util, etc.)
│       └── bin/            # Integration tests (runtime_smoke, p1_*, windows_support)
├── .github/copilot-instructions.md   # Main guidance (ALWAYS read first)
└── README.md                # Overview, stack, execution
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Client CRUD | `src/pages/Clientes.tsx` + `clientes.rs` | Two-way sync |
| Equipment management | `src/pages/Equipamentos.tsx` + `equipamentos.rs` | Technical reception |
| Supply stock | `src/pages/Insumos.tsx` + `produtos.rs` | Entry/exit movements |
| Settings/security | `src/pages/Configuracoes.tsx` | Profiles, PIN, audit, backup |
| Auth/permissions | `auth.rs` | Profiles, local PIN auth |
| Database | `db.rs` + `src-tauri/migrations/` | sqlx + versioned migrations |
| PDF generation | `src/lib/pdf-service.ts` | jsPDF + autotable |
| Email/WhatsApp | `src/lib/email-service.ts`, `whatsapp-service.ts` | SMTP + WhatsApp API |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| Configuracoes | page | 1590 lines | Settings/security hub |
| Equipamentos | page | 1466 lines | Equipment CRUD |
| auth.rs | command | 977 lines | Profiles, PIN, permissions |
| util.rs | command | 864 lines | Backup, restore, schema |
| useSensitiveAccess | hook | 14296 bytes | Sensitive access logic |

## CONVENTIONS

- PostgreSQL ONLY - never reintroduce SQLite
- `.env` at `src-tauri/.env` for DATABASE_URL
- Migrations sequential in `src-tauri/migrations/`
- Profiles + PIN auth for sensitive actions
- Backup/restore use external `pg_dump`/`pg_restore` tools

## ANTI-PATTERNS (THIS PROJECT)

- Don't add SQLite references in code, docs, or comments
- Don't edit applied migrations in shared environments
- Don't remove PIN/confirmation for destructive actions
- Don't use Zustand for everything (hooks preferred where exists)

## UNIQUE STYLES

- Large page files (Configuracoes.tsx = 1590 lines)
- Integration tests as Rust binaries in `src-tauri/src/bin/`
- Agent docs in `.github/agents/` (reality-checker, senior-developer, etc.)

## COMMANDS

```bash
npm run dev          # Vite dev server
npm run tauri dev    # Full Tauri dev
npm run tauri build # Desktop build
npm run test:run   # Vitest unit tests
npm run e2e       # Playwright e2e tests
cd src-tauri && cargo check  # Rust type check
```

## NOTES

- DATABASE_URL required in `src-tauri/.env` or env var
- Requires PostgreSQL 15+, `pg_dump`, `pg_restore`, `psql` in PATH for full backup/restore
- Logs: `~/.local/share/AutoOS/logs` (Linux), `%LOCALAPPDATA%\AutoOS\logs` (Windows)
- Support packages: `~/.local/share/AutoOS/support` (Linux), `%LOCALAPPDATA%\AutoOS\support` (Windows)