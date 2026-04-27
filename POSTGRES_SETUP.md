# PostgreSQL Setup para AutoOS

## 📥 Passo 1 — Instalação no Windows

1. Acesse: **https://www.postgresql.org/download/windows/**
2. Clique em **"Download the installer"** (EnterpriseDB)
3. Escolha a versão **PostgreSQL 18** (ou outra 15+), Windows x86-64
4. Execute o instalador e siga o assistente:

| Tela do instalador | O que fazer |
|---|---|
| Installation Directory | Deixe o padrão (`C:\Program Files\PostgreSQL\18`) ou o da versão escolhida |
| Select Components | Marque **PostgreSQL Server** e **Command Line Tools**. **pgAdmin 4** é opcional. **Stack Builder** não é necessário para o AutoOS |
| Data Directory | Deixe o padrão |
| **Password** | **ANOTE ESSA SENHA!** É a senha do usuário `postgres` (superadmin) |
| Port | Mantenha **5432** |
| Locale | Deixe o padrão |

5. Clique **Next** até finalizar

> **Observação:** Nos exemplos abaixo, usamos a pasta `PostgreSQL\18`. Se você instalou outra versão, troque `18` pela versão correspondente.

---

## ✅ Passo 2 — Verificar se o serviço está rodando

Abra o **PowerShell** e rode:

```powershell
Get-Service -Name "postgresql*"
```

Deve mostrar `Running`. Se mostrar `Stopped`:

```powershell
Get-Service -Name "postgresql*" | Start-Service
```

> **Dica:** O serviço inicia automaticamente com o Windows. Se não quiser isso, mude para "Manual" em `services.msc`.

---

## 🗄️ Passo 3 — Criar o banco de dados e usuário

Abra o **PowerShell** e rode:

```powershell
# Se o comando estiver no PATH:
psql -U postgres

# Se o comando acima não for reconhecido, use o caminho completo.
# Vai pedir a senha que você definiu na instalação.
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres
```

Dentro do prompt `postgres=#`, execute **linha por linha**:

> **Atenção:** Cada comando SQL precisa terminar com `;`. Se aparecer `postgres-#` ou `autoos-#`, o `psql` ainda está esperando o fim do comando anterior. Só `\c` e `\q` não usam `;`.

```sql
-- Criar o banco
CREATE DATABASE autoos;

-- Criar o usuário com senha
CREATE USER autoos_user WITH PASSWORD 'SUA_SENHA_FORTE_AQUI';

-- Dar permissões completas ao usuário no banco
GRANT ALL PRIVILEGES ON DATABASE autoos TO autoos_user;

-- Conectar ao banco autoos para dar permissões no schema
\c autoos

-- Dar permissões no schema public (necessário no PostgreSQL 15+)
GRANT ALL ON SCHEMA public TO autoos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO autoos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO autoos_user;

-- Sair
\q
```

> ⚠️ **IMPORTANTE:** No PostgreSQL 15+, sem o `GRANT ALL ON SCHEMA public`, o usuário não consegue criar tabelas. Esse passo é obrigatório.

---

## 📝 Passo 4 — Criar o arquivo .env

Crie o arquivo `.env` **dentro da pasta `src-tauri/`** do projeto:

```powershell
# Rodar na raiz do projeto
Set-Content -Path "src-tauri\.env" -Value 'DATABASE_URL=postgres://autoos_user:SUA_SENHA_FORTE_AQUI@localhost:5432/autoos'
```

Ou crie manualmente o arquivo `src-tauri/.env` com este conteúdo:

```env
DATABASE_URL=postgres://autoos_user:SUA_SENHA_FORTE_AQUI@localhost:5432/autoos
```

> **Atenção:** O arquivo `.env` deve ficar em `src-tauri/.env` (não na raiz do projeto). O backend resolve esse caminho automaticamente tanto em `npm run tauri dev` quanto em execuções diretas via `cargo run`.

> **Segurança:** O app não usa mais fallback inseguro de conexão. Sem `DATABASE_URL`, o backend não inicializa.

---

## 🔍 Passo 5 — Verificar conexão

Teste se tudo funciona:

