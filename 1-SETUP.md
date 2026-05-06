# AutoOS - Setup e Configuração

## Pré-requisitos

### Sistema
- Node.js 18+
- Rust estável
- PostgreSQL 15+

### Linux (Fedora)
```bash
sudo dnf install -y postgresql postgresql-server postgresql-contrib
sudo dnf install -y webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel openssl-devel librsvg2-devel
```

### Windows
- Visual Studio C++ Build Tools
- PostgreSQL 15+ com ferramentas no PATH

---

## 1. PostgreSQL - Criar Banco

### Linux
```bash
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
sudo -u postgres psql
```

```sql
CREATE DATABASE autoos;
CREATE USER autoos_user WITH PASSWORD 'SUA_SENHA_AQUI';
GRANT ALL PRIVILEGES ON DATABASE autoos TO autoos_user;
\c autoos
GRANT ALL ON SCHEMA public TO autoos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO autoos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO autoos_user;
\q
```

### Windows (PowerShell)
```powershell
psql -U postgres

CREATE DATABASE autoos;
CREATE USER autoos_user WITH PASSWORD 'SUA_SENHA_AQUI';
GRANT ALL PRIVILEGES ON DATABASE autoos TO autoos_user;
\c autoos
GRANT ALL ON SCHEMA public TO autoos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO autoos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO autoos_user;
\q
```

---

## 2. Configurar DATABASE_URL

Na raiz do projeto:

```bash
echo "DATABASE_URL=postgres://autoos_user:SUA_SENHA@localhost:5432/autoos" > src-tauri/.env
```

---

## 3. Instalar Dependências e Validar

```bash
npm install
npx tsc --noEmit
cd src-tauri && cargo check
```

---

## 4. Rodar o App

```bash
npm run tauri dev
```

Na inicialização:
1. Resolve DATABASE_URL
2. Cria pool PostgreSQL
3. Aplica migrações pendentes
4. Libera desktop Tauri

### Validação Smoke
```bash
cargo run --manifest-path src-tauri/Cargo.toml --bin runtime_smoke
```

---

## Migrações Atuais

| Arquivo | Descrição |
|---------|----------|
| 0001_initial_schema.sql | Baseline: clientes, equipamentos, produtos, movimentações, verificações, comunicações, segurança |
| 0002_schema_hardening.sql | Constraints, defaults, índices |
| 0003_equipment_intake_fields.sql | Patrimônio, defeito relatado, acessórios |
| 0004_equipment_images.sql | Imagens de entrada/saída |

Ver status em: `Configurações > Segurança > Banco e schema`

---

## Troubleshooting

| Sintoma | Ação |
|--------|------|
| DATABASE_URL não configurada | Criar src-tauri/.env |
| password authentication failed | Verificar senha em .env |
| permission denied for schema public | Reaplicar GRANT |
| PoolTimedOut | Subir PostgreSQL |

## Referências

- Backup/Restore: [4-BACKUP.md](./4-BACKUP.md)
- Roadmap: [3-NEXT_STEPS.md](./3-NEXT_STEPS.md)
- Produção: [2-PRODUCTION.md](./2-PRODUCTION.md)