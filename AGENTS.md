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
│   └── .env.example              # Template local; .env real nunca é versionado/bundled
├── .claude/agents/               # Subagentes do Claude Code (modelo fixado por agente)
├── .cursor/rules/                # Regras do Cursor (autoos.mdc aponta para este arquivo)
├── CLAUDE.md                     # Só Claude Code: modelo/effort e subagentes
├── .github/
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
| Profiles, first access, tour | `src/pages/Perfil.tsx`, `src/components/perfil/`, `src/components/tour/`, `src/lib/tour-steps.ts` + `auth.rs` + `0041_perfil_personalizacao_primeiro_acesso.sql` | Admin creates a profile and gets a one-time access code (only its Argon2 hash in `codigos_primeiro_acesso`; 24h, single use, one open code per profile, revoked after 5 wrong guesses counted in the database, consumed only after the PIN is stored in the keyring). The person redeems it on each computer and creates their own PIN there. Name/icon/color/theme, the mandatory professional email (`email_profissional`) and the "faz atendimento técnico" flag (`atende_tecnico`) live in `security_profiles`. Tour steps per permission in `tour-steps.ts`; `tour_permissoes_vistas` drives the "what's new" tour |
| Database | `db.rs` + `migrations/` | sqlx runtime queries only (no `query!` macros) |
| PDF generation | `src/lib/pdf-service.ts` | jsPDF + autotable, 1211 lines with BMITAG branding |
| Email/WhatsApp | `src/lib/email-service.ts`, `whatsapp-service.ts` | SMTP + Evolution API. Management CC `medeiros@bmitag.com.br` only for the BMITAG company (`copia_gerencia_da_empresa`) |
| Customer portal (status.bmitag.com.br) | `src/public-status/` + `supabase/functions/portal-cliente/` + `0035_portal_cliente.sql` + `portal_cliente.rs` | Login by CPF/CNPJ + per-contact password (no OTP since 0038), per-company toggles (`portal_config_empresa`), server-side budget effectuation. See `docs/PORTAL_CLIENTE.md` |
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
cargo run --manifest-path src-tauri/Cargo.toml --bin p1_photo_integration        # HTTP de fotos (JPEG, HEIC, até 3) sem banco
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
- **Conexão do release Windows** — `AUTOOS_DATABASE_URL` vem de GitHub Secret e deve usar Supavisor Session na porta 5432. `src-tauri/.env` é apenas local, ignorado pelo Git e nunca incluído no bundle.
- **Migrations** are sequential in `src-tauri/migrations/`. New schema changes always get a new file (`0011_...`, `0012_...`).
- **sqlx uses runtime queries only** — `sqlx::query("...")`, `sqlx::query_as::<_, RowType>("...")`, `sqlx::QueryBuilder`. **No `query!` / `query_as!` macros, no `.sqlx/` offline mode.** SQL errors are only caught at runtime, not by `cargo check`.
- **Database init is bounded** — `main.rs` calls `tauri::async_runtime::block_on(db::init_database())` in `.setup()`, but sqlx uses an explicit 6s acquire timeout and at most one retry for transient network errors. If it fails, the app continues in configuration mode with a sanitized cause.
- **Global singleton pool** — `static POOL: Mutex<Option<PgPool>>`. Not injected via Tauri State.
- **Concurrency control** — optimistic locking via `atualizado_em` timestamp. UPDATE includes `WHERE atualizado_em = $token`. If no rows affected → "Conflito de concorrência".
- **Financial permission gating** — `require_permission(PERMISSION_FINANCIAL_ACTIONS)` required for: status changes to APROVADO/REPROVADO/ENTREGUE/ORCAMENTO_VENCIDO, any `valor_orcamento`/`prazo_aprovacao`/`valor_final` changes, verification cost fields. Exception: `PERMISSION_PREPARE_QUOTES` ("Elaborar e enviar orçamentos") may prepare a quote that is not yet decided (RECEBIDO, EM_VERIFICACAO, VERIFICADO, AGUARDANDO_APROVACAO), including VERIFICADO/AGUARDANDO_APROVACAO → AGUARDANDO_APROVACAO and `valor_orcamento`/`prazo_aprovacao`/verification cost edits in those statuses; it never covers APROVADO/REPROVADO/ENTREGUE/ORCAMENTO_VENCIDO, `valor_final` or corrections.
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
- **No Zustand stores exist in `src/`** — all state is React local state + `SensitiveAccessProvider` Context.
- **Forms** use React Hook Form + Zod (`zodResolver`). `validations.ts` has custom CPF/CNPJ digit-verifier algorithms (not just regex).
- **shadcn/ui** components in `src/components/ui/` — lightly customized, kept close to original. `cn()` from `lib/utils.ts` used everywhere.
- **Sensitive routes** use `<SensitiveRoute>` wrapper component (renders lock screen if unauthorized), not route guards in `App.tsx` logic.
- **Boot splash** — every launch plays the BMI TAG opening (`src/components/opening/BmiTagOpening.tsx`, via `BootSplash`). Its own duration (2450 ms; 220 ms with reduced motion) is the minimum splash time; there is no separate timer and no "first boot of the day" variant. The PIN/profile dialog waits for `bootAnimationComplete` (`BootUi.tsx`), capped at 20 s. See `docs/ABERTURA_BMITAG.md`.
- **Lists remember their state** — filter, search, sort and page use `useEstadoLembrado` (sessionStorage, cleared when the app closes) and `usePrimeiraPaginaAoFiltrar` (page 1 only when the filter changes). New list screens follow the same pattern.
- **Global search and shortcuts** — `Layout` mounts `BuscaGlobal` (Ctrl+K: OS, clients, supplies, screens) and `useAtalhosGlobais` (Ctrl+K search, Alt+N new entry, Alt+V new sale quote, `/` page search, Ctrl+/ shortcut list in `src/lib/atalhos.ts`). No shortcut fires with a modal open; the bare `/` never fires inside a text field. Keys used inside one screen (Esc, Enter, arrows) are shown on that screen, not in the list. The equipment status filter accepts several statuses (Ctrl+click; comma-separated list to the backend).
- **Data router** — `App.tsx` uses `createBrowserRouter` with a catch-all route that renders the usual `<Routes>` tree (`RoteadorDoApp`), so `useBlocker` works. Keep declaring routes in that tree.
- **Leaving half-filled forms** — `useAvisoAoSair(sujo, saidaLivre?)` asks "Sair sem salvar?" on menu, Ctrl+K or back navigation; call `liberarProximaSaida()` right before navigating after a successful save. The screen's own exit buttons (back arrow, Esc, a Cancelar marked "(Esc)") call `sairComAviso(sair)`: clean, `sair` runs at once; dirty, the same dialog opens and `sair` runs (with the next navigation released) only after "Sair sem salvar". Never call `liberarProximaSaida()` on an exit that was not a save or a confirmed discard. Used by OS edit, budget adjustment (Ajuste de orçamento), Verificação técnica, VendaFormulario, Balcão quick entry and Suporte. Exceptions by design: Nova entrada (the draft keeps everything; Cancelar discards with "Desfazer") and the Verificação técnica Cancelar (direct discard). Outside a data router (unit tests with `MemoryRouter`) only the navigation blocker is off; `sairComAviso` still asks.
- **Autosaved drafts** — `useRascunho(chave)` keeps form fields in localStorage on this computer (no photos). Nova entrada restores the draft with "Rascunho de … recuperado · Começar do zero"; Esc/X/navigation keep it, Cancelar discards it with a "Desfazer" toast, saving clears it.
- **Undo** — only for actions that are really reversible and send nothing outside (discarding a Nova entrada, deactivating a catalog service). Never for status changes, messages, portal or financial actions.
- **Batch actions on equipment** — `useAcoesEmLote` + `AcoesEmLote`: export selected (CSV), download each service order PDF (`OrdemServico_<id>_<cliente>.pdf`, same publication path as the single download), resend the "ready" WhatsApp only for OS in PRONTO (queued requests counted apart; uncertain sends are reported, never retried), and move only to `ETAPAS_EM_LOTE` (EM_VERIFICACAO, AGUARDANDO_PECA, EM_MANUTENCAO) when `getProximosStatus` allows. Each OS is re-read before acting and runs alone; the full failure list stays on screen (copyable) and only failed OS stay selected. The running state lives in the page so reloading the list cannot start the same batch twice. No batch approve/reject/deliver.
- **Notifications** — the bell (`PortalAlertas.tsx`) has two tabs: **Avisos** (portal alerts, later internal alerts; counted in the badge) and **Sistema** (app errors from `error-log`; a small dot, never a number). The bell number counts all unread notices. Its color highlights notices that arrived since this profile last opened the bell on this computer ("visto", `src/lib/sino-visto.ts`, localStorage); opening never marks anything as read. Portal alerts use a watermark (highest id seen; the count of newer unread ones comes from `contar_alertas_portal_nao_lidos(apos_id)`). The badge total comes from the same count without the watermark and is independent of the 10-item toast window; internal alerts and errors store only the keys still unread at the last opening. The rules are pure functions in `sino-visto.ts` (`aoAbrir`, `comChaves`, `subirMarcaPortal`); every guard against late responses (opening while a count is in flight, profile switch, internal alerts not loaded yet or failed) lives in `useVistoDoSino`. Change the "seen" behaviour there, not in `PortalAlertas.tsx`. "Read" is per profile in `notificacao_leituras` (0052, key `portal:<id>` or `<tipo>:<ref>:<marco>`); the old company-wide `portal_alertas.lido_em` still counts as read for everyone. Internal alerts (new OS for its technician, quote expires tomorrow for quote permission, ready 7+ days, part arrived, low stock, sale approved) come from the SQL function `avisos_internos` (0053) through `listar_avisos_internos`/`marcar_avisos_lidos` (`commands/notificacoes.rs`); visuals and destinations in `src/lib/avisos-internos.ts`. Per-profile preferences live in `security_profiles.avisos_desligados` (0054, edited in Perfil › Notificações via `salvar_avisos_desligados`; internal alerts filtered server-side; `portal` is hidden in the bell client-side so change detection and EVENTO_ALERTAS_PORTAL keep running). Windows notifications use the official `tauri-plugin-notification` only when the app is not focused (`src/lib/notificacao-sistema.ts`; per-computer toggle in localStorage, in Configurações › Geral).
- **Live updates between computers** — migration 0055 puts `trg_avisar_mudanca` on equipamentos, verificacoes, clientes, cliente_contatos, produtos, orcamentos_insumos and servicos_catalogo; each row change sends `pg_notify('autoos_mudancas', {"e","t","id","ref","op"})` (no customer data). This needs a session connection (Supavisor Session, port 5432): the transaction pooler (6543) breaks LISTEN. A new table that a screen lists should get the same trigger. `src-tauri/src/ao_vivo.rs` keeps one `PgListener` per app (started in `setup`), batches notices for 250 ms, keeps only the session company's and emits `autoos:mudancas` (list of `{tabela,id,referencia,operacao}`); after a dropped connection comes back it emits `autoos:reconectado` so screens reload once. On the screen side, `src/lib/ao-vivo.ts` is the single dispatcher (also reloads on window focus, at most every 15 s) and `useAtualizacaoAoVivo(tabelas, recarregar)` subscribes; data hooks reload with `{ silencioso: true }` (never the loading state) and expose `destaques` from `useDestaquesAoVivo` (new/changed rows get `classeDestaque` for ~2.5 s; page/filter changes never highlight). Automatic reloads are background reads: list/count/search commands take `segundo_plano` (`db.*(…, segundoPlano)`, sent only when true via `seSegundoPlano`/`argSegundoPlano`) and use `empresa_da_sessao(pool, segundo_plano)`, which requires an unlocked session but does not renew it, so an unattended computer still locks. The open OS (with its verification and history) refreshes itself; while it is being edited a toast warns, nothing is replaced (the edit keeps its own concurrency token) and the refresh runs when the edit closes.
- **Atualização ao vivo em Finanças** — a migration 0063 instala o mesmo gatilho em `gastos_fixos` e `gastos_variaveis`. Para gastos legados compartilhados (`empresa_id` nulo), o aviso vai sem empresa e sem ID da linha. O listener aceita esse formato apenas para essas duas tabelas, após validar a sessão. As listas e os resumos recarregam em segundo plano com a permissão de gastos. A série anual usa o total atual dos fixos da lista, sem nova consulta ao mudar esse total.
- **Configurações › Geral** — the `/configuracoes` route is open to every profile. The **Geral** tab (`ConfiguracoesTabGeral.tsx`, initial tab) holds per-computer preferences in `localStorage` (`src/lib/preferencias-computador.ts`): app mode, start screen, text size (root `font-size`), reduced animations (`data-movimento="reduzido"` on `<html>` + `MotionConfig`), UI sounds, Windows notifications, plus app version/update and a read-only connection status. Theme (Claro/Escuro/Sistema) also appears there but is the **profile's** theme (same value as Perfil › Personalizar, saved via `salvar_tema_perfil`; `system` allowed since 0056), shown only with an unlocked session. The sidebar footer "Configurações" collapses to its icon when the label does not fit (`useRotuloCabe`). Company tabs (Integrações, Portal, Banco, Segurança, Observabilidade) stay permission-gated; a locked session gets an "unlock" button there. Company-wide settings (inactivity lock, integrations, database) never go in Geral.
- **App updates** — `UpdateNotice` (mounted once in `App.tsx`) polls the updater; shared state lives in `src/lib/atualizacao-disponivel.ts`. When a version exists, the sidebar shows "Atualizar o AutoOS" above the profile card; the floating toast shows once per version (`autoos:aviso-atualizacao-visto`).
- **Repeated serial on Nova entrada** — `AvisoSerieRepetida.tsx` (a neutral line, not an alert) asks whether it is a new maintenance cycle; saving stays blocked until answered. Last passage closed → "Sim, nova manutenção" fills only empty device fields plus client/contact if none chosen (`preencherVaziosComAnterior`). Still in service → "Abrir OS #n" and a smaller "Começar outra mesmo assim". Return within the service warranty (`configuracoes_sistema.garantia_servicos_dias`, 0057, default 90, counted from `data_pronto` — or `data_saida` for legacy rows with an approved quote; refused-and-returned cycles never qualify — edited by admins in Configurações › Segurança, never in Geral) is only announced and noted in the new OS observations; nothing is marked as warranty automatically.
- **Ready-made WhatsApp messages** — `modelos_mensagem` (0058, per company, RLS, three generic seeds) edited in Configurações › Integrações (`MensagensProntasCard`, COMMUNICATION_SETTINGS, audited). `WhatsappComMensagem` ("WhatsApp ▾" in the client panel and in the OS client card) opens `wa.me` with the chosen text filled by `preencherMensagem` ({cliente}, {contato}, {equipamento}, {os}, {status}); the person presses send. It never sends through the API and does not touch the Meta templates.
- **Verification → awaiting approval is one transaction** — `finalizarVerificacao` (`useStatusEquipamento.ts`) sends `enviar_para_aprovacao_prazo` with the verification; `salvar_verificacao_tecnica` then sets AGUARDANDO_APROVACAO, `valor_orcamento` = `custo_total`, `prazo_aprovacao` and `data_verificacao` in the same transaction as the items (only from RECEBIDO/EM_VERIFICACAO/VERIFICADO, needs FINANCIAL_ACTIONS or PREPARE_QUOTES, audited as EQUIPMENT_STATUS_UPDATED). The old three separate writes could leave items saved with `valor_orcamento` 0. `OrcamentoDaOs` shows a notice (color only on the icon) when the sum of non-rejected items differs from `valor_orcamento` once the quote has left (`divergenciaDoOrcamento`); an OS with every item rejected never shows it.
- **Sidebar fits 720p** — groups: Início, Atendimento, Estoque, Gestão (Finanças, Equipe e acessos; Suporte joins here). Below 900 px of height items drop to 36 px, titles tighten and the collapsed footer hides Balcão (Ctrl+K/expanded menu) and the lock (Ctrl+L). Toasts sit bottom-left of the content area so they never cover the page's main action or the sticky form footer.
- **Support via Slack (BMITAG only)** — page `/suporte` (menu › Gestão): text, up to 3 pasted prints, optional error report. `abrir_chamado_suporte` (`commands/suporte.rs`) stores the ticket (`suporte_chamados`/`suporte_mensagens`, 0059) and posts it as a thread in the configured channel (`configuracoes_sistema.suporte_slack_canal`); prints go to the thread via the Slack external upload flow. The bot token lives in the OS keyring of each computer (`autoos`/`suporte_slack_token`) or comes in the installer from the release secret `AUTOOS_SLACK_BOT_TOKEN` (`build.rs` → `COMPILE_TIME_SLACK_BOT_TOKEN`, same model as `AUTOOS_DATABASE_URL`; the keyring wins), never in the database; configured in Configurações › Integrações (COMMUNICATION_SETTINGS, audited). Error toasts and the bell's Sistema tab offer "Enviar ao suporte" only while the database is connected (`src/lib/suporte-ponte.ts`). The answering bot escalates to a human on its own; the app never mentions anyone. Replies: `sincronizar_suporte` (background read, never renews the session) reads `conversations.replies` of the profile's open tickets (last 30 days, up to 10) and stores new ones in `suporte_mensagens` (unique `chamado_id, slack_ts`); our own bot's messages and print uploads are skipped, a message with `bot_id`/`app_id` is marked automatic, and `limpar_texto_slack` drops the "Sent using" footer, mentions and escapes. `useBuscaRespostasSuporte` (Layout) polls every 10 s for 3 min after a send and every 60 s otherwise; a new reply becomes a toast ("Ver" opens the ticket) and a Windows notification. The person replies from the ticket (`responder_chamado_suporte`, prints too) and answers "Isso resolveu?" (`retorno_chamado_suporte`: Resolveu closes, Não resolveu posts in the thread; no mention). Author names need the `users:read` scope; without it the app shows "Suporte". Links in replies (e.g. a hotfix installer published as a GitHub release): `limpar_texto_slack` keeps `<url|label>` untouched; `src/lib/suporte-links.ts` turns into a clickable link only `https:` URLs on `github.com/ph66ng2/AutoOs/releases/…` or `*.bmitag.com.br` (no userinfo/port), everything else stays text; links open in the default browser through `abrir_url` (`abrirLinkDoSuporte` re-checks the allowlist), never inside the webview, and are built as React elements (no `dangerouslySetInnerHTML`).
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
- Don't let an administrator set or see someone else's definitive PIN. New computers and forgotten PINs go through a new access code (`gerar_codigo_primeiro_acesso`), never through a PIN typed by the admin; `reset_security_profile_pin` was removed for this reason. A person who still has a PIN on the computer uses "Esqueci meu PIN: tenho um código do administrador" (wizard in `recovery` mode). The only other path is the break-glass for whoever holds the database credentials (`redefinir_pin_via_db` via "Esqueci minha senha"), which is also how a sole administrator recovers.
- Don't add a sensitive permission without its step in `PERMISSION_TOUR` (`src/lib/tour-steps.ts`); `tour-steps.test.ts` fails if one is missing.
- Don't merge `feature` into `master` or start internal-product work from `feature` — see "Branches e decisões de arquitetura".
- Don't add PowerSync or offline sync to the desktop app (internal or SaaS); it is reserved for a future Mobile Field app.
- Don't treat the Cloudflare photo tunnel (`cloudflared` / `*.trycloudflare.com`) as the SaaS photo architecture. It is a reception workaround: the phone uploads to **this PC** while the QR dialog is open. Future PHOTO / AO-EQP-ONLINE tickets must send photos to the company API or Storage (signed URL), not through a per-PC tunnel. Do not reopen PHOTO-001 or PHOTO-009 to "fix" the tunnel.