```powershell
# Se o comando estiver no PATH:
psql -U autoos_user -d autoos -h localhost

# Se o comando acima não for reconhecido, use o caminho completo.
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U autoos_user -d autoos -h localhost
```

Vai pedir a senha que você definiu para o usuário autoos_user. Se aparecer `autoos=>`, está tudo certo. Digite `\q` para sair.

### Validação opcional do runtime real

Depois que a conexão básica estiver funcionando, você pode validar bootstrap, migrações e CRUD mínimo do app com:

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --bin runtime_smoke
```

Esse helper usa a mesma `DATABASE_URL` do backend, prova a conexão real com PostgreSQL e executa um smoke de cliente, equipamento e estoque antes de limpar os dados temporários.

---

## 🚀 Passo 6 — Rodar o AutoOS

```powershell
# Na raiz do projeto AutoOS
npm run tauri dev
```

O sistema vai:
1. Conectar ao PostgreSQL usando a `DATABASE_URL` do `.env`
2. Aplicar automaticamente as migrações versionadas em `src-tauri/migrations/`
3. Abrir a janela do app

### Estruturas de segurança criadas automaticamente

- `security_profiles`: perfis locais usados pelo acesso sensível, com papel e permissões granulares.
- `security_audit_log`: trilha mínima de auditoria para desbloqueios, troca/reset de PIN, mudança de perfil e gestão de perfis.

### Baseline atual de migração

- `src-tauri/migrations/0001_initial_schema.sql`: schema inicial do AutoOS, incluindo tabelas operacionais e de segurança.
- `src-tauri/migrations/0002_schema_hardening.sql`: hardening do schema com constraints, defaults operacionais e índices para filtros frequentes.
- `src-tauri/migrations/0003_equipment_intake_fields.sql`: campos de recebimento do equipamento, incluindo patrimônio, defeito inicial e acessórios.
- A tabela de controle de migração é gerenciada pelo `sqlx` automaticamente no banco.

### Backup e restore

- O procedimento operacional para troca de máquina está em `POSTGRES_BACKUP_RESTORE.md`.

---

## 🛠️ Resolução de Problemas

| Erro | Causa | Solução |
|---|---|---|
| `PoolTimedOut` | PostgreSQL não está rodando | `Get-Service -Name "postgresql*" | Start-Service` |
| `password authentication failed` | Senha errada no `.env` | Verifique se a senha no `.env` é a mesma que usou no `CREATE USER` |
| `database "autoos" does not exist` | Banco não foi criado | Execute o Passo 3 novamente |
| `permission denied for schema public` | Faltou GRANT no schema | Execute `GRANT ALL ON SCHEMA public TO autoos_user;` no Passo 3 |
| `psql` não é reconhecido como comando | PATH não configurado para os tools do PostgreSQL | Use o caminho completo `C:\Program Files\PostgreSQL\18\bin\psql.exe` ou reinstale com `Command Line Tools` |
| `could not connect to server: Connection refused` | Porta errada ou firewall | Verifique se a porta 5432 está aberta em `services.msc` |

---

## 📊 Gerenciar o Banco Visualmente (Opcional)

Se você instalou o **pgAdmin 4** junto com o PostgreSQL, para usar:

1. Abra **pgAdmin 4** pelo menu Iniciar
2. Na primeira vez, defina uma "master password" (qualquer uma)
3. No painel esquerdo: **Servers → PostgreSQL 18** (ou a versão instalada) e coloque a senha do `postgres`
4. Navegue: **Databases → autoos → Schemas → public → Tables**
5. Clique com botão direito em qualquer tabela → **View/Edit Data → All Rows**

---

## 📂 Resumo dos dados de conexão

| Campo | Valor |
|---|---|
| Host | `localhost` |
| Porta | `5432` |
| Banco | `autoos` |
| Usuário | `autoos_user` |
| Senha | `SUA_SENHA_FORTE_AQUI` |
| URL completa | `postgres://autoos_user:SUA_SENHA_FORTE_AQUI@localhost:5432/autoos` |
| Arquivo .env | `src-tauri/.env` |

> Segurança: o backend não usa mais fallback local de conexão. Se `DATABASE_URL` não estiver definida corretamente, o app falha ao iniciar de forma explícita.