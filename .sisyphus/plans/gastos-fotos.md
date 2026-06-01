# Aba de Gastos + Captura de Fotos via Celular

## TL;DR

> **Quick Summary**: Add two features to AutoOS: (1) an expenses management tab with CRUD for fixed/variable expenses, monthly summaries, Recharts chart, and a new ADMIN-only VIEW_EXPENSES permission; (2) a mobile photo capture flow via QR code that starts a local HTTP server, lets a phone upload a gallery photo to an equipment, and stores it in the existing equipamento_imagens table via a new individual-insert IPC command.
> 
> **Deliverables**:
> - Gastos tab (page + route + permission guard)
> - 2 new SQL tables (gastos_fixos, gastos_variaveis) + seed categories
> - VIEW_EXPENSES permission (ADMIN-only, separate from FINANCIAL_ACTIONS)
> - Rust gastos.rs module (6 IPC commands)
> - Photo server module (axum HTTP server + token system)
> - New `adicionar_imagem_equipamento` IPC command
> - QR code dialog with LAN IP detection
> - Embedded HTML upload page for mobile browsers
> 
> **Estimated Effort**: Large (5-7 weeks)
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: Migration/Types → Rust gastos.rs → Gastos page → Route integration → QA; Cargo deps → photo_server.rs → QR/dialog → Lifecycle integration → QA

---

## Context

### Original Request
Add two features: (1) Aba de Gastos — expense management with monthly summaries, charts, CRUD for fixed/variable expenses; (2) Captura de fotos via celular — scan QR code on desktop, open browser on phone, pick photo from gallery, upload to equipment via local HTTP server.

### Interview Summary
**Key Discussions**:
- **Permission scope**: VIEW_EXPENSES must be separate from FINANCIAL_ACTIONS. Operators can approve budgets (FINANCIAL_ACTIONS) but must NOT see expenses (VIEW_EXPENSES). ADMIN gets VIEW_EXPENSES automatically.
- **Photo MVP**: Gallery-only upload over HTTP. No camera API, no HTTPS, no self-signed TLS.
- **Categories**: Fixed seed in migration (Aluguel, Energia, Internet, Fornecedores, Folha, Outros). No dynamic category CRUD.
- **Test strategy**: No automated unit tests. Agent-executed QA scenarios for every task.
- **Priority**: Gastos first (simpler), then Fotos.

**Research Findings**:
- **Permission system**: 6 existing permissions in `ALL_PERMISSIONS [&str; 6]`. ADMIN bypasses all. Adding VIEW_EXPENSES changes array size to 7. Touches 6+ files.
- **equipamento_imagens**: Uses `substituir` (replace-all) pattern. Max 6 images per equipment, 3MB per image, JPEG/PNG only. Needs NEW `adicionar_imagem_equipamento` command for individual insertion.
- **Tauri 2.x security**: CSP controls WebView only. Rust-side HTTP server is unrestricted. Phone as HTTP client ignores CSP.
- **Cargo.toml**: axum, qrcode, image, tower-http are NOT present. All 4 need adding.
- **Frontend image handling**: Canvas resize to max 1600px, JPEG 82% quality, `number[]` over IPC.
- **Monolithic files**: Configuracoes.tsx = 1590 lines, Equipamentos.tsx = 1466 lines. Gastos page must be componentized.

### Metis Review
**Identified Gaps** (addressed):
- **Fixed expenses are reference-only, no auto-generation**: Locked down. Gastos fixos are manual entries, not auto-generated monthly.
- **Monthly summary uses calendar month**: DATE_TRUNC('month', data). No rolling 30-day window.
- **Line chart shows last 12 months of per-month totals**: Not cumulative. Simple GROUP BY query.
- **Expenses are global (organizational)**: No FK to equipment/client in MVP.
- **Photo uploads default to 'ENTRADA' category**: No category selection on phone UI. Uses existing DB CHECK constraint values.
- **Token is single-use with 10-minute TTL**: After first successful upload, token is deleted. Server auto-shuts down after 15 min of inactivity or dialog close.
- **6-image limit enforced on individual insert**: Error message "Limite de 6 imagens atingido" if equipment already has 6 images.
- **Phone browser cannot resize images**: Server-side resize using `image` crate (max 1600px longest side, JPEG 82% quality).
- **Currency format**: BRL (R$) with pt-BR locale, consistent with Dashboard.tsx pattern.
- **HEIC/HEIF rejection**: Server validates MIME type against JPEG/PNG only (matching DB CHECK constraint).
- **Network interface detection**: Use first non-loopback IPv4 address. Fallback: show manual IP input in dialog.

---

## Work Objectives

### Core Objective
Add a Gastos (expenses) management tab and a mobile photo capture mechanism to AutoOS, following existing codebase patterns and permission architecture.

### Concrete Deliverables
- `src-tauri/migrations/0006_gastos.sql` — 2 tables + seed categories
- `src-tauri/src/commands/gastos.rs` — 6 IPC commands for gastos CRUD + resumo
- `src-tauri/src/commands/photo_server.rs` — axum HTTP server + token store + image resize
- `src-tauri/src/commands/equipamento_imagens.rs` (modified) — new `adicionar_imagem_equipamento` command
- `src-tauri/src/commands/auth.rs` (modified) — VIEW_EXPENSES constant + ALL_PERMISSIONS update
- `src-tauri/src/commands/types.rs` (modified) — Gastos structs
- `src-tauri/src/main.rs` (modified) — register new commands
- `src/types/index.ts` (modified) — SENSITIVE_PERMISSIONS + Gastos types
- `src/hooks/useGastos.ts` — data fetching hook
- `src/lib/db.ts` (modified) — gastos IPC bridge
- `src/pages/Gastos.tsx` — full page with cards, chart, table, forms
- `src/components/gastos/` — extracted components
- Photo upload dialog component
- Embedded HTML for mobile browser upload

### Definition of Done
- [ ] `cargo check` passes with no errors
- [ ] `npx tsc --noEmit` passes with no errors
- [ ] Gastos tab visible and functional for ADMIN, hidden for OPERADOR without VIEW_EXPENSES
- [ ] Monthly summary cards show correct totals
- [ ] Recharts line chart renders 12 months of data
- [ ] Filterable table works by period and category
- [ ] CRUD for both fixed and variable expenses works
- [ ] QR code displays with correct LAN IP
- [ ] Phone can upload photo via local HTTP server
- [ ] Uploaded photo appears in equipment image gallery
- [ ] Token expires after 10 minutes and is single-use
- [ ] Server auto-shuts down on dialog close or inactivity

### Must Have
- VIEW_EPENSES permission separate from FINANCIAL_ACTIONS
- ADMIN-only access to Gastos tab
- Monthly expense summary with per-month chart
- CRUD for fixed and variable expenses
- Photo upload from phone gallery via local HTTP server
- Single-use token with 10-minute TTL for photo upload auth
- Server-side image validation and resize (JPEG/PNG, max 3MB, max 1600px)
- 6-image limit per equipment enforced on individual insert
- Server auto-shutdown on dialog close or 15 min inactivity

### Must NOT Have (Guardrails)
- ❌ Auto-generation of variable expenses from fixed expenses
- ❌ Custom category CRUD (seed categories only)
- ❌ HTTPS or self-signed TLS for photo server
- ❌ Camera API (navigator.mediaDevices.getUserMedia) — gallery upload only
- ❌ Multi-file upload from phone — one photo at a time
- ❌ Real-time sync between desktop and phone (manual refresh only)
- ❌ Image editing, rotation, or cropping tools
- ❌ Individual image deletion or reordering (use existing substituir pattern for bulk changes)
- ❌ PDF/CSV export for expenses
- ❌ Budget approval workflows linked to expenses
- ❌ FK from expenses to equipment/client (global expenses only in MVP)
- ❌ Monolithic Gastos.tsx exceeding 400 lines — must componentize

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: YES (Vitest + Playwright in package.json)
- **Automated tests**: NO — agent-executed QA only
- **Framework**: N/A (no test files will be written)
- **Agent-Executed QA**: ALWAYS (mandatory for every task)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) — Navigate, interact, assert DOM, screenshot
- **TUI/CLI**: Use interactive_bash (tmux) — Run command, validate output
- **API/Backend**: Use Bash (curl / cargo test) — Send requests, assert responses
- **Rust**: Use Bash (`cargo check`) — Verify compilation and type safety

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately, 3 parallel tasks):
├── Task 1: Gastos migration + Rust/TS type definitions [quick]
├── Task 2: VIEW_EXPENSES permission integration [quick]
└── Task 3: Cargo.toml dependencies for photo feature [quick]

Wave 2 (Backend — after Wave 1, 4 parallel tasks):
├── Task 4: Rust gastos.rs — all IPC commands (depends: 1, 2) [deep]
├── Task 5: Gastos hook + db service layer (depends: 1, 2) [quick]
├── Task 6: Rust adicionar_imagem_equipamento command (depends: —) [unspecified-high]
└── Task 7: Rust photo_server.rs — axum server + routes + token store (depends: 3) [deep]

