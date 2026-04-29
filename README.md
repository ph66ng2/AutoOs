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
- Visual Studio C++ Build Tools no Windows
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
```

Provas operacionais úteis quando a máquina já estiver com PostgreSQL real:

```bash
cargo run --manifest-path src-tauri/Cargo.toml --bin runtime_smoke
cargo run --manifest-path src-tauri/Cargo.toml --bin p1_critical_integration
cargo run --manifest-path src-tauri/Cargo.toml --bin p1_communication_integration
cargo run --manifest-path src-tauri/Cargo.toml --bin p1_concurrency_integration
cargo run --manifest-path src-tauri/Cargo.toml --bin p1_windows_support_check
```

## Build

Build local do desktop:

```bash
npm run tauri build
```

Estado atual de distribuição Windows:

- o bundle Tauri está ativo;
- a assinatura ainda não está pronta para produção assistida, porque `certificateThumbprint` e `timestampUrl` continuam pendentes em `src-tauri/tauri.conf.json`;
- a versão do app ainda está em `0.0.1`.

## Operação Windows e suporte

- Logs locais do backend: `%LOCALAPPDATA%\AutoOS\logs`
- Pacotes JSON de suporte: `%LOCALAPPDATA%\AutoOS\support`
- Temporários do app: `%TEMP%\autoos`
- Backups PostgreSQL gerados pelo app: `%USERPROFILE%\Documents\AutoOS\backups`

O app mantém housekeeping local desses diretórios e expõe um snapshot de suporte em `Configurações > Segurança`.

## Mapa de documentação

- Setup operacional do PostgreSQL: [POSTGRES_SETUP.md](./POSTGRES_SETUP.md)
- Backup e restore PostgreSQL: [POSTGRES_BACKUP_RESTORE.md](./POSTGRES_BACKUP_RESTORE.md)
- Modelo atual de migrações: [MIGRACAO_POSTGRESQL.md](./MIGRACAO_POSTGRESQL.md)
- Operação Windows e suporte local: [WINDOWS_OPERATION_READINESS.md](./WINDOWS_OPERATION_READINESS.md)
- Roadmap e critérios de entrega: [NEXT_STEPS.md](./NEXT_STEPS.md)

## Banco e migrações

As migrações versionadas vivem em `src-tauri/migrations` e são a fonte de verdade do schema. O estado aplicado pode ser conferido no app em `Configurações > Segurança > Banco e schema`.

## Licença

Proprietário - BMITAG
