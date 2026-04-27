# AutoOS

Sistema desktop para gestão de impressoras, recebimento técnico, comunicações operacionais e controle de estoque de insumos.

## Stack atual

- Frontend: React 18 + TypeScript + Tailwind CSS
- Desktop: Tauri 2.x com backend Rust
- UI: shadcn/ui
- Banco: PostgreSQL com sqlx e migrações versionadas

## Funcionalidades já disponíveis

- Cadastro completo de clientes, equipamentos e produtos
- Controle de estoque com movimentação de entrada e saída
- Recebimento técnico com defeito relatado, patrimônio e acessórios
- Histórico de comunicações por WhatsApp e email
- Perfis locais com PIN, permissões e auditoria de ações sensíveis
- Painel de conferência do schema e backup manual do PostgreSQL pela aplicação

## Pré-requisitos

- Node.js 18+
- Rust estável
- Visual Studio C++ Build Tools no Windows
- PostgreSQL 15+ com ferramentas de linha de comando instaladas

## Como rodar

1. Instale as dependências do projeto.
2. Configure a DATABASE_URL em src-tauri/.env.
3. Inicie o app em modo desenvolvimento.

```bash
npm install
npm run tauri dev
```

O backend resolve automaticamente `src-tauri/.env` tanto no fluxo oficial `npm run tauri dev` quanto em execuções diretas do binário Rust via `cargo run`.

## Build e validação

```bash
npx tsc --noEmit
cd src-tauri && cargo check
npm run tauri build
```

Para uma prova barata de runtime real com PostgreSQL, migrações e persistência mínima, rode também:

```bash
cargo run --manifest-path src-tauri/Cargo.toml --bin runtime_smoke
```

## Documentação operacional

- Setup do PostgreSQL: [POSTGRES_SETUP.md](./POSTGRES_SETUP.md)
- Backup e restore: [POSTGRES_BACKUP_RESTORE.md](./POSTGRES_BACKUP_RESTORE.md)
- **Runbook de recuperação operacional:** [OPERATIONAL_RECOVERY.md](./OPERATIONAL_RECOVERY.md) — Procedimentos testados de backup, restore e plano de manutenção
- Nota técnica sobre migrações: [MIGRACAO_POSTGRESQL.md](./MIGRACAO_POSTGRESQL.md)
- Roadmap do produto: [NEXT_STEPS.md](./NEXT_STEPS.md)

## Banco e migrações

O backend aplica automaticamente as migrações versionadas em src-tauri/migrations na inicialização. O estado do schema também pode ser conferido dentro do app em Configurações → Segurança.

## Licença

Proprietário - BMITAG