## REGRAS DE DOMÍNIO (perfis, PIN, operações sensíveis)

- A rota `/perfil` (Equipe e acessos) concentra cadastro guiado, gestão da equipe e troca da sessão com PIN do perfil de destino.
- PIN novo (criar ou trocar) segue `validate_new_pin` no backend e `src/lib/pin-rules.ts` no frontend: 4 a 8 dígitos, não todos iguais (1111) e não sequência (1234, 4321). Conferir um PIN já salvo usa só `validate_pin_format`, então PINs antigos continuam valendo. As telas de criar PIN mostram o cadeado de roletes (`src/components/auth/PinLock.tsx`), que nunca exibe o PIN digitado; a tela de digitar o PIN para entrar usa o campo simples, que treme em vermelho no erro e mostra um cadeadinho verde abrindo (800 ms) no acerto antes de fechar.
- Primeiro acesso de perfil novo (`onboarding_pendente`): ao clicar em "Fazer primeiro acesso", o avatar tracejado voa até o cadeado do `PrimeiroAcessoWizard` (`FirstAccessBridge`, ~0,7 s; a janela de perfis só fecha quando ele pousa). Nas etapas, o mesmo emblema evolui: cadeado → avatar do perfil (ao salvar o PIN) → anel de selo em "Pronto". "Ativar neste computador" e "Esqueci meu PIN" abrem direto. Sons curtos sintetizados em `src/lib/ui-sounds.ts` (sem arquivos de áudio), que podem ser desligados em Configurações › Geral (preferência deste computador, `localStorage` `autoos:ui-sounds`); o contexto de áudio é suspenso após 3 s sem som. Movimento reduzido (do sistema ou "Reduzir animações" em Configurações › Geral, via `movimentoReduzido()` de `src/lib/preferencias-computador.ts`) pula as animações e o som de conclusão.
- `pin_required` é política compartilhada; PIN/hash continuam no keyring. Ausência do PIN local não autoriza entrada em um perfil protegido.
- Trocar a sessão é uma operação local: não alterar `is_default` no banco compartilhado.
- Perfis operacionais podem ter zero permissões sensíveis. Os modelos em `src/lib/profile-presets.ts` somente preenchem permissões já verificadas pelo backend.
- Ação administrativa ou destrutiva: preserve ou amplie trilha de auditoria e confirmação explícita.
- Recuperação de PIN (`redefinir_pin_via_db`) usa credenciais PostgreSQL como fator alternativo. `verificar_credenciais_banco` tenta TLS primeiro e cai para `NoTls` (PostgreSQL local). Quando a migração para Supabase for definitiva, o fallback `NoTls` pode ser removido.
- Ao alterar dados persistidos, mantenha frontend, backend, validações (`validations.ts`) e tipos (`src/types/`) alinhados.
- Quando o comportamento mudar, atualize a documentação afetada (`README.md`, `1-SETUP.md`, `4-BACKUP.md`, `3-NEXT_STEPS.md`, `docs/`).