Wave 3 (Frontend — after Wave 2, 4 parallel tasks):
├── Task 8: Gastos page — cards, chart, table, forms (depends: 4, 5) [visual-engineering]
├── Task 9: QR code generation + LAN IP detection module (depends: 3) [quick]
├── Task 10: Photo upload dialog component (depends: 7, 9) [visual-engineering]
└── Task 11: Phone HTML upload page + image validation (depends: 7) [unspecified-high]

Wave 4 (Integration — after Wave 3, 2 parallel tasks):
├── Task 12: Gastos route + navigation + permission guard (depends: 8) [quick]
└── Task 13: Photo server lifecycle + Tauri event wiring (depends: 10, 11) [deep]

Wave 5 (QA — after Wave 4, 2 parallel tasks):
├── Task 14: Gastos feature end-to-end QA (depends: 12) [unspecified-high]
└── Task 15: Photo feature end-to-end QA (depends: 13) [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: T1 → T4 → T8 → T12 → T14
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Waves 2 and 3)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 4, 5 | 1 |
| 2 | — | 4, 5 | 1 |
| 3 | — | 7, 9 | 1 |
| 4 | 1, 2 | 8 | 2 |
| 5 | 1, 2 | 8 | 2 |
| 6 | — | 13 | 2 |
| 7 | 3 | 10, 11 | 2 |
| 8 | 4, 5 | 12 | 3 |
| 9 | 3 | 10 | 3 |
| 10 | 7, 9 | 13 | 3 |
| 11 | 7 | 13 | 3 |
| 12 | 8 | 14 | 4 |
| 13 | 10, 11 | 15 | 4 |
| 14 | 12 | F3 | 5 |
| 15 | 13 | F3 | 5 |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `quick`, T3 `quick`
- **Wave 2**: 4 tasks — T4 `deep`, T5 `quick`, T6 `unspecified-high`, T7 `deep`
- **Wave 3**: 4 tasks — T8 `visual-engineering`, T9 `quick`, T10 `visual-engineering`, T11 `unspecified-high`
- **Wave 4**: 2 tasks — T12 `quick`, T13 `deep`
- **Wave 5**: 2 tasks — T14 `unspecified-high`, T15 `unspecified-high`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [ ] 1. Gastos migration + Rust/TS type definitions

  **What to do**:
  - Create migration `src-tauri/migrations/0006_gastos.sql` with two tables:
    - `gastos_fixos`: id (SERIAL PK), nome (TEXT NOT NULL UNIQUE), valor (NUMERIC(15,2) NOT NULL CHECK > 0), vencimento_dia (INTEGER CHECK >=1 AND <=31), categoria (TEXT NOT NULL), ativo (BOOLEAN DEFAULT true), criado_em, atualizado_em
    - `gastos_variaveis`: id (SERIAL PK), descricao (TEXT NOT NULL), valor (NUMERIC(15,2) NOT NULL CHECK > 0), data (DATE NOT NULL CHECK <= CURRENT_DATE), categoria (TEXT NOT NULL), nota (TEXT), referencia_id (INTEGER REFERENCES gastos_fixos(id) ON DELETE SET NULL), criado_em, atualizado_em
    - Index on gastos_variaveis(data) and gastos_variaveis(categoria, data)
  - Seed 6 categories: INSERT gastos_fixos for Aluguel (valor=0, ativo=false, placeholder), Energia, Internet, Fornecedores, Folha, Outros — as reference categories with ativo=false and valor=0 (user will customize)
  - Add Rust structs to `src-tauri/src/commands/types.rs`:
    - `GastoFixoInput`, `GastoFixoRow`, `GastoVariavelInput`, `GastoVariavelRow`, `GastoResumoMensal` (total_fixo, total_variavel, total_geral, por_categoria: Vec<CategoriaValor>)
    - `EQUIPAMENTO_IMAGEM_SELECT`-style constant for gastos queries
  - Add TypeScript interfaces to `src/types/index.ts`:
    - `GastoFixo`, `GastoVariavel`, `GastoVariavelInput`, `GastoResumoMensal`, `CategoriaValor`
    - `GastosFixosCategoria` string union type for the 6 seed categories
  - Verify: `cargo check` passes, `npx tsc --noEmit` passes

  **Must NOT do**:
  - Do NOT link gastos to equipment or client (global only)
  - Do NOT add image/attachment fields
  - Do NOT add custom category CRUD tables
  - Do NOT use TIMESTAMP for date columns — use DATE for gastos_variaveis.data

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Well-defined schema and type definitions following existing patterns
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `customize-opencode`: Not relevant — editing app code, not opencode config

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src-tauri/migrations/0004_equipment_images.sql` — Migration style: CHECK constraints, named FKs, indexes, idempotent patterns
  - `src-tauri/src/commands/types.rs:48-60` — Struct definition pattern (EquipamentoImagemInput)
  - `src-tauri/src/commands/types.rs:302-317` — Row struct pattern (EquipamentoImagemRow)
  - `src/types/index.ts:126-160` — TypeScript interface pattern for equipment images

  **API/Type References**:
  - `src-tauri/migrations/0001_initial_schema.sql:142-151` — security_profiles table (DATE/TIMESTAMP pattern reference)
  - `src-tauri/migrations/0001_initial_schema.sql:165-166` — Seed INSERT pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Migration applies successfully
    Tool: Bash
    Preconditions: PostgreSQL running, DATABASE_URL configured
    Steps:
      1. Run `cargo check` from src-tauri directory
      2. Run the app with `npm run tauri dev` — migration should auto-apply
      3. Query database: `SELECT count(*) FROM gastos_fixos;` — should return 6
      4. Query database: `SELECT count(*) FROM gastos_variaveis;` — should return 0
    Expected Result: Both queries succeed, gastos_fixos has 6 seed rows, gastos_variaveis is empty
    Failure Indicators: `cargo check` fails, migration fails, wrong row count
    Evidence: .sisyphus/evidence/task-1-migration-apply.txt

  Scenario: TypeScript types compile without errors
    Tool: Bash
    Preconditions: Migration and type files created
    Steps:
      1. Run `npx tsc --noEmit`
    Expected Result: Zero type errors
    Failure Indicators: Any TypeScript errors related to new types
    Evidence: .sisyphus/evidence/task-1-tsc-check.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(gastos): add migration, Rust/TS types for expenses`
  - Files: `src-tauri/migrations/0006_gastos.sql`, `src-tauri/src/commands/types.rs`, `src/types/index.ts`
  - Pre-commit: `cargo check && npx tsc --noEmit`

- [ ] 2. VIEW_EXPENSES permission integration

  **What to do**:
  - Add `pub const PERMISSION_VIEW_EXPENSES: &str = "VIEW_EXPENSES";` to `src-tauri/src/commands/auth.rs` (around line 27, after existing constants)
  - Update `ALL_PERMISSIONS` array from `[&str; 6]` to `[&str; 7]`, adding `PERMISSION_VIEW_EXPENSES`
  - Add `VIEW_EXPENSES: "VIEW_EXPENSES"` to `SENSITIVE_PERMISSIONS` object in `src/types/index.ts`
  - Add `VIEW_EXPENSES: "visualizar gastos e despesas"` to `SENSITIVE_PERMISSION_LABELS` in `src/types/index.ts`
  - Add `can_view_expenses: boolean` computed property to `SensitiveAccessStatus` interface (derived from `permissions.includes('VIEW_EXPENSES')`)
  - Verify: `cargo check` passes, `npx tsc --noEmit` passes
  - Verify: ADMIN profile automatically gets VIEW_EXPENSES (via normalize_permissions)
  - Verify: Custom OPERADOR profile without VIEW_EXPENSES cannot access expenses

  **Must NOT do**:
  - Do NOT remove or change FINANCIAL_ACTIONS — they serve different purposes
  - Do NOT add VIEW_EXPENSES to default seed INSERT in migration 0001 — ADMIN gets it automatically via normalize_permissions
  - Do NOT modify the PIN dialog or session logic — only add the permission constant

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical addition following exact existing pattern (6 other permissions already defined)
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `customize-opencode`: Not relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src-tauri/src/commands/auth.rs:22-36` — Existing permission constants and ALL_PERMISSIONS array
  - `src-tauri/src/commands/auth.rs:344-345` — `has_permission` function
  - `src-tauri/src/commands/auth.rs:259-278` — `normalize_permissions` — ADMIN gets all permissions automatically

  **API/Type References**:
  - `src/types/index.ts:397-431` — SENSITIVE_PERMISSIONS object, SensitivePermission type, SENSITIVE_PERMISSION_LABELS

  **Test References**:
  - `src-tauri/src/bin/p1_critical_integration.rs` — Integration test that checks permission DENIED vs ALLOWED patterns

  **WHY Each Reference Matters**:
  - `auth.rs:22-36` — Exact pattern to follow for adding the new constant and updating the array
  - `types/index.ts:397-431` — Must mirror the Rust-side change in TypeScript
  - `p1_critical_integration.rs` — Check if this test needs updating for the new permission

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Permission constant compiles and is recognized
    Tool: Bash
    Preconditions: Auth changes made
    Steps:
      1. Run `cargo check` from src-tauri
      2. Verify ALL_PERMISSIONS includes "VIEW_EXPENSES" in the compiled code
    Expected Result: Zero compilation errors
    Failure Indicators: Any Rust compilation errors
    Evidence: .sisyphus/evidence/task-2-cargo-check.txt

  Scenario: TypeScript permission mirrors Rust
    Tool: Bash
    Preconditions: TypeScript changes made
    Steps:
      1. Run `npx tsc --noEmit`
      2. Verify no type errors
    Expected Result: Zero type errors
    Failure Indicators: Any TypeScript errors related to VIEW_EXPENSES
    Evidence: .sisyphus/evidence/task-2-tsc-check.txt

  Scenario: ADMIN automatically gets VIEW_EXPENSES
    Tool: Bash
    Preconditions: App running with database
    Steps:
      1. Start the app with `npm run tauri dev`
      2. Query the ADMIN profile via IPC — permissions should include "VIEW_EXPENSES"
    Expected Result: ADMIN profile permissions array contains "VIEW_EXPENSES"
    Failure Indicators: VIEW_EXPENSES missing from ADMIN permissions
    Evidence: .sisyphus/evidence/task-2-admin-permission.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(gastos): add VIEW_EXPENSES permission`
  - Files: `src-tauri/src/commands/auth.rs`, `src/types/index.ts`
  - Pre-commit: `cargo check && npx tsc --noEmit`

