# PostgreSQL Setup para AutoOS

## Objetivo

Preparar uma máquina Windows para rodar o AutoOS com PostgreSQL real, `DATABASE_URL` válida e migrações versionadas aplicadas automaticamente pelo backend.

Este projeto não usa SQLite. Sem `DATABASE_URL`, o backend falha na inicialização.

## Pré-requisitos

- PostgreSQL 15+ instalado
- `psql`, `pg_dump` e `pg_restore` disponíveis no `PATH` ou acessíveis por caminho absoluto
- Node.js 18+
- Rust estável
- Visual Studio C++ Build Tools no Windows

## 1. Instalar PostgreSQL no Windows

Baixe o instalador oficial em [postgresql.org/download/windows](https://www.postgresql.org/download/windows/) e instale:

- PostgreSQL Server
- Command Line Tools
- pgAdmin é opcional

Nos exemplos abaixo, use a sua versão instalada. Se o comando não estiver no `PATH`, substitua por algo como:

```powershell
& "C:\Program Files\PostgreSQL\<VERSAO>\bin\psql.exe"
```

## 2. Confirmar que o serviço está rodando

```powershell
Get-Service -Name "postgresql*"
```

Se estiver parado:

```powershell
Get-Service -Name "postgresql*" | Start-Service
```

## 3. Criar banco e usuário do app

Abra o `psql` como `postgres`:

```powershell
psql -U postgres
```

Dentro do prompt, execute:

```sql
CREATE DATABASE autoos;
CREATE USER autoos_user WITH PASSWORD 'SUA_SENHA_FORTE_AQUI';
GRANT ALL PRIVILEGES ON DATABASE autoos TO autoos_user;
\c autoos
GRANT ALL ON SCHEMA public TO autoos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO autoos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO autoos_user;
\q
```

No PostgreSQL 15+, o `GRANT ALL ON SCHEMA public` é obrigatório para que o app consiga aplicar migrações.

## 4. Configurar `src-tauri/.env`

Na raiz do projeto:

```powershell
Set-Content -Path "src-tauri\.env" -Value 'DATABASE_URL=postgres://autoos_user:SUA_SENHA_FORTE_AQUI@localhost:5432/autoos'
```

Conteúdo esperado:

```env
DATABASE_URL=postgres://autoos_user:SUA_SENHA_FORTE_AQUI@localhost:5432/autoos
```

O backend tenta resolver `DATABASE_URL` a partir do ambiente atual e de `src-tauri/.env`.

## 5. Validar conectividade básica

```powershell
psql -U autoos_user -d autoos -h localhost
```

Se aparecer `autoos=>`, a conexão básica está funcional. Saia com `\q`.

## 6. Validar bootstrap do app

Na raiz do projeto:

```powershell
npx tsc --noEmit
cd src-tauri
cargo check
cd ..
```

Depois, rode um smoke real contra o PostgreSQL configurado:

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --bin runtime_smoke
```

Esse binário usa a mesma `DATABASE_URL` do backend, valida bootstrap, migrações e persistência mínima antes de limpar os dados temporários.

## 7. Rodar o AutoOS

```powershell
npm run tauri dev
```

Na inicialização, o app:

1. resolve a `DATABASE_URL`;
2. cria a pool PostgreSQL;
3. aplica migrações pendentes de `src-tauri/migrations`;
4. inicializa o desktop Tauri.

## Baseline atual de migração

Migrações conhecidas hoje:

- `0001_initial_schema.sql`: baseline operacional com clientes, equipamentos, produtos, movimentações, verificações, comunicações e segurança local.
- `0002_schema_hardening.sql`: constraints, defaults e índices operacionais.
- `0003_equipment_intake_fields.sql`: patrimônio, defeito relatado e acessórios no recebimento técnico.
- `0004_equipment_images.sql`: armazenamento de imagens de entrada/saída por equipamento.

A tabela `_sqlx_migrations` é gerenciada pelo `sqlx`, e o status aplicado pode ser conferido em `Configurações > Segurança > Banco e schema`.

## Estruturas operacionais importantes criadas pelo schema

- `security_profiles`: perfis locais usados pelo acesso sensível
- `security_audit_log`: auditoria mínima de ações sensíveis
- `equipamento_imagens`: imagens de entrada e saída associadas ao equipamento

## Troubleshooting rápido

| Sintoma | Causa provável | Ação |
|---|---|---|
| `DATABASE_URL não configurada` | `.env` ausente ou inválido | recrie `src-tauri/.env` |
| `password authentication failed` | senha errada | alinhe a senha do usuário com a `DATABASE_URL` |
| `database "autoos" does not exist` | banco não criado | recrie o banco no passo 3 |
| `permission denied for schema public` | grant faltando | reaplique `GRANT ALL ON SCHEMA public TO autoos_user;` |
| `psql` não reconhecido | tools fora do `PATH` | use caminho absoluto do executável |
| `PoolTimedOut` ou `Connection refused` | serviço PostgreSQL parado | inicie o serviço com `Start-Service` |

## Próximos documentos

- Backup e restore operacionais: [POSTGRES_BACKUP_RESTORE.md](./POSTGRES_BACKUP_RESTORE.md)
- Modelo de migrações versionadas: [MIGRACAO_POSTGRESQL.md](./MIGRACAO_POSTGRESQL.md)