## BRANCHES E DECISÕES DE ARQUITETURA

### Duas linhas, fluxo num sentido só

- `master` é o AutoOS interno (Tauri + PostgreSQL legado), em produção na BMITAG. `feature` é o AutoOS SaaS (build explícito, Supabase + RLS).
- Trabalho do produto interno (correções, piloto fiscal no Tauri, funcionalidade validada pela BMITAG) parte de `origin/master` e vai em PR para `master`.
- Trabalho exclusivo do SaaS (adaptadores Supabase, `supabase/migrations`, identidade por dispositivo, portes) parte de `origin/feature` e vai em PR para `feature`.
- `master` é integrada na `feature` toda semana, se houver mudanças. A `feature` **não** é mesclada na `master` antes da virada para o SaaS. Hotfix vai para `master` e chega à `feature` por esse merge; não aplicar o mesmo hotfix duas vezes à mão.
- No merge semanal, quem faz o merge esconde explicitamente no build SaaS cada funcionalidade da `master` ainda não portada (isso não acontece sozinho) e confirma `npm run build:saas` e `npm run test:run` na `feature` antes de abrir o PR.
- Até o PR que atualiza `.workflow/` na `feature`, esta seção prevalece sobre `.workflow/README.md` e `workflow.json` (`baseBranch`, `promotionTarget` e `architectureDecisions` sobre login individual).
- Meta para depois da virada, não para agora: uma única branch gerando os dois builds.

