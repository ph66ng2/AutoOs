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

### Pré-requisitos das integrações `p1_*`

- `DATABASE_URL` válido (ex.: `.env` em `src-tauri/` ou variável exportada).
- **Keyring do SO** disponível (`configure_sensitive_pin` / credenciais de canal gravam secrets). runners Linux headless costumam falhar até haver dbus/secret compatível ou runner self-hosted onde o comando já passe.

## Windows (distribuição assistida)

1. Thumbprint só no build: ver [WINDOWS_CODE_SIGNING.md](./WINDOWS_CODE_SIGNING.md).
2. Timestamp já está configurado no `tauri.conf.json`; o bloqueio remanente de prontidão é normalmente apenas **thumbprint**.