- [ ] 8. Gastos page — cards, chart, table, forms

  **What to do**:
  - Create `src/pages/Gastos.tsx` as the main page component (under 400 lines, componentized):
    - Import and use `useGastos` hook from Task 5
    - Import and use `useSensitiveAccess` with `SENSITIVE_PERMISSIONS.VIEW_EXPENSES`
    - Import `Recharts` (LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer)
  - Create `src/components/gastos/` directory with extracted components:
    - `GastosSummaryCards.tsx` — 3 cards: Total Fixo (R$), Total Variável (R$), Total Geral (R$) for selected month
    - `GastosChart.tsx` — Recharts LineChart showing last 12 months of total fixo vs variável
    - `GastosTable.tsx` — TanStack Table with columns: descricao/nome, valor, categoria, data/vencimento, ações. Filters: mês/ano selector, categoria dropdown, busca text
    - `GastosFormFixo.tsx` — Dialog form for creating/editing gastos fixos (nome, valor, vencimento_dia, categoria, ativo toggle)
    - `GastosFormVariavel.tsx` — Dialog form for creating gastos variáveis (descricao, valor, data, categoria, nota)
  - Layout follows existing page patterns (see `src/pages/Servicos.tsx` for structure reference)
  - Cards use shadcn/ui `Card` components with icons
  - Chart uses Recharts `LineChart` following `Dashboard.tsx` pattern
  - Currency formatting uses `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
  - Table uses TanStack Table with sorting and filtering
  - Forms use react-hook-form + zod validation
  - Month/year selector defaults to current month
  - Permission gate: page content only visible when `ensureSensitiveAccess({ permission: SENSITIVE_PERMISSIONS.VIEW_EXPENSES })` resolves to true

  **Must NOT do**:
  - Do NOT exceed 400 lines in Gastos.tsx — extract into sub-components
  - Do NOT add PDF/CSV export
  - Do NOT add budget approval workflows
  - Do NOT add FK linking to equipment or client
  - Do NOT add dynamic category management
  - Do NOT add delete operations for gastos (edit only)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI-heavy task with cards, charts, tables, forms, and responsive layout
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on backend)
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 11)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - `src/pages/Servicos.tsx` — Page structure pattern (state → hooks → form → dialogs)
  - `src/pages/Dashboard.tsx:461-468` — Recharts LineChart usage pattern
  - `src/pages/Insumos.tsx` — Table with filtering pattern (TanStack Table + busca)
  - `src/components/ui/card.tsx` — shadcn Card component for summary cards
  - `src/hooks/useSensitiveAccess.tsx:179-205` — `ensureSensitiveAccess` pattern with permission

  **API/Type References**:
  - `src/types/index.ts` — GastoFixo, GastoVariavel, GastoResumoMensal, CategoriaValor types from Task 1
  - `src/hooks/useGastos.ts` — Hook from Task 5
  - `src/lib/db.ts` — IPC bridge from Task 5

  **WHY Each Reference Matters**:
  - `Servicos.tsx` — Follow the same page structure pattern for consistency
  - `Dashboard.tsx:461-468` — Recharts integration pattern (data formatting, responsive container)
  - `Insumos.tsx` — TanStack Table filtering pattern
  - `useSensitiveAccess` — Must gate the entire page behind VIEW_EXPENSES permission

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Gastos page renders with permission
    Tool: Playwright
    Preconditions: App running, ADMIN profile with VIEW_EXPENSES
    Steps:
      1. Navigate to /gastos
      2. Verify page loads with 3 summary cards (Total Fixo, Total Variável, Total Geral)
      3. Verify Line chart area is visible
      4. Verify table renders (empty state or with data)
    Expected Result: Page renders with cards, chart, and table visible
    Failure Indicators: Blank page, permission error, missing components
    Evidence: .sisyphus/evidence/task-8-gastos-page-render.png

  Scenario: Gastos page blocked without permission
    Tool: Playwright
    Preconditions: App running, OPERADOR profile WITHOUT VIEW_EXPENSES
    Steps:
      1. Navigate to /gastos
      2. Verify PIN/permission dialog appears
      3. Verify page content is NOT visible
    Expected Result: Permission dialog appears, page content hidden
    Failure Indicators: Page content visible without VIEW_EXPENSES permission
    Evidence: .sisyphus/evidence/task-8-permission-block.png

  Scenario: CRUD operations work for gastos fixos
    Tool: Playwright
    Preconditions: App running, ADMIN profile, gastos page loaded
    Steps:
      1. Click "Novo Gasto Fixo" button
      2. Fill form: nome="Aluguel Teste", valor=2500, vencimento_dia=10, categoria="Aluguel"
      3. Submit form
      4. Verify new entry appears in table with correct values
      5. Verify summary card totals update
    Expected Result: Fixed expense created and displayed correctly
    Failure Indicators: Form submission error, data not appearing, wrong totals
    Evidence: .sisyphus/evidence/task-8-crud-fixo.png
  ```

  **Commit**: YES
  - Message: `feat(gastos): add expenses page with cards, chart, and table`
  - Files: `src/pages/Gastos.tsx`, `src/components/gastos/GastosSummaryCards.tsx`, `src/components/gastos/GastosChart.tsx`, `src/components/gastos/GastosTable.tsx`, `src/components/gastos/GastosFormFixo.tsx`, `src/components/gastos/GastosFormVariavel.tsx`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 9. QR code generation + LAN IP detection module

  **What to do**:
  - Create `src-tauri/src/commands/qr_code.rs` with IPC commands:
    - `gerar_qr_upload(equipamento_id: i32, categoria: String, port: u16)` — Generates a single-use upload token via `photo_server::generate_upload_token`, constructs URL `http://{LAN_IP}:{port}/?token={token}&eq={equipamento_id}&cat={categoria}`, generates QR code as SVG string using the `qrcode` crate, returns `{ qr_svg: String, url: String, token: String }`
    - `get_lan_ip()` — Returns the machine's LAN IPv4 address using `local_ip` crate or manual interface detection (fallback: return error with message "Não foi possível detectar o IP da rede local")
  - Add `pub mod qr_code;` to `src-tauri/src/commands/mod.rs`
  - Register both commands in `src-tauri/src/main.rs` invoke_handler
  - Add IPC bridge functions to `src/lib/db.ts`: `gerarQrUpload(equipamentoId, categoria, port)`, `getLanIp()`
  - Verify: `cargo check` passes

  **Must NOT do**:
  - Do NOT generate PNG QR codes — SVG is easier to render in React (inline in dangerouslySetInnerHTML or as data URI)
  - Do NOT add IP address selection UI — use first non-loopback IPv4 address only
  - Do NOT persist tokens to database — in-memory only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small module with QR generation and IP detection
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 10, 11 — but note depends on Task 3 for qrcode crate)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 10
  - **Blocked By**: Task 3 (Cargo deps with qrcode crate)

  **References**:

  **Pattern References**:
  - `src-tauri/src/commands/mod.rs:18` — Module declaration pattern
  - `src-tauri/src/main.rs:99-170` — Command registration pattern
  - `src/lib/db.ts:160-174` — IPC invoke bridge pattern

  **External References**:
  - qrcode crate: https://docs.rs/qrcode — QR code generation, specifically `QrCode::with_bytes()` and `.render::<svg::Color>()` for SVG output

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: QR code generation produces valid SVG
    Tool: Bash
    Preconditions: qr_code.rs created, registered, compiled
    Steps:
      1. Run `cargo check`
      2. Start app, call `gerar_qr_upload` with equipamento_id=1, categoria="ENTRADA", port=8765
      3. Verify response contains `qr_svg` field with valid SVG XML starting with `<svg`
      4. Verify response contains `url` field with format `http://{IP}:8765/?token={uuid}&eq=1&cat=ENTRADA`
      5. Verify response contains `token` field matching the URL token
    Expected Result: Returns valid SVG QR code, properly formatted URL, and matching token
    Failure Indicators: Empty SVG, malformed URL, missing token
    Evidence: .sisyphus/evidence/task-9-qr-generation.txt

  Scenario: LAN IP detection returns valid address
    Tool: Bash
    Preconditions: App running
    Steps:
      1. Call `get_lan_ip()`
      2. Verify result matches a valid IPv4 address (not 127.0.0.1, not 0.0.0.0)
    Expected Result: Returns LAN IP like 192.168.x.x or 10.x.x.x
    Failure Indicators: Returns loopback address, or error
    Evidence: .sisyphus/evidence/task-9-lan-ip.txt
  ```

  **Commit**: YES
  - Message: `feat(photos): add QR code generation and LAN IP detection`
  - Files: `src-tauri/src/commands/qr_code.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/main.rs`, `src/lib/db.ts`
  - Pre-commit: `cargo check`

- [ ] 10. Photo upload dialog component

  **What to do**:
  - Create `src/components/equipamentos/PhotoUploadDialog.tsx`:
    - Dialog component (shadcn Dialog) that opens when user clicks "Adicionar Foto via Celular" button on equipment page
    - On dialog open:
      1. Call `start_photo_server(8765)` to start the local HTTP server
      2. Call `gerar_qr_upload(equipamento.id, "ENTRADA", 8765)` to get QR code SVG and URL
      3. Display QR code SVG and URL as text (for manual entry)
      4. Show instructions: "Escaneie o QR code com seu celular ou acesse o endereço abaixo"
      5. Poll token status every 3 seconds using ` GET /status/{token}` via fetch
      6. When status shows "used" (photo uploaded), close dialog and refresh equipment images
      7. Display countdown timer (10 minutes) for token expiry
    - On dialog close:
      1. Call `stop_photo_server()` to shut down the HTTP server
      2. Clean up polling interval
    - Error states:
      - Server fails to start: "Não foi possível iniciar o servidor de fotos"
      - IP detection fails: show manual IP input field
      - Token expired: "Token expirado. Gere um novo QR code."
    - Add "Adicionar Foto via Celular" button to equipment detail view (near existing photo upload button)
  - Use Tauri event listener for `photo-received` event (emitted by photo_server after successful upload) as an alternative to polling

  **Must NOT do**:
  - Do NOT add camera icon or camera UI — this is gallery upload only
  - Do NOT add multi-file upload — one photo at a time
  - Do NOT add progress bar or upload percentage
  - Do NOT start photo server on app launch — only when dialog opens
  - Do NOT add QR code scanning (that's the phone's job)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: React component with dialog, QR display, timer, and state management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on photo_server and QR module)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 7, 9

  **References**:

  **Pattern References**:
  - `src/components/ui/dialog.tsx` — shadcn Dialog component pattern
  - `src/pages/Equipamentos.tsx:185,311-358` — Existing image upload flow for equipment
  - `src/hooks/useSensitiveAccess.tsx` — Permission check pattern

  **API/Type References**:
  - `src/lib/db.ts` — `gerarQrUpload`, `startPhotoServer`, `stopPhotoServer`, `getLanIp` functions from Task 9
  - `src-tauri/src/commands/photo_server.rs` — IPC commands for server lifecycle

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Photo dialog displays QR code and URL
    Tool: Playwright
    Preconditions: App running, photo server and QR modules complete
    Steps:
      1. Open an equipment detail page
      2. Click "Adicionar Foto via Celular" button
      3. Verify dialog opens with QR code SVG image
      4. Verify URL is displayed as text below QR code
      5. Verify countdown timer is visible (10:00 minutes)
    Expected Result: Dialog shows QR code, URL, and countdown timer
    Failure Indicators: Empty dialog, no QR code, no URL, no timer
    Evidence: .sisyphus/evidence/task-10-dialog-display.png

  Scenario: Dialog error state when server fails
    Tool: Playwright
    Preconditions: App running, port 8765 already in use (simulate failure)
    Steps:
      1. Block port 8765 with another service
      2. Open equipment page, click "Adicionar Foto via Celular"
      3. Verify error message "Não foi possível iniciar o servidor de fotos" appears
    Expected Result: Error message displayed instead of QR code
    Failure Indicators: Blank dialog, no error message, or app crash
    Evidence: .sisyphus/evidence/task-10-server-error.png
  ```

  **Commit**: YES
  - Message: `feat(photos): add photo upload dialog with QR code display`
  - Files: `src/components/equipamentos/PhotoUploadDialog.tsx`, `src/pages/Equipamentos.tsx` (modified)
  - Pre-commit: `npx tsc --noEmit`

