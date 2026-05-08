# AutoOS - Produção e Homologação

## Ambiente de Homologação

### Objetivo
Validar fluxo completo antes de colocar em produção.

### Checklist de Homologação

- [ ] PostgreSQL configurado com DATABASE_URL
- [ ] App abre sem erro de banco
- [ ] Cadastrar cliente
- [ ] Cadastrar equipamento
- [ ] Mudar status de equipamento
- [ ] Cadastrar produto
- [ ] Registrar entrada de estoque
- [ ] Registrar saída de estoque
- [ ] Validar persistência após reiniciar app
- [ ] Gerar backup via app
- [ ] Validar restauração de backup
- [ ] Testar acesso sensível (perfil + PIN)

---

## Ambiente de Produção (Windows)

### Pré-requisitos
- Windows 10/11 64-bit
- PostgreSQL 15+ instalado
- Ferramentas no PATH: psql, pg_dump, pg_restore

### 1. PostgreSQL no PC da Empresa

```powershell
# Verificar serviço
Get-Service -Name "postgresql*"

# Criar banco (como admin)
psql -U postgres

CREATE DATABASE autoos;
CREATE USER autoos_user WITH PASSWORD 'SUA_SENHA';
GRANT ALL PRIVILEGES ON DATABASE autoos TO autoos_user;
\c autoos
GRANT ALL ON SCHEMA public TO autoos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO autoos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO autoos_user;
\q
```

Validação imediata:

```powershell
psql -h localhost -p 5432 -U autoos_user -d autoos -c "SELECT current_database(), current_user;"
```

### 2. DATABASE_URL

```powershell
# Variável de usuário
[System.Environment]::SetEnvironmentVariable(
  "DATABASE_URL",
  "postgres://autoos_user:SUA_SENHA@localhost:5432/autoos",
  "User"
)
```

Feche e abra novamente o terminal/sessão do Windows após definir a variável.

Validação da variável:

```powershell
[Environment]::GetEnvironmentVariable("DATABASE_URL","User")
```

### 3. Instalar App

1. Obter instalador gerado pela equipe
2. Executar como usuário operador
3. Abrir AutoOS
4. Validar inicialização sem erro

### 4. Segurança em Produção: Criar Perfis Operacionais

No primeiro acesso do app no PC da empresa:

1. Entre em `Configurações > Segurança`.
2. Configure o **PIN de acesso sensível**.
3. Crie os perfis reais da operação (ex.: `Tecnico`, `Gestor`).
4. Associe permissões por perfil:
   - `Tecnico`: operação diária (status, verificação, catálogo, estoque conforme política)
   - `Gestor`: financeiro, exclusão, perfis, administração
5. Faça teste de bloqueio:
   - bloquear acesso sensível
   - tentar ação protegida
   - confirmar solicitação de PIN

### 5. Validação Go-Live

```powershell
# Fluxo mínimo
1. Cadastrar cliente
2. Cadastrar equipamento
3. Cadastrar produto
4. Movimentar estoque
5. Fechar e abrir app
6. Validar dados persistidos
```

Checklist final (antes de liberar para uso real):

- [ ] App abre sem erro de banco
- [ ] Migrações aplicadas automaticamente
- [ ] PIN configurado
- [ ] Perfis criados e testados
- [ ] Backup manual executado uma vez
- [ ] Restore validado em base de homologação (não na base operacional)

---

## Caminhos Operacionais

### Linux
- Logs: `~/.local/share/AutoOS/logs`
- Suporte: `~/.local/share/AutoOS/support`
- Temporários: `/tmp/autoos`
- Backups: `~/AutoOS/backups`

### Windows
- Logs: `%LOCALAPPDATA%\AutoOS\logs`
- Suporte: `%LOCALAPPDATA%\AutoOS\support`
- Temporários: `%TEMP%\autoos`
- Backups: `%USERPROFILE%\Documents\AutoOS\backups`

---

## Bloqueios de Distribuição

| Bloqueio | Status |
|----------|--------|
| certificateThumbprint | Pendente no repositório (injetado no CI/build via `AUTOOS_WINDOWS_CODESIGN_CERT_THUMBPRINT` → `bundle:prep:windows:sign`; ver `docs/WINDOWS_CODE_SIGNING.md`) |
| timestampUrl | Configurado (`http://timestamp.digicert.com`) em `src-tauri/tauri.conf.json` |
| Versão release | **1.0.0** — atualizar sempre em trio com `package.json`, `Cargo.toml`, `tauri.conf.json` (ver `docs/RELEASE.md`) |

---

## Referências

- Setup: [1-SETUP.md](./1-SETUP.md)
- Backup/Restore: [4-BACKUP.md](./4-BACKUP.md)
- Roadmap: [3-NEXT_STEPS.md](./3-NEXT_STEPS.md)