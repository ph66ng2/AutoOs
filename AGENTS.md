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
├── CLAUDE.md                     # Só Claude Code: roteamento Opus/Sonnet/Haiku
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
| Profiles, first access, tour | `src/pages/Perfil.tsx`, `src/components/perfil/`, `src/components/tour/`, `src/lib/tour-steps.ts` + `auth.rs` + `0041_perfil_personalizacao_primeiro_acesso.sql` | Admin creates a profile and gets a one-time access code (only its Argon2 hash in `codigos_primeiro_acesso`; 24h, single use, one open code per profile, revoked after 5 wrong guesses counted in the database, consumed only after the PIN is stored in the keyring). The person redeems it on each computer and creates their own PIN there. Name/icon/color/theme live in `security_profiles`. Tour steps per permission in `tour-steps.ts`; `tour_permissoes_vistas` drives the "what's new" tour |
| Database | `db.rs` + `migrations/` | sqlx runtime queries only (no `query!` macros) |
| PDF generation | `src/lib/pdf-service.ts` | jsPDF + autotable, 1211 lines with BMITAG branding |
| Email/WhatsApp | `src/lib/email-service.ts`, `whatsapp-service.ts` | SMTP + Evolution API. Email CC hardcoded to `medeiros@bmitag.com.br` |
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
- Don't let an administrator set or see someone else's definitive PIN. New computers and forgotten PINs go through a new access code (`gerar_codigo_primeiro_acesso`), never through a PIN typed by the admin; `reset_security_profile_pin` was removed for this reason. A person who still has a PIN on the computer uses "Esqueci meu PIN: tenho um código do administrador" (wizard in `recovery` mode). The only other path is the break-glass for whoever holds the database credentials (`redefinir_pin_via_db` via "Esqueci minha senha"), which is also how a sole administrator recovers.
- Don't add a sensitive permission without its step in `PERMISSION_TOUR` (`src/lib/tour-steps.ts`); `tour-steps.test.ts` fails if one is missing.
- Don't merge `feature` into `master` or start internal-product work from `feature` — see "Branches e decisões de arquitetura".
- Don't add PowerSync or offline sync to the desktop app (internal or SaaS); it is reserved for a future Mobile Field app.
- Don't treat the Cloudflare photo tunnel (`cloudflared` / `*.trycloudflare.com`) as the SaaS photo architecture. It is a reception workaround: the phone uploads to **this PC** while the QR dialog is open. Future PHOTO / AO-EQP-ONLINE tickets must send photos to the company API or Storage (signed URL), not through a per-PC tunnel. Do not reopen PHOTO-001 or PHOTO-009 to "fix" the tunnel.

## REGRAS DE DOMÍNIO (perfis, PIN, operações sensíveis)

- A rota `/perfil` (Equipe e acessos) concentra cadastro guiado, gestão da equipe e troca da sessão com PIN do perfil de destino.
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

Vale para qualquer agente. O roteamento por modelo (Opus/Sonnet/Haiku) é específico do Claude Code e está em `CLAUDE.md`.

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
- **Email CC hardcoded** — `email-service.ts` always CCs `medeiros@bmitag.com.br`. Technician emails mapped by name (`ivan` → `ivan@bmitag.com.br`).
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