### Produto e plataforma

- O AutoOS vira SaaS quando o produto interno emitir nota fiscal de uma OS real da BMITAG. Na virada, a BMITAG passa a usar o build SaaS como primeiro cliente e funcionalidade nova passa a nascer só na linha SaaS.
- Desktop (interno e SaaS) é Online. PowerSync é reservado a um futuro app Mobile Field, com tickets próprios. Não adicionar PowerSync, sync offline ou token PowerSync ao desktop.
- Identidade no SaaS: o administrador faz login uma vez por máquina para **autorizar o dispositivo**, que recebe credencial própria e restrita à empresa (a sessão do administrador não fica na máquina). Funcionários escolhem perfil (UUID na nuvem) e usam PIN local; o PIN nunca autentica no Supabase nem concede permissão no servidor. Ações de financeiro, equipe e dispositivos pedem reautenticação do administrador. O servidor audita dispositivo e perfil declarado; o administrador pode revogar um dispositivo.

### Fiscal (ADR 0001 aceito pelo responsável do produto em 20/10/2026)

O arquivo `docs/adr/0001-ownership-core-autoos-fiscal.md` existe só na `feature` e ainda diz "proposta"; o status é atualizado no PR do workflow. As regras abaixo já valem.


- O AutoOS é a única autoridade de cliente operacional, produto, serviço, equipamento/OS e estoque. O AutoPlatform recebe cópia imutável e é autoridade do ciclo fiscal e dos dados tributários (NCM, CFOP, CST/CSOSN, CRT, CNAE); o AutoOS não gera campos tributários.
- O fato faturável nasce quando a OS entra em `PRONTO`. Total = `valor_orcamento`. Linhas = serviços aprovados e suas peças pela quantidade e valor aprovados, inclusive peças com baixa pendente.
- Soma das linhas diferente de `valor_orcamento` bloqueia o fato com motivo claro; nunca ajustar em silêncio. OS reprovada nunca gera fato, mesmo com custo de verificação. O fato não movimenta estoque.
- Primeira implementação no Tauri, na `master`. A montagem do fato fica num módulo isolado, com fixtures de entrada/saída reaproveitáveis pela versão SaaS.
- Criação de boletos sai do AutoBO para o AutoOS somente após ADR próprio.