- [ ] 11. Phone HTML upload page + image validation

  **What to do**:
  - Create the embedded HTML string in `src-tauri/src/commands/photo_server.rs` (in the `HTML_UPLOAD_PAGE` constant):
    - Mobile-friendly layout with viewport meta tag
    - Title: "AutoOS - Upload de Foto"
    - Simple form with `<input type="file" accept="image/jpeg,image/png" capture="environment" id="photo">`
    - Submit button: "Enviar Foto"
    - Status message area for upload progress/result
    - After successful upload: "Foto enviada com sucesso! ✓" with green background
    - After error: Portuguese error message with red background
    - CSS: Mobile-first, large touch targets (min 44px), centered layout
  - Add server-side image validation and resize to the `POST /upload` handler:
    - Accept only JPEG (`image/jpeg`) and PNG (`image/png`) MIME types
    - Reject files > 3MB with clear Portuguese error message "Arquivo muito grande. Máximo 3MB."
    - Validate and read the token from query param
    - Resize image using `image` crate: max 1600px on longest side, convert to JPEG at 82% quality
    - If image is PNG: keep as PNG (don't force convert to JPEG)
    - Validate final resized image is <= 3MB
    - Call `adicionar_imagem_equipamento` via Tauri state to save to database
    - Return JSON: `{"success": true, "message": "Foto salva com sucesso!"}` or `{"success": false, "error": "Mensagem em português"}`

  **Must NOT do**:
  - Do NOT add camera API (`getUserMedia`) — `<input capture="environment">` for gallery only
  - Do NOT add HTTPS — HTTP only
  - Do NOT add progress bar — simple status messages
  - Do NOT add retry mechanism — user must resubmit
  - Do NOT add multi-file upload — `multiple` attribute should be absent from input
  - Do NOT store images on filesystem — save to database via `adicionar_imagem_equipamento`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Embedded HTML + backend validation + image processing logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 9)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 13
  - **Blocked By**: Task 7 (photo_server.rs)

  **References**:

  **Pattern References**:
  - `src-tauri/src/commands/equipamento_imagens.rs:7-8` — MAX_IMAGES_PER_EQUIPMENT and MAX_IMAGE_BYTES constants
  - `src-tauri/src/commands/equipamento_imagens.rs:105-198` — Validation pattern for MIME type and size
  - `src/lib/equipamento-imagem-utils.ts:110-153` — Client-side resize logic (max 1600px, JPEG 82%) — server should match this

  **API/Type References**:
  - `image` crate: `image::DynamicImage::resize()` — Server-side image resize API
  - `axum::extract::Multipart` — Multipart form data extraction

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Phone upload page serves correctly
    Tool: Bash (curl)
    Preconditions: Photo server running
    Steps:
      1. Run `curl http://localhost:8765/`
      2. Verify HTML contains: "<title>AutoOS - Upload de Foto</title>"
      3. Verify HTML contains: input with accept="image/jpeg,image/png" and capture="environment"
    Expected Result: Mobile-friendly HTML page with file input and submit button
    Failure Indicators: Empty response, missing form elements, no viewport meta tag
    Evidence: .sisyphus/evidence/task-11-html-page.txt

  Scenario: JPEG upload succeeds and resizes
    Tool: Bash (curl)
    Preconditions: Photo server running, valid token, equipment exists with < 6 images
    Steps:
      1. Generate a test JPEG image (3000x2000 pixels, 2MB)
      2. Run `curl -X POST -F "photo=@test.jpg" "http://localhost:8765/upload?token={token}"`
      3. Verify response: `{"success": true, "message": "Foto salva com sucesso!"}`
      4. Query database: image should be stored with dimensions <= 1600px on longest side
    Expected Result: Image uploaded, resized, and saved to database
    Failure Indicators: Upload fails, image not resized, or database write error
    Evidence: .sisyphus/evidence/task-11-jpeg-upload.txt

  Scenario: Oversized file is rejected
    Tool: Bash (curl)
    Preconditions: Photo server running, valid token
    Steps:
      1. Create a test file > 3MB
      2. Run `curl -X POST -F "photo=@large.jpg" "http://localhost:8765/upload?token={token}"`
      3. Verify response: `{"success": false, "error": "Arquivo muito grande. Máximo 3MB."}`
    Expected Result: File rejected with Portuguese error message
    Failure Indicators: Large file accepted or generic error message
    Evidence: .sisyphus/evidence/task-11-oversized-rejection.txt
  ```

  **Commit**: YES
  - Message: `feat(photos): add phone upload HTML page and server-side image validation`
  - Files: `src-tauri/src/commands/photo_server.rs` (modified — added HTML and validation)
  - Pre-commit: `cargo check`

- [ ] 12. Gastos route + navigation + permission guard

  **What to do**:
  - Add route for `/gastos` in `src/App.tsx` (or router configuration file) with a `SensitiveRoute` wrapper that checks `VIEW_EXPENSES` permission
  - Add "Gastos" navigation item in the sidebar/navigation:
    - Position: after existing navigation items (appropriate location for financial data)
    - Icon: use `Receipt` or `DollarSign` icon from lucide-react
    - Label: "Gastos"
  - The route should only be visible/clickable when the active profile has `VIEW_EXPENSES` permission
  - Add the route guard pattern following existing `SensitiveRoute` or permission-based navigation hiding pattern from `useSensitiveAccess`
  - Update `src/types/index.ts` SensitiveAccessStatus interface if needed to include `can_view_expenses` computed property
  - Verify: navigating to `/gastos` without VIEW_EXPENSES shows permission dialog or hides the nav item

  **Must NOT do**:
  - Do NOT add the gastos route without permission check — VIEW_EXPENSES is ADMIN-only
  - Do NOT modify existing route structure or navigation order
  - Do NOT add gastos visibility to OPERADOR profiles by default

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Route and navigation addition following existing patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Gastos page being built)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 14
  - **Blocked By**: Task 8 (Gastos page component)

  **References**:

  **Pattern References**:
  - `src/App.tsx` or router configuration — Route registration pattern
  - Navigation/sidebar component — How nav items are rendered and permission-gated
  - `src/hooks/useSensitiveAccess.tsx:67-77` — `profileHasPermission` for conditional rendering

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Gastos nav item visible with VIEW_EXPENSES permission
    Tool: Playwright
    Preconditions: App running, ADMIN profile with VIEW_EXPENSES
    Steps:
      1. Login with ADMIN profile
      2. Verify "Gastos" navigation item is visible in sidebar
      3. Click "Gastos"
      4. Verify URL changes to /gastos and page loads with content
    Expected Result: Gastos nav item visible, page loads with cards/chart/table
    Failure Indicators: Nav item hidden, 404, or permission error
    Evidence: .sisyphus/evidence/task-12-gastos-nav-visible.png

  Scenario: Gastos nav item hidden without VIEW_EXPENSES permission
    Tool: Playwright
    Preconditions: App running, OPERADOR profile WITHOUT VIEW_EXPENSES
    Steps:
      1. Login with OPERADOR profile (no VIEW_EXPENSES)
      2. Verify "Gastos" navigation item is NOT visible
      3. Manually navigate to /gastos
      4. Verify permission dialog appears OR page is blocked
    Expected Result: Nav item hidden, direct URL access blocked
    Failure Indicators: Gastos visible without permission
    Evidence: .sisyphus/evidence/task-12-gastos-nav-hidden.png
  ```

  **Commit**: YES
  - Message: `feat(gastos): add route, navigation, and permission guard`
  - Files: `src/App.tsx` (or router), navigation component, `src/types/index.ts`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 13. Photo server lifecycle + Tauri event wiring

  **What to do**:
  - Wire the photo server lifecycle into the main Tauri app:
    - `start_photo_server` IPC command: spawns axum server via `tauri::async_runtime::spawn()`, stores `JoinHandle` and `ShutdownSignal` in `app.manage()` state
    - `stop_photo_server` IPC command: sends shutdown signal, waits for graceful shutdown (5 second timeout), removes state
  - Emit Tauri events from photo_server:
    - `photo-received` event: emitted after successful image save to database, payload includes `{ equipamento_id: i32, imagem_id: i32 }`
    - Frontend listens to `photo-received` event via `@tauri-apps/api/event` and refreshes the equipment image list
  - Add graceful shutdown to axum server using `tokio::sync::oneshot` channel:
    - Server checks for in-flight requests before shutting down
    - 5-second grace period for active uploads
  - Add auto-shutdown timer: 15 minutes of inactivity triggers automatic server stop and event emission
  - Handle edge cases:
    - Server already running: return error "Servidor de fotos já está ativo"
    - Port in use: try port+1 (8766), then port+2 (8767), give up after 3 attempts
    - App closing: stop server via `on_window_event` in main.rs

  **Must NOT do**:
  - Do NOT start the photo server on app launch — only on dialog open
  - Do NOT add authentication beyond the single-use token
  - Do NOT persist server state to database
  - Do NOT allow multiple simultaneous photo servers

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex lifecycle management, Tauri state, async shutdown, event emission
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on photo_server.rs and dialog)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 15
  - **Blocked By**: Tasks 10, 11

  **References**:

  **Pattern References**:
  - `src-tauri/src/main.rs:88-98` — `.setup()` closure pattern for state initialization
  - `src-tauri/src/main.rs` — `on_window_event` or similar for cleanup
  - Tauri 2.x state management: `app.manage()` for sharing state between commands
  - Tauri 2.x events: `app_handle.emit()` for frontend event emission

  **External References**:
  - Tauri 2.x events API: https://v2.tauri.app/develop/calling-rust/#events — Event emission pattern
  - axum graceful shutdown: https://docs.rs/axum/latest/axum/#graceful-shutdown — Using `tokio::sync::oneshot` for shutdown signal

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Server starts and stops cleanly
    Tool: Bash
    Preconditions: App running
    Steps:
      1. Call `start_photo_server` IPC command
      2. Verify server is listening on port 8765
      3. Call `stop_photo_server` IPC command
      4. Verify server is stopped (curl should fail)
    Expected Result: Server starts and stops without errors or resource leaks
    Failure Indicators: Port remains bound after stop, panic, or error messages
    Evidence: .sisyphus/evidence/task-13-server-lifecycle.txt

  Scenario: Photo-received event is emitted after upload
    Tool: Bash
    Preconditions: Photo server running, valid token
    Steps:
      1. Start frontend event listener for "photo-received"
      2. Upload a photo via curl to the local server
      3. Verify frontend receives "photo-received" event with equipamento_id and imagem_id
    Expected Result: Event emitted with correct payload
    Failure Indicators: No event, or event without required fields
    Evidence: .sisyphus/evidence/task-13-photo-received-event.txt

  Scenario: Duplicate server start is rejected
    Tool: Bash
    Preconditions: Photo server already running
    Steps:
      1. Call `start_photo_server` again while first server is still running
      2. Verify error message: "Servidor de fotos já está ativo"
    Expected Result: Second start is rejected with clear error message
    Failure Indicators: Second server starts on different port, or app crashes
    Evidence: .sisyphus/evidence/task-13-duplicate-server.txt

  Scenario: Auto-shutdown after 15 minutes of inactivity
    Tool: Bash
    Preconditions: Photo server running
    Steps:
      1. Start photo server
      2. Wait 15 minutes without any uploads (use shorter timeout for testing: 2 minutes)
      3. Verify server has auto-stopped
      4. Verify port 8765 is free
    Expected Result: Server auto-stops after inactivity timeout
    Failure Indicators: Server continues running indefinitely
    Evidence: .sisyphus/evidence/task-13-auto-shutdown.txt
  ```

  **Commit**: YES
  - Message: `feat(photos): wire photo server lifecycle and Tauri events`
  - Files: `src-tauri/src/commands/photo_server.rs`, `src-tauri/src/main.rs`, `src/components/equipamentos/PhotoUploadDialog.tsx`
  - Pre-commit: `cargo check && npx tsc --noEmit`

- [ ] 14. Gastos feature end-to-end QA

  **What to do**:
  - Execute comprehensive QA for the Gastos feature covering all scenarios:
  - **CRUD Operations**: Create/read/update gastos fixos and gastos variáveis
  - **Permission Gate**: Verify ADMIN can access, OPERADOR without VIEW_EXPENSES cannot
  - **Summary Cards**: Correct totals for empty month, month with data, and month with only fixed or only variable expenses
  - **Chart**: Line chart renders with empty state (no data), data for 1 month, and data for 12 months
  - **Table Filtering**: Filter by category, date range, and text search
  - **Edge Cases**:
    - Empty month (no data) — cards show R$ 0,00
    - Negative value rejection (valor must be > 0)
    - Duplicate nome for gastos_fixos (UNIQUE constraint)
    - Future date validation for gastos_variáveis
    - Currency formatting (BRL with pt-BR locale)
  - **Navigation**: Gastos nav item visible with permission, hidden without
  - Capture evidence for each scenario in `.sisyphus/evidence/task-14-{scenario-slug}.{ext}`

  **Must NOT do**:
  - Do NOT modify code — this is QA only, report issues
  - Do NOT skip any scenario — all must be run
  - Do NOT mark as verified without evidence

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Detailed manual QA execution with evidence capture
  - **Skills**: ["playwright"]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 15)
  - **Parallel Group**: Wave 5
  - **Blocks**: F3 (final QA cross-task testing)
  - **Blocked By**: Task 12 (Gastos route + permission guard)

  **References**:

  **Pattern References**:
  - All Gastos tasks (8, 12) — Implementation to verify
  - `.sisyphus/evidence/` — Evidence directory for screenshots and logs

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full CRUD workflow for gastos fixos
    Tool: Playwright
    Preconditions: App running, ADMIN profile
    Steps:
      1. Navigate to /gastos
      2. Create a new gasto fixo: nome="Aluguel Sala", valor=2500, vencimento_dia=10, categoria="Aluguel"
      3. Verify card totals update
      4. Edit the gasto fixo: change valor to 2800
      5. Verify updated value in table
      6. Deactivate the gasto fixo (toggle ativo=false)
      7. Verify inactive items still appear but don't count in totals
    Expected Result: Full CRUD cycle works with correct UI updates
    Failure Indicators: Any step fails, data not persisted, or totals incorrect
    Evidence: .sisyphus/evidence/task-14-crud-fixo.png

  Scenario: Empty month shows zero totals
    Tool: Playwright
    Preconditions: App running, no gastos_variáveis for a future month
    Steps:
      1. Navigate to /gastos
      2. Select a future month with no variable expenses
      3. Verify summary cards show: Total Fixo = sum of active gastos fixos, Total Variável = R$ 0,00, Total Geral = Total Fixo
    Expected Result: Correct display with zero variable, fixed totals still shown
    Failure Indicators: NaN values, missing cards, or wrong totals
    Evidence: .sisyphus/evidence/task-14-empty-month.png

  Scenario: Permission gate blocks OPERADOR without VIEW_EXPENSES
    Tool: Playwright
    Preconditions: App running, OPERADOR profile without VIEW_EXPENSES
    Steps:
      1. Login as OPERADOR
      2. Verify "Gastos" nav item is NOT visible
      3. Manually navigate to /gastos
      4. Verify access is blocked (permission dialog or redirect)
    Expected Result: No access to gastos data for unauthorized profiles
    Failure Indicators: Gastos accessible without permission
    Evidence: .sisyphus/evidence/task-14-permission-block.png
  ```

  **Commit**: NO (QA task, no code changes)

