# Congelamento e release — AutoOS

## Convenção de versão (semver)

Um release **deve alinhar a mesma string** nos três ficheiros:

| Ficheiro | Campo |
|----------|------|
| `package.json` | `version` |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `package.version` |

Bumps sugeridos:

- **PATCH** (`1.0.x`) — correções, semântica comportamental estável.
- **MINOR** (`1.x.0`) — funcionalidades retrocompatíveis.
- **MAJOR** (`x.0.0`) — ruptura de contratos (DB/API/UX obrigando migração explícita).

Depois do bump: executar `npm install` uma vez para alinhar metadados de `package-lock.json` onde aplicável.

## Corte estável antes de etiquetar

1. **`git status` limpo por escopo**: branch dedicada (`release/X.Y.Z`), sem misturar trabalho não relacionado ou docs exploratórias.
2. **Travar escopo**: fixar objetivo na descrição do PR/tag (ex.: só Windows assinado, só correções P1).
3. **Pacote neste estado**: validar commits exatos antes do build distribuído; não retocar migrações já aplicadas em ambientes partilhados.

## QA oficial em camadas (trilhas explícitas)

| Comando | O que cobre |
|---------|--------------|
| `npm run lint` | TypeScript |
| `npm run test:run` | Vitest + mocks IPC |
| `npm run e2e` | Playwright com `VITE_E2E_MOCK=1` (store in-memory + alias do invoke) — fluxos de UI, não Postgres real |
| `npm run qa:integrations:critical` | Postgres real + cliente/equipamento/estoque/permissões (`p1_critical_integration`) |
| `npm run qa:integrations:communication` | Postgres + SMTP efémero local + HTTP fake WhatsApp + auditoria (`p1_communication_integration`) |

`npm run qa:integrations` encadeia **critical + communication**.

`npm run qa:tier:jornada-real` faz lint → Vitest → ambos bins de integração → Playwright smoke.

Na CI, o binário `ci_migrate` aplica migrations somente ao PostgreSQL descartável `test_autoos` em localhost antes do QA Real. Ele exige `AUTOOS_MIGRATION_MODE=ci` e recusa hosts externos; não é usado pelo aplicativo, Windows Test ou release.

### Pré-requisitos das integrações `p1_*`

- `DATABASE_URL` válido (ex.: `.env` em `src-tauri/` ou variável exportada).
- **Keyring do SO** disponível (`configure_sensitive_pin` / credenciais de canal gravam secrets). runners Linux headless costumam falhar até haver dbus/secret compatível ou runner self-hosted onde o comando já passe.

### Conexão do release Windows

- Cadastre `AUTOOS_DATABASE_URL` nos GitHub Actions secrets com a URL **Supavisor Session**, porta `5432`, copiada do painel Supabase.
- Não use o endpoint direto `db.<project-ref>.supabase.co` no release distribuído: ele depende de IPv6 e não é uniforme nas redes Windows atendidas.
- Mantenha `sslmode=require` na URL do release.
- O workflow interrompe o build antes de publicar quando o secret está ausente, não aponta para um Session pooler ou o histórico real de migrations diverge do build.
- O aplicativo desktop apenas valida esse histórico, com timeout e sem advisory lock; migrations devem estar aplicadas antes do build.
- `src-tauri/.env` é apenas configuração local ignorada pelo Git; não deve ser versionado nem incluído no bundle.

## Windows (distribuição assistida)

1. Thumbprint só no build: ver [WINDOWS_CODE_SIGNING.md](./WINDOWS_CODE_SIGNING.md).
2. Timestamp já está configurado no `tauri.conf.json`; o bloqueio remanente de prontidão é normalmente apenas **thumbprint**.

## Auto-updater (GitHub Releases)

O workflow `.github/workflows/build.yml` é a publicação oficial do canal `latest`. Detalhes operacionais, rotação de chave e schema de `latest.json` estão em [ATUALIZACAO_EXE.md](./ATUALIZACAO_EXE.md).

Checklist extra antes da tag:

1. A mesma SemVer está em `package.json`, `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json`.
2. `bundle.createUpdaterArtifacts` permanece `true`.
3. `plugins.updater.pubkey` é o par da chave privada nos secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (alias `TAURI_SIGNING_KEY`).
4. `workflow_dispatch` só publica se o input `version` for essa SemVer; sem versão o job falha e não altera latest.
5. O release só deixa de ser rascunho depois de `scripts/generate-update-manifest.mjs` validar instalador, `.sig` e `latest.json`.

Não imprima a chave privada, a senha ou `AUTOOS_DATABASE_URL` em logs, PRs ou evidências. Authenticode (thumbprint) e assinatura do updater (minisign) são camadas distintas.
