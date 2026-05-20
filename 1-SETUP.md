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

## 5. Configuração Inicial de Segurança (Perfis + PIN)

> Faça isso no primeiro acesso do ambiente (homologação ou produção).

1. Abra `Configurações > Segurança`.
2. Configure o **PIN de acesso sensível**.
3. Revise o perfil padrão `Administrador Local`.
4. Crie os perfis que vão operar o sistema no dia a dia:
   - Perfil técnico (fluxo operacional)
   - Perfil gestor (financeiro/ajustes sensíveis)
5. Valide o bloqueio:
   - Bloqueie o acesso sensível
   - Tente executar ação protegida
   - Confirme que o app pede PIN

### Permissões recomendadas por perfil

- **Técnico (produção diária):**
  - `STOCK_CONTROL`
  - `FINANCIAL_ACTIONS` (somente se a empresa permitir orçamento/entrega no mesmo perfil)
- **Gestor/Admin:**
  - todas as permissões críticas, incluindo:
  - `DELETE_RECORDS`
  - `MANAGE_PROFILES`
  - `CONFIG_WHATSAPP`
  - `CONFIG_SMTP` (se/quando usar)

---

## Migrações Atuais

| Arquivo | Descrição |
|---------|----------|
| 0001_initial_schema.sql | Baseline: clientes, equipamentos, produtos, movimentações, verificações, comunicações, segurança |
| 0002_schema_hardening.sql | Constraints, defaults, índices |
| 0003_equipment_intake_fields.sql | Patrimônio, defeito relatado, acessórios |
| 0004_equipment_images.sql | Imagens de entrada/saída |
| 0005_service_catalog.sql | Catálogo de serviços com preço padrão |

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

- LAN com servidor dedicado: [5-LAN-SERVER-SETUP.md](./5-LAN-SERVER-SETUP.md)
- Backup/Restore: [4-BACKUP.md](./4-BACKUP.md)
- Roadmap: [3-NEXT_STEPS.md](./3-NEXT_STEPS.md)
- Produção: [2-PRODUCTION.md](./2-PRODUCTION.md)