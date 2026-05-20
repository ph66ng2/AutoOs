# AutoOS

Sistema desktop para gestão de impressoras, recebimento técnico, comunicações operacionais e controle de estoque de insumos.

O projeto não está mais em fase de scaffold. O estado atual é um app Tauri + React com backend Rust, PostgreSQL obrigatório e trilha local de segurança/suporte.

## Stack atual

- Frontend: React 18 + TypeScript + Tailwind CSS
- Desktop: Tauri 2.x
- Backend: Rust
- UI: shadcn/ui
- Banco: PostgreSQL com `sqlx` e migrações versionadas
- Testes: Vitest + Playwright

## Escopo atual do produto

- Cadastro e gestão de clientes, equipamentos e produtos
- Controle de estoque com entrada, saída e trilha de movimentações
- Recebimento técnico com defeito relatado, patrimônio, acessórios e imagens de entrada/saída
- Histórico de comunicações por WhatsApp e email
- Perfis locais com PIN, permissões granulares e auditoria mínima
- Painel de conferência do schema em `Configurações > Segurança`
- Backup manual PostgreSQL pelo app
- Restore manual PostgreSQL pelo app com confirmação explícita
- Diagnóstico local de suporte com logs e pacote JSON exportável

## Pré-requisitos locais

- Node.js 18+
- Rust estável
- Linux (Fedora): `webkit2gtk4.1-devel`, `gtk3-devel`, `libappindicator-gtk3-devel`, `openssl-devel`, `librsvg2-devel`
- Windows: Visual Studio C++ Build Tools
- PostgreSQL 15+ acessível pela `DATABASE_URL`
- `pg_dump`, `pg_restore` e `psql` no `PATH` se você quiser validar backup/restore reais

## Execução em desenvolvimento

1. Instale as dependências:

```bash
npm install
```

2. Configure `src-tauri/.env` com a conexão PostgreSQL:

```env
DATABASE_URL=postgres://autoos_user:SUA_SENHA@localhost:5432/autoos
```

3. Rode o app:

```bash
npm run tauri dev
```

O backend tenta resolver `DATABASE_URL` a partir do ambiente atual e de `src-tauri/.env`. Na inicialização, ele abre a pool PostgreSQL, aplica migrações pendentes e só então libera os comandos IPC do app.

## Validação recomendada

Checks básicos:

```bash
npx tsc --noEmit
cd src-tauri && cargo check
npm run test:run
npm run e2e
npm run qa:integrations
```

Para uma trilha explícita com evidência de integração real de comunicação (frontend + backend): `npm run e2e:real`.

Para pipeline completo (lint + unit + integração real + smoke web): `npm run qa:tier:jornada-real` — requer **keyring** do SO funcionando nos bins integrados (`configure_sensitive_pin` / credenciais de canal).

Provas operacionais úteis quando a máquina já estiver com PostgreSQL real:

```bash
cargo run --manifest-path src-tauri/Cargo.toml --bin runtime_smoke
npm run qa:integrations
cargo run --manifest-path src-tauri/Cargo.toml --bin p1_concurrency_integration
cargo run --manifest-path src-tauri/Cargo.toml --bin p1_windows_support_check
```

## Build

Build local do desktop:

```bash
npm run tauri build
```

Estado atual de distribuição Windows:

- bundle Tauri ativo;
- `timestampUrl` de Authenticode preenchido com carimbo Digicert em `src-tauri/tauri.conf.json`;
- `certificateThumbprint` permanece **fora do Git** até o build assistido (`npm run bundle:prep:windows:sign` + variável — ver [docs/WINDOWS_CODE_SIGNING.md](./docs/WINDOWS_CODE_SIGNING.md));
- versão de release atual: **1.0.0** (alinhar sempre com [docs/RELEASE.md](./docs/RELEASE.md)).

Congelamento e checklist de etiqueta de release: [docs/RELEASE.md](./docs/RELEASE.md).

## Operação local e suporte

- Linux:
  - Logs locais do backend: `~/.local/share/AutoOS/logs`
  - Pacotes JSON de suporte: `~/.local/share/AutoOS/support`
  - Temporários do app: `/tmp/autoos`
  - Backups PostgreSQL gerados pelo app: `~/AutoOS/backups`
- Windows:
  - Logs locais do backend: `%LOCALAPPDATA%\AutoOS\logs`
  - Pacotes JSON de suporte: `%LOCALAPPDATA%\AutoOS\support`
  - Temporários do app: `%TEMP%\autoos`
  - Backups PostgreSQL gerados pelo app: `%USERPROFILE%\Documents\AutoOS\backups`

O app mantém housekeeping local desses diretórios e expõe um snapshot de suporte em `Configurações > Segurança`.

## Mapa de documentação

- Setup e configuração: [1-SETUP.md](./1-SETUP.md)
- Produção e homologação: [2-PRODUCTION.md](./2-PRODUCTION.md)
- Servidor PostgreSQL na LAN: [5-LAN-SERVER-SETUP.md](./5-LAN-SERVER-SETUP.md)
- Release e QA em camadas: [docs/RELEASE.md](./docs/RELEASE.md)
- Assinatura Windows: [docs/WINDOWS_CODE_SIGNING.md](./docs/WINDOWS_CODE_SIGNING.md)
- Roadmap: [3-NEXT_STEPS.md](./3-NEXT_STEPS.md)
- Backup e restore: [4-BACKUP.md](./4-BACKUP.md)

## Banco e migrações

As migrações versionadas vivem em `src-tauri/migrations` e são a fonte de verdade do schema. O estado aplicado pode ser conferido no app em `Configurações > Segurança > Banco e schema`.

## Licença

Proprietário - BMITAG