- [ ] 15. Photo feature end-to-end QA

  **What to do**:
  - Execute comprehensive QA for the Photo capture feature covering all scenarios:
  - **QR Code Generation**: Verify QR code renders with correct URL format
  - **Server Lifecycle**: Start, status check, stop, auto-shutdown
  - **Upload Flow**: Phone browser opens HTML page, selects photo, upload succeeds, image appears in equipment gallery
  - **Permission**: Verify STOCK_CONTROL permission required on desktop side
  - **Edge Cases**:
    - 6-image limit reached → error "Limite de 6 imagens atingido"
    - Oversized file (>3MB) → Portuguese error message
    - Invalid MIME type (webp, gif, bmp) → rejected with error
    - Expired token (after 10 min) → "Token expirado" message
    - Photo server port occupied → fallback to next port or error
    - HEIC file from iPhone → rejected (not JPEG/PNG)
    - Equipment deleted mid-flow → FK constraint handles gracefully
  - Capture evidence for each scenario in `.sisyphus/evidence/task-15-{scenario-slug}.{ext}`

  **Must NOT do**:
  - Do NOT modify code — this is QA only, report issues
  - Do NOT skip any scenario — all must be run
  - Do NOT mark as verified without evidence

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Detailed manual QA with curl commands and desktop testing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 14)
  - **Parallel Group**: Wave 5
  - **Blocks**: F3 (final QA cross-task testing)
  - **Blocked By**: Task 13 (Photo server lifecycle + events)

  **References**:

  **Pattern References**:
  - All Photo tasks (7, 9, 10, 11, 13) — Implementation to verify
  - `.sisyphus/evidence/` — Evidence directory for screenshots and logs

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Complete photo upload flow (desktop + simulated phone)
    Tool: Bash + Playwright
    Preconditions: App running, equipment exists with < 6 images
    Steps:
      1. Open equipment detail in desktop app
      2. Click "Adicionar Foto via Celular"
      3. Verify QR code dialog appears with valid URL
      4. Use curl to simulate phone upload: `curl -X POST -F "photo=@test.jpg" "http://localhost:8765/upload?token={token}"`
      5. Verify desktop receives photo-received event
      6. Verify image appears in equipment gallery
    Expected Result: Photo uploaded via HTTP, saved to database, displayed in gallery
    Failure Indicators: Upload fails, database not updated, or gallery not refreshed
    Evidence: .sisyphus/evidence/task-15-e2e-upload.png

  Scenario: 6-image limit enforcement
    Tool: Bash
    Preconditions: Equipment with 6 existing images
    Steps:
      1. Generate a token for the equipment
      2. Upload a 7th photo via curl
      3. Verify error response: "Limite de 6 imagens atingido para este equipamento"
    Expected Result: Upload rejected with clear limit message
    Failure Indicators: 7th image accepted
    Evidence: .sisyphus/evidence/task-15-image-limit.txt

  Scenario: Expired token rejection
    Tool: Bash
    Preconditions: Token generated > 10 minutes ago (or use short TTL for testing)
    Steps:
      1. Generate token
      2. Wait for token to expire (use 1-minute TTL for testing)
      3. Attempt upload with expired token
      4. Verify error response about expired token
    Expected Result: Expired token rejected
    Failure Indicators: Expired token accepted for upload
    Evidence: .sisyphus/evidence/task-15-expired-token.txt
  ```

  **Commit**: NO (QA task, no code changes)

  **What to do**:
  - Create `src-tauri/src/commands/gastos.rs` with 6 IPC commands following existing patterns in `clientes.rs` and `produtos.rs`:
    1. `listar_gastos_fixos()` — returns all active fixed expenses, ordered by categoria, nome
    2. `criar_gasto_fixo(input: GastoFixoInput)` — INSERT with `require_permission(PERMISSION_VIEW_EXPENSES)?`, validates nome uniqueness and valor > 0
    3. `atualizar_gasto_fixo(id: i32, input: GastoFixoInput)` — UPDATE with permission check
    4. `listar_gastos_variaveis(mes: i32, ano: i32)` — returns variable expenses for a given month/year, using `DATE_TRUNC('month', data)` filtering
    5. `criar_gasto_variavel(input: GastoVariavelInput)` — INSERT with permission check
    6. `resumo_mensal(mes: i32, ano: i32)` — returns `GastoResumoMensal` with total_fixo (sum of active gastos_fixos), total_variavel (sum of gastos_variaveis for the month), total_geral, and por_categoria breakdown
  - Add `pub mod gastos;` to `src-tauri/src/commands/mod.rs`
  - Register all 6 commands in `src-tauri/src/main.rs` invoke_handler
  - All commands must call `require_permission(PERMISSION_VIEW_EXPENSES)?` for both read AND write operations
  - Use `GastoFixoInput`/`GastoVariavelInput` structs from Task 1

  **Must NOT do**:
  - Do NOT add EDIT_EXPENSES or other separate permissions — VIEW_EXPENSES covers all operations
  - Do NOT add auto-generation from fixed to variable expenses
  - Do NOT add export/PDF/CSV commands
  - Do NOT add FK to equipment/client — expenses are global
  - Do NOT use dynamic category tables — use fixed string validation against the 6 seed categories

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 6 IPC commands with permission checks, validation, SQL queries, and error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src-tauri/src/commands/clientes.rs` — Full CRUD command pattern with permission checks
  - `src-tauri/src/commands/produtos.rs:1-50` — Permission check pattern with `require_permission`
  - `src-tauri/src/commands/equipamentos.rs:171` — `require_permission(PERMISSION_FINANCIAL_ACTIONS)?` exact usage
  - `src-tauri/src/commands/types.rs:48-60` — Input struct pattern (GastoFixoInput follows this)
  - `src-tauri/src/db.rs` — `get_pool()` pattern for database access

  **API/Type References**:
  - `src-tauri/src/commands/auth.rs:474-503` — `require_permission` function signature and error messages
  - `src-tauri/src/commands/gastos.rs` (new file) — This IS the file being created

  **Test References**:
  - `src-tauri/src/bin/p1_critical_integration.rs` — Permission DENIED vs ALLOWED pattern

  **WHY Each Reference Matters**:
  - `clientes.rs` — Canonical CRUD pattern with all validation, error handling, and permission checks
  - `produtos.rs` — STOCK_CONTROL permission pattern parallels VIEW_EXPENSES usage
  - `auth.rs:474-503` — Must use exact `require_permission` function with custom error messages

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All 6 gastos commands compile and register
    Tool: Bash
    Preconditions: gastos.rs created, mod.rs and main.rs updated
    Steps:
      1. Run `cargo check` from src-tauri directory
      2. Verify zero compilation errors
    Expected Result: All 6 commands compile and are registered in invoke_handler
    Failure Indicators: Any Rust compilation errors
    Evidence: .sisyphus/evidence/task-4-cargo-check.txt

  Scenario: Permission gate blocks unauthorized access
    Tool: Bash
    Preconditions: App running, OPERADOR profile without VIEW_EXPENSES
    Steps:
      1. Start app with `npm run tauri dev`
      2. Call `listar_gastos_fixos` with an OPERADOR profile that lacks VIEW_EXPENSES
      3. Verify error message contains "não possui permissão" or "VIEW_EXPENSES"
    Expected Result: Command returns permission error, no data leaked
    Failure Indicators: Command returns data without permission
    Evidence: .sisyphus/evidence/task-4-permission-gate.txt

  Scenario: resumo_mensal returns correct totals for a month with data
    Tool: Bash
    Preconditions: Database has gastos_fixos and gastos_variaveis entries
    Steps:
      1. INSERT test data: 2 gastos_fixos (R$ 1500 + R$ 300) and 3 gastos_variaveis (R$ 200 + R$ 50 + R$ 100)
      2. Call `resumo_mensal(6, 2026)` with ADMIN profile
      3. Verify response: total_fixo = 1800, total_variavel = 350, total_geral = 2150
    Expected Result: Correct monthly totals with category breakdown
    Failure Indicators: Totals don't match, categories missing, or permission error
    Evidence: .sisyphus/evidence/task-4-resumo-mensal.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(gastos): add Rust IPC commands for expenses`
  - Files: `src-tauri/src/commands/gastos.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/main.rs`
  - Pre-commit: `cargo check`

- [ ] 5. Gastos hook + db service layer

  **What to do**:
  - Create `src/hooks/useGastos.ts` following pattern from `src/hooks/useServicos.ts` (or similar hooks):
    - `useGastosFixos()` — fetches all active fixed expenses
    - `useGastosVariaveis(mes: number, ano: number)` — fetches variable expenses for month/year
    - `useResumoMensal(mes: number, ano: number)` — fetches monthly summary
    - Mutations for criar/atualizar gasto fixo and criar gasto variavel
  - Add IPC bridge functions to `src/lib/db.ts`:
    - `listarGastosFixos()` → `invoke("listar_gastos_fixos")`
    - `criarGastoFixo(input)` → `invoke("criar_gasto_fixo", { input })`
    - `atualizarGastoFixo(id, input)` → `invoke("atualizar_gasto_fixo", { id, input })`
    - `listarGastosVariaveis(mes, ano)` → `invoke("listar_gastos_variaveis", { mes, ano })`
    - `criarGastoVariavel(input)` → `invoke("criar_gasto_variavel", { input })`
    - `resumoMensal(mes, ano)` → `invoke("resumo_mensal", { mes, ano })`
  - Ensure all IPC function names match exactly with Rust command names (camelCase to snake_case mapping)

  **Must NOT do**:
  - Do NOT add delete commands (not in scope)
  - Do NOT add export/PDF functions
  - Do NOT add client-side validation beyond what zod provides (server validates)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward IPC bridge and hook creation following existing patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 6, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/hooks/useServicos.ts` or `src/hooks/useClientes.ts` — Hook pattern with query/mutation
  - `src/lib/db.ts:160-174` — IPC invoke pattern for equipment images

  **API/Type References**:
  - `src/types/index.ts` — GastoFixo, GastoVariavel, GastoResumoMensal types from Task 1

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Hook and service layer compile without errors
    Tool: Bash
    Preconditions: Types and hooks created
    Steps:
      1. Run `npx tsc --noEmit`
    Expected Result: Zero type errors
    Failure Indicators: Any TypeScript errors related to gastos hooks or db service
    Evidence: .sisyphus/evidence/task-5-tsc-check.txt

  Scenario: IPC function names match Rust commands
    Tool: Bash
    Preconditions: Both Rust and TypeScript sides created
    Steps:
      1. Grep all invoke() calls in db.ts for "gastos" or "resumo_mensal"
      2. Grep all #[tauri::command] functions in gastos.rs
      3. Compare function name mappings (camelCase in TS ↔ snake_case in Rust)
    Expected Result: Every TypeScript invoke name has a matching Rust #[tauri::command]
    Failure Indicators: Mismatched names, missing commands
    Evidence: .sisyphus/evidence/task-5-ipc-name-match.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(gastos): add hooks and db service for expenses`
  - Files: `src/hooks/useGastos.ts`, `src/lib/db.ts`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 6. Rust adicionar_imagem_equipamento command

  **What to do**:
  - Add a new `adicionar_imagem_equipamento` command to `src-tauri/src/commands/equipamento_imagens.rs`:
    - Takes `equipamento_id: i32` and `imagem: EquipamentoImagemInput`
    - Calls `require_permission(PERMISSION_STOCK_CONTROL)?` (same permission as existing image operations)
    - Checks current image count for the equipment: if count >= MAX_IMAGES_PER_EQUIPMENT (6), returns error "Limite de 6 imagens atingido para este equipamento"
    - Validates MIME type is JPEG or PNG (matching DB CHECK constraint)
    - Validates tamanho_bytes <= MAX_IMAGE_BYTES (3MB)
    - INSERTs the single image (NOT a replace-all pattern)
    - Returns the inserted `EquipamentoImagemRow`
  - Register the new command in `src-tauri/src/main.rs` invoke_handler
  - Add corresponding IPC bridge to `src/lib/db.ts`: `adicionarImagemEquipamento(equipamentoId, imagem)`
  - This command will be called by the photo server after a successful upload to save the image to the database

  **Must NOT do**:
  - Do NOT use the `substituir` (replace-all) pattern — this is a single-image INSERT
  - Do NOT add image deletion or reordering commands
  - Do NOT change the existing `substituir_imagens_equipamento` command
  - Do NOT change MAX_IMAGES_PER_EQUIPMENT or MAX_IMAGE_BYTES constants

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding existing image handling patterns and careful INSERT logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 13
  - **Blocked By**: None (independent of gastos work)

  **References**:

  **Pattern References**:
  - `src-tauri/src/commands/equipamento_imagens.rs:7-8` — MAX_IMAGES_PER_EQUIPMENT and MAX_IMAGE_BYTES constants
  - `src-tauri/src/commands/equipamento_imagens.rs:82-103` — `listar_imagens_equipamento` command (query pattern)
  - `src-tauri/src/commands/equipamento_imagens.rs:105-198` — `substituir_imagens_equipamento` command (validation + INSERT pattern)
  - `src-tauri/src/commands/types.rs:48-60` — EquipamentoImagemInput struct

  **API/Type References**:
  - `src-tauri/src/commands/produtos.rs:176` — `require_permission(PERMISSION_STOCK_CONTROL)?` exact usage for image operations
  - `src/lib/db.ts:160-174` — IPC bridge pattern for image commands

  **WHY Each Reference Matters**:
  - `equipamento_imagens.rs:105-198` — The existing `substituir` command shows the exact validation pattern (MIME type, size, category) that the new INSERT command must follow
  - `equipamento_imagens.rs:7-8` — Must reuse the exact same constants for limits

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Single image insertion succeeds
    Tool: Bash
    Preconditions: Equipment exists in database, command registered
    Steps:
      1. Run `cargo check` — zero errors
      2. Start app, call `adicionar_imagem_equipamento` with a valid equipment_id and small test image
      3. Verify the image appears in equipamento_imagens table with correct MIME type and size
    Expected Result: Image inserted successfully, returns EquipamentoImagemRow
    Failure Indicators: Compilation errors, INSERT failure, or constraint violation
    Evidence: .sisyphus/evidence/task-6-single-insert.txt

  Scenario: 7th image is rejected with limit error
    Tool: Bash
    Preconditions: Equipment with 6 existing images
    Steps:
      1. Call `adicionar_imagem_equipamento` on an equipment that already has 6 images
      2. Verify error message contains "Limite de 6 imagens"
    Expected Result: Command returns error, no 7th image inserted
    Failure Indicators: 7th image accepted, or generic error without limit message
    Evidence: .sisyphus/evidence/task-6-image-limit.txt

  Scenario: Invalid MIME type is rejected
    Tool: Bash
    Preconditions: Equipment with < 6 images
    Steps:
      1. Call `adicionar_imagem_equipamento` with mime_type = "image/webp"
      2. Verify error message mentions invalid MIME type
    Expected Result: Command rejects with validation error
    Failure Indicators: WebP image accepted (violates DB constraint)
    Evidence: .sisyphus/evidence/task-6-mime-validation.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(photos): add adicionar_imagem_equipamento IPC command`
  - Files: `src-tauri/src/commands/equipamento_imagens.rs`, `src-tauri/src/main.rs`, `src/lib/db.ts`
  - Pre-commit: `cargo check && npx tsc --noEmit`

