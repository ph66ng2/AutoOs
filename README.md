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

## Regras de Migration

### Nunca edite uma migration já existente

O sqlx guarda o checksum SHA-256 de cada migration na tabela `_sqlx_migrations`. Se você editar um arquivo `.sql` que já foi aplicado em algum banco, o checksum do arquivo não bate com o do banco e o app falha com:

```
migration N was previously applied but has been modified
```

Isso quebra instalações existentes. **Regra de ouro:** se o arquivo já foi commitado e aplicado, é imutável.

### Sempre crie uma nova migration

Qualquer alteração de schema (nova tabela, nova coluna, novo índice, correção de constraint) deve ser feita em um arquivo novo com o próximo número sequencial:

```
src-tauri/migrations/
  0001_initial_schema.sql
  0002_schema_hardening.sql
  ...
  0009_idempotencia_final.sql   ← exemplo de migration corretiva
```

Use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` e equivalentes sempre que possível.

### Como corrigir manualmente um VersionMismatch em ambiente de teste

Se você precisar testar uma migration editada (apenas em desenvolvimento, nunca em produção):

1. Conecte-se ao banco:
   ```bash
   psql -h SEU_HOST -U SEU_USUARIO -d SEU_BANCO
   ```

2. Delete o registro da migration problemática:
   ```sql
   DELETE FROM _sqlx_migrations WHERE version = N;
   ```

3. Recrie o banco do zero (mais seguro):
   ```sql
   DROP TABLE IF EXISTS _sqlx_migrations CASCADE;
   -- ou recrie todo o banco
   DROP DATABASE autoos;
   CREATE DATABASE autoos;
   ```

4. Reexecute o app — ele aplicará todas as migrations do zero com os arquivos atuais.

> **Atenção:** Em produção/shared, nunca edite `_sqlx_migrations` manualmente. A solução correta é garantir que os arquivos de migration nunca mudem e, se necessário, criar uma nova migration para corrigir o schema.

### Idempotência no build

O `cargo tauri build` embute as migrations no binário. Para que o `.exe` funcione tanto em bancos novos quanto já existentes:

- Use `IF NOT EXISTS`/`IF EXISTS` em toda migration
- Para `ALTER TABLE ... ADD CONSTRAINT` (que não tem IF NOT EXISTS no PostgreSQL), use o padrão `DO $$ ... EXCEPTION WHEN duplicate_object THEN ... END $$;`
- Se um banco já foi populado com uma versão anterior do `.exe`, a única solução segura é recriar o banco ou usar a nova migration de correção (ex: `0009_idempotencia_final.sql`)

## Licença

Proprietário - BMITAG