### Código novo: reduzir o retrabalho do porte para o SaaS

Vale para código **novo** nas duas branches; não refatorar o existente por causa disto.

- Regra de negócio nova vai, preferencialmente, em função SQL (PL/pgSQL), chamada pelo Rust via sqlx no Tauri e por RPC no SaaS. O comando Rust só resolve a empresa, chama a função e mapeia o erro. Cada backend tem a sua migration com a sua versão da função; o SQL não é compartilhado por arquivo.
- Quando possível, a regra é função pura (JSON de entrada → JSON de saída, sem ler tabela); leitura e gravação ficam numa camada fina por backend.
- Migration nova segue a estrutura que facilita o porte, mantendo os tipos do backend dela: em `src-tauri/migrations`, IDs `INTEGER` e o fluxo de promoção de `production_migrate.rs` (atualizar `REQUIRED_PROMOTION_MIGRATIONS` e `EXPECTED_MIGRATION_COUNT`); em `supabase/migrations`, `UUID`. Nos dois: `empresa_id`, FK composta `(id, empresa_id)`, RLS habilitado, `NUMERIC(14,2)` para dinheiro, sem `float`.
- Tela nova não chama `db.*`: acessa dados por um hook de domínio (`src/hooks/use*.ts`), que é onde o adaptador SaaS entra. Na `feature`, o hook usa o repositório de `src/lib/data/`, e `IS_SAAS_BUILD` não entra em tela nova.
- Regra que existirá nos dois backends tem fixtures compartilhadas (mesmo caso, mesma saída esperada) rodando contra os dois.
- Código novo não contém marca, e-mail ou texto fixo da BMITAG; use configuração da empresa.