- [ ] 7. Rust photo_server.rs — axum server + routes + token store

  **What to do**:
  - Create `src-tauri/src/commands/photo_server.rs` with the following components:
    1. **Token Store**: `Mutex<HashMap<String, TokenData>>` where TokenData has `{ equipamento_id: i32, categoria: String, expires_at: Instant, used: bool }`. Generate tokens with UUID v4, 10-minute TTL, single-use (mark as used after first successful upload)
    2. **API Routes** (using axum::Router):
       - `GET /` — Serves the embedded HTML upload form (from `const HTML_UPLOAD_PAGE`)
       - `POST /upload` — Accepts multipart form data (field: "photo"), validates token from query param, validates MIME type (JPEG/PNG only), validates size (<=3MB), resizes image using `image` crate (max 1600px longest side, JPEG 82% quality), calls `adicionar_imagem_equipamento` via Tauri state, returns JSON success/error
       - `GET /status/{token}` — Returns whether token is valid (for frontend polling)
    3. **CORS**: Use `tower_http::cors::CorsLayer` to allow requests from any origin (phone browser on different IP)
    4. **Server lifecycle functions**:
       - `start_photo_server(port: u16)` — Binds to `0.0.0.0:port`, returns server address. Uses `tauri::async_runtime::spawn()` for the axum server. Stores `JoinHandle` in Tauri app state.
       - `stop_photo_server()` — Graceful shutdown via `tokio::sync::oneshot` signal
       - `generate_upload_token(equipamento_id: i32, categoria: String)` — Creates token, returns UUID string
       - `invalidate_token(token: &str)` — Marks token as used
    5. **LAN IP detection**: Function `get_lan_ip()` that finds the first non-loopback IPv4 address using `local_ip` crate or manual network interface enumeration
  - Add `pub mod photo_server;` to `src-tauri/src/commands/mod.rs`
  - Register IPC commands: `start_photo_server`, `stop_photo_server`, `generate_upload_token` in `main.rs`
  - The HTML upload page should be a simple form with: title "AutoOS - Upload de Foto", file input with `accept="image/jpeg,image/png"`, a submit button, and a status message area. Mobile-friendly CSS. After successful upload, show "Foto enviada com sucesso!" message. After error, show Portuguese error message.

  **Must NOT do**:
  - Do NOT add HTTPS/TLS — HTTP only for MVP
  - Do NOT add camera API (`getUserMedia`) — gallery upload only
  - Do NOT add multi-file upload — one photo at a time
  - Do NOT add progress bar or retry mechanism
  - Do NOT add authentication beyond the single-use token
  - Do NOT persist tokens to database — in-memory only (Mutex<HashMap>)
  - Do NOT start the photo server on app launch — start only when dialog opens

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex module with HTTP server, token management, image processing, and state management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5, 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: Task 3 (Cargo deps)

  **References**:

  **Pattern References**:
  - `src-tauri/src/commands/equipamento_imagens.rs:105-198` — Image validation pattern (MIME type check, size check)
  - `src-tauri/src/commands/equipamento_imagens.rs:7-8` — MAX_IMAGES_PER_EQUIPMENT and MAX_IMAGE_BYTES constants
  - `src-tauri/src/main.rs:88-98` — `.setup()` closure pattern for spawning async tasks
  - `src-tauri/src/commands/auth.rs` — `require_permission` pattern (use STOCK_CONTROL for photo operations)

  **API/Type References**:
  - `src-tauri/src/commands/types.rs:48-60` — `EquipamentoImagemInput` struct (reuse for upload data)
  - `src-tauri/src/db.rs` — `get_pool()` for database access

  **External References**:
  - axum 0.7 docs: https://docs.rs/axum/0.7 — Router, routing, extractors, state management
  - qrcode crate: https://docs.rs/qrcode — QR code generation (SVG output format)
  - image crate: https://docs.rs/image/0.25 — Image resize, crop, format conversion

  **WHY Each Reference Matters**:
  - `equipamento_imagens.rs:105-198` — Must use identical validation logic for MIME type and size
  - `main.rs:88-98` — Pattern for spawning async tasks from Tauri setup
  - axum docs — Need to understand Router setup, multipart extraction, and state sharing

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Photo server starts and serves HTML
    Tool: Bash
    Preconditions: photo_server.rs created and registered
    Steps:
      1. Run `cargo check` — must pass
      2. Start app, call `start_photo_server` IPC command with port 8765
      3. Run `curl http://localhost:8765/` — should return HTML upload form
    Expected Result: Server starts, serves HTML page with file upload form
    Failure Indicators: Port binding error, HTML not returned, or missing CORS headers
    Evidence: .sisyphus/evidence/task-7-server-start.txt

  Scenario: Token generation and validation
    Tool: Bash
    Preconditions: Photo server running
    Steps:
      1. Call `generate_upload_token` with equipamento_id=1, categoria="ENTRADA"
      2. Run `curl http://localhost:8765/status/{token}` — should return {"valid": true}
      3. Wait 10 minutes (or test with shorter TTL during dev)
      4. Run `curl http://localhost:8765/status/{token}` — should return {"valid": false}
    Expected Result: Token starts valid, becomes invalid after TTL
    Failure Indicators: Token always valid or always invalid
    Evidence: .sisyphus/evidence/task-7-token-validation.txt

  Scenario: Invalid MIME type is rejected
    Tool: Bash
    Preconditions: Photo server running, valid token
    Steps:
      1. Generate a token
      2. Run `curl -X POST -F "photo=@test.webp" http://localhost:8765/upload?token={token}`
      3. Verify response contains error about invalid MIME type
    Expected Result: Upload rejected with Portuguese error message about invalid format
    Failure Indicators: WebP file accepted
    Evidence: .sisyphus/evidence/task-7-mime-rejection.txt

  Scenario: Server stops gracefully
    Tool: Bash
    Preconditions: Photo server running
    Steps:
      1. Call `stop_photo_server` IPC command
      2. Run `curl http://localhost:8765/` — should fail (connection refused)
    Expected Result: Server stops, port is freed
    Failure Indicators: Server continues running or port remains bound
    Evidence: .sisyphus/evidence/task-7-server-stop.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(photos): add photo server module with axum, tokens, and image validation`
  - Files: `src-tauri/src/commands/photo_server.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/main.rs`
  - Pre-commit: `cargo check`

- [ ] 3. Cargo.toml dependencies for photo feature

  **What to do**:
  - Add the following dependencies to `src-tauri/Cargo.toml`:
    - `axum = "0.7"` (HTTP server framework)
    - `tower-http = { version = "0.6", features = ["cors"] }` (CORS middleware)
    - `qrcode = "0.14"` (QR code generation — verify latest compatible version)
    - `image = "0.25"` (server-side image resize/validation — verify latest compatible version)
    - `multipart` feature for axum: add `axum = { version = "0.7", features = ["multipart"] }`
  - Verify compilation: `cargo check` must pass with all new dependencies
  - Verify no version conflicts with existing `tokio = { version = "1", features = ["full"] }`
  - Note: `tokio` is already present and compatible with axum 0.7+

  **Must NOT do**:
  - Do NOT add `tiny_http` — axum is the chosen HTTP server framework
  - Do NOT add HTTPS/TLS crates (no `rustls` or `openssl` features) — HTTP-only for MVP
  - Do NOT update existing dependency versions unless there's a conflict
  - Do NOT add `reqwest` features for multipart — axum handles upload parsing

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding dependencies to Cargo.toml and verifying compilation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 7, 9
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src-tauri/Cargo.toml` — Current dependency format and versions

  **External References**:
  - axum 0.7 crate docs: https://docs.rs/axum/0.7 — Verify API compatibility
  - qrcode crate: https://docs.rs/qrcode — Check output format (SVG vs PNG)
  - image crate: https://docs.rs/image/0.25 — Verify resize API

  **WHY Each Reference Matters**:
  - Current `Cargo.toml` — Must follow exact format pattern (inline table vs separate)
  - `tokio` version — axum 0.7 requires tokio 1.x, which is already present
  - `qrcode` crate — Output format (SVG) determines how to render in React (inline SVG vs base64 PNG)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Dependencies compile without conflicts
    Tool: Bash
    Preconditions: Cargo.toml updated
    Steps:
      1. Run `cargo check` from src-tauri directory
      2. Verify zero compilation errors
      3. Verify `Cargo.lock` is updated with new dependencies
    Expected Result: `cargo check` succeeds, all 5 new crates appear in Cargo.lock
    Failure Indicators: Version conflict errors, missing features, compile errors
    Evidence: .sisyphus/evidence/task-3-cargo-check.txt

  Scenario: qrcode crate produces usable output
    Tool: Bash
    Preconditions: Dependencies installed
    Steps:
      1. Create a minimal Rust test that generates a QR code string as SVG using the qrcode crate
      2. Verify it compiles and produces valid SVG output
    Expected Result: QR code generation produces valid SVG string
    Failure Indicators: Compilation errors, missing features, incompatible API
    Evidence: .sisyphus/evidence/task-3-qrcode-test.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(photos): add cargo dependencies for photo server`
  - Files: `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
  - Pre-commit: `cargo check`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `cargo check` + `npx tsc --noEmit`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify Gastos.tsx is under 400 lines or properly componentized.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Types [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: Gastos tab behind permission, photo flow from desktop to phone. Test edge cases: empty month, 6-image limit, expired token, HEIC rejection. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT Have" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(gastos): add migration, types, and permission foundation` — migration SQL, types, auth changes
- **Wave 2**: `feat(gastos): add backend IPC commands` — gastos.rs, hook, db service; `feat(photos): add image insert command` — adicionar_imagem_equipamento; `feat(photos): add photo server module` — photo_server.rs, Cargo deps
- **Wave 3**: `feat(gastos): add expenses page with chart and table` — Gastos page; `feat(photos): add QR code and upload UI` — dialog, phone HTML
- **Wave 4**: `feat(gastos): add route and permission guard` — routing; `feat(photos): wire server lifecycle and events` — integration
- **Wave 5**: `test(gastos): end-to-end QA` — evidence; `test(photos): end-to-end QA` — evidence

---

## Success Criteria

### Verification Commands
```bash
cd src-tauri && cargo check         # Expected: no errors
npx tsc --noEmit                     # Expected: no errors
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `cargo check` passes
- [ ] `npx tsc --noEmit` passes
- [ ] Gastos tab accessible with VIEW_EXPENSES permission only
- [ ] Photo upload works via local HTTP server and QR code