## FLUXO DE TRABALHO COM AGENTES DE IA (Claude Code e Cursor)

Vale para qualquer agente. A escolha de modelo e effort (Opus 5.5 `medium` como padrão; Haiku só para busca e leitura) é específica do Claude Code e está em `CLAUDE.md`.

**Contexto de custo:** o projeto usa uma assinatura de US$ 20/mês com cota limitada. Toda decisão abaixo existe para gastar menos cota por tarefa.

### Fatiar antes de executar

Tarefa que não cabe em um passo é dividida em fatias antes de qualquer código. Cada fatia deve:

- Tocar **um arquivo** e, de preferência, **uma função ou um bloco**.
- Ter **entrada e saída explícitas**: o que existe hoje e o que deve existir depois.
- Ter **critério de pronto verificável por comando** (`npm run lint`, `cargo check`, um teste específico), não por julgamento.
- Levar **só o contexto mínimo**: caminho, função, trecho relevante e a regra deste arquivo que se aplica.
- **Não exigir decisão de design.** Se a fatia pede "escolha a melhor abordagem", ela ainda não está pronta: a decisão é tomada no plano.

Bom: "Em `src/lib/validations.ts`, adicionar `telefone` opcional (string, máx. 20) ao `clienteSchema`. Pronto quando `npm run lint` passar."
Ruim: "Refatorar o fluxo de orçamento em `Equipamentos.tsx`."

Tarefa grande demais para fatiar (refatoração ampla, mudança de arquitetura) é discutida com o usuário antes, não forçada em dezenas de fatias.

### Máquina antes de modelo

Tudo que um comando verifica é verificado por comando, nunca pedindo a um modelo que "confira":

```bash
npm run lint                          # tsc --noEmit
npm run test:run                      # Vitest
cd src-tauri && cargo check           # Rust
cd src-tauri && cargo clippy -- -W warnings
```

### Filtro de lixo antes do QA

A revisão de qualidade é do **QA humano da empresa**. Antes de o diff ir para ele, rode:

```bash
scripts/pre-qa-check.sh        # checagens mecânicas sobre o diff
npm run lint && npm run test:run
```

O script rejeita: debug esquecido (`console.log`, `dbg!`, `println!`), macros `query!`/`query_as!`, referência a SQLite, teste com `skip`/`only`/`ignore`, URL de banco com credencial, possível token, TODO/FIXME novo, `invoke()` fora de `src/lib/db.ts` e migration existente alterada. Ele também lista os arquivos alterados.

O que o script não pega, quem coordena confere à mão, sem pedir a um modelo: arquivo alterado que não está no plano, refatoração não pedida e teste removido sem `skip`. Lógica, regra de negócio, nomes e estilo ficam com o QA.

### Limites

- Nenhum agente faz push, abre PR, aplica migration ou executa restore sem confirmação explícita do usuário.
- Mudança de uma linha não precisa de plano, fatia nem subagente: faça direto.

## UNIQUE STYLES

- **Large page files** — `Equipamentos.tsx` ≈ 2510 lines (god page with 5 dialogs, 4-tab details, photo upload, PDF generation, WhatsApp/Email automation, budget divergence handling). `Configuracoes.tsx` ≈ 993 lines.
- **Integration tests as Rust binaries** — 10 `[[bin]]` entries in `Cargo.toml`, not `#[cfg(test)]` modules. Tests create temporary security profiles and clean them up.
- **Agentes de IA usados no projeto: Claude Code e Cursor.** Este AGENTS.md é a fonte única de regras para os dois. `CLAUDE.md` e `.claude/agents/` contêm só o que é específico do Claude Code; `.cursor/rules/` só o que é específico do Cursor.
- **Frontend tests mock `db` centrally** — standard pattern: `vi.hoisted()` + `vi.mock("@/lib/db", () => ({ db: { ... } }))`.
- **tsconfig excludes test files** — `"exclude": ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"]` means `tsc --noEmit` does not check tests.
- **Vitest Windows stability** — `pool: 'threads'`, `fileParallelism: false`, `maxWorkers: 1` to avoid fork/AV issues on Windows.
- **Playwright mock mode** — E2E tests run with `VITE_E2E_MOCK=1` which aliases `@tauri-apps/api/core` to `e2e/mocks/tauri-core.ts`. This validates UI flows with in-memory mock data, **not** real Tauri + PostgreSQL.
- **Management CC (BMITAG only)** — `montarCcs` (`email-service.ts`) adds `CC_GERENCIA` (`medeiros@bmitag.com.br`) only when `copia_gerencia_da_empresa` (`smtp.rs`, non-renewing) says yes for the session company: a single active company in the installation, or the company bound to the support channel (`suporte_slack_empresa_id`); unknown means no CC (`src/lib/copia-gerencia.ts`). Every automatic email (entry, quote, ready, portal quote copy, supply quote) goes through `montarCcs`. Technicians are the session company's active profiles marked `atende_tecnico` (`listar_tecnicos_da_empresa`, `src/lib/tecnicos.ts`, `useTecnicos`); `SensitiveAccessProvider` clears the list and the CC flag on profile switch, lock and unlock and reloads them on unlock, team change, window focus and reconnection. The technician's email is the profile's mandatory `email_profissional` (migration `0051`). Old OS keep the technician name as text.
- **Windows code signing** — `certificateThumbprint` is `null` in `tauri.conf.json`. Build-time script `scripts/apply-windows-bundle-signing.mjs` injects it from env var for CI/release builds.

## NOTES

- **DATABASE_URL resolution chain** (highest to lowest priority): process `DATABASE_URL` → persisted `database-config.json` → build fallback `AUTOOS_DATABASE_URL` → local `.env` candidates. A legacy direct Supabase config for the same project is replaced by the release pooler, and an `.env` left by an older installer cannot override the validated release endpoint.
- **Required in PATH for full backup/restore**: `pg_dump`, `pg_restore`, `psql`. Backup uses `--format=custom`. Restore runs `run_pending_migrations()` afterward to bridge schema gaps.
- **Logs**: `~/.local/share/AutoOS/logs/autoos.log.YYYY-MM-DD` (Linux), `%LOCALAPPDATA%\AutoOS\logs` (Windows). Daily rolling via `tracing-appender`.
- **Support packages**: `~/.local/share/AutoOS/support` (Linux), `%LOCALAPPDATA%\AutoOS\support` (Windows). JSON snapshots exported from `Configurações > Segurança`.
- **Temp files**: `/tmp/autoos` (Linux), `%TEMP%\autoos` (Windows). Pruned by housekeeping on startup.
- **Restore path restriction**: restore only accepts files inside `~/AutoOS/backups` (Linux) or `%USERPROFILE%\Documents\AutoOS\backups` (Windows).
- **CSP in tauri.conf.json** allows `https://viacep.com.br` (Brazilian ZIP code lookup API).
- **Version alignment**: `package.json` (0.5.3), `Cargo.toml` (0.5.3), `tauri.conf.json` (0.5.3) should match `docs/RELEASE.md` checklist.
