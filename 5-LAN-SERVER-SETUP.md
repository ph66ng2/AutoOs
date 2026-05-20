# AutoOS - Tutorial LAN com Servidor PostgreSQL Dedicado

## Cenário deste guia

- 1 PC dedicado para banco (`PC-SRV`)
- 2 PCs operadores rodando AutoOS (`PC-OP1` e `PC-OP2`)
- Todos na mesma rede LAN, mesma sala
- Todos os PCs são desligados ao fim do dia

Objetivo: ligar tudo pela manhã e operar normalmente, com inicialização previsível e o mínimo de intervenção manual.

---

## Arquitetura recomendada

```
PC-SRV (192.168.1.50)          PC-OP1 / PC-OP2 (Windows)
┌─────────────────────┐        ┌──────────────────────────┐
│ PostgreSQL 15+      │◄───────│ AutoOS + DATABASE_URL    │
│ banco: autoos       │  LAN   │ psql / pg_dump (backup)  │
└─────────────────────┘        └──────────────────────────┘
```

- `PC-SRV`: hospeda o PostgreSQL e o banco `autoos` — **não precisa rodar o AutoOS**
- `PC-OP1` e `PC-OP2`: executam o AutoOS e conectam no banco remoto via `DATABASE_URL`

Importante:

- O app depende de PostgreSQL no startup.
- Se `PC-SRV` estiver desligado, os clientes não inicializam.
- Não configure um PostgreSQL separado em cada operador se você quer dados compartilhados.

---

## Escolha do sistema operacional do servidor

| Opção | Quando usar |
|-------|-------------|
| **Windows 10/11** no `PC-SRV` | Todos os PCs já são Windows; você quer seguir comandos familiares (PowerShell). |
| **Ubuntu Server 24.04 LTS** no `PC-SRV` | PC dedicado só ao banco; menos interface, boot/serviço estáveis, sem licença extra. |

Os **clientes operadores permanecem Windows** (AutoOS desktop).

Nas etapas abaixo, siga a trilha **Windows** ou **Ubuntu Server** conforme o SO do `PC-SRV`. O restante do guia (clientes, operação diária, backup) é comum.

---

## Pré-requisitos

### Em todos os PCs (rede)

- Mesmo segmento de rede (ex.: `192.168.1.x`)
- Horário/sincronização corretos
- IP fixo no `PC-SRV` **ou** reserva DHCP no roteador (ex.: `192.168.1.50`)

### No `PC-SRV` (servidor de banco)

| Item | Windows | Ubuntu Server |
|------|---------|---------------|
| SO | Windows 10/11 64-bit | Ubuntu Server 24.04 LTS (64-bit) |
| PostgreSQL | 15+ (instalador oficial ou EDB) | 16 via APT (`postgresql` + `postgresql-contrib`) |
| Acesso admin | Conta com permissão de serviço/firewall | `sudo` |

### Nos clientes (`PC-OP1` e `PC-OP2`)

- Windows 10/11 64-bit
- AutoOS instalado
- Ferramentas no PATH: `psql`, `pg_dump`, `pg_restore` (recomendado para backup/restore pelo app)

---

## Etapa 1 — Configurar o servidor PostgreSQL (`PC-SRV`)

Use **uma** das trilhas abaixo.

### Trilha A — Windows (`PC-SRV`)

#### A.1 Instalar PostgreSQL

1. Baixe o instalador em [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)
2. Instale PostgreSQL 15+ (ou 16)
3. Anote a senha do usuário `postgres`
4. Marque para instalar as ferramentas de linha de comando

#### A.2 Criar banco e usuário

Abra PowerShell no `PC-SRV`:

```powershell
psql -U postgres
```

No prompt SQL:

```sql
CREATE DATABASE autoos;
CREATE USER autoos_user WITH PASSWORD 'SUA_SENHA_FORTE';
GRANT ALL PRIVILEGES ON DATABASE autoos TO autoos_user;
\c autoos
GRANT ALL ON SCHEMA public TO autoos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO autoos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO autoos_user;
\q
```

#### A.3 Descobrir o IP do servidor

```powershell
ipconfig
```

Anote o IPv4 da placa LAN (ex.: `192.168.1.50`).

#### A.4 Permitir conexões remotas

Edite `postgresql.conf` (ex.: `C:\Program Files\PostgreSQL\16\data\postgresql.conf`):

```conf
listen_addresses = '*'
```

Edite `pg_hba.conf` na mesma pasta e adicione (ajuste a subnet):

```conf
host    autoos    autoos_user    192.168.1.0/24    scram-sha-256
```

#### A.5 Reiniciar o serviço e liberar firewall

```powershell
Restart-Service -Name "postgresql*"

New-NetFirewallRule -DisplayName "PostgreSQL 5432 LAN" `
  -Direction Inbound -Protocol TCP -LocalPort 5432 -Action Allow
```

#### A.6 Confirmar serviço automático

```powershell
Get-Service -Name "postgresql*" | Select-Object Name, Status, StartType

# Se necessário (ajuste o nome exato do serviço):
Set-Service -Name "postgresql-x64-16" -StartupType Automatic
```

---

### Trilha B — Ubuntu Server 24.04 LTS (`PC-SRV`)

#### B.1 Instalar PostgreSQL

Após instalar o Ubuntu Server (instalação mínima, SSH opcional):

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
```

Verifique a versão (deve ser 16 no Ubuntu 24.04):

```bash
psql --version
sudo systemctl status postgresql
```

#### B.2 Criar banco e usuário

```bash
sudo -u postgres psql
```

No prompt SQL (mesmo conteúdo da trilha Windows):

```sql
CREATE DATABASE autoos;
CREATE USER autoos_user WITH PASSWORD 'SUA_SENHA_FORTE';
GRANT ALL PRIVILEGES ON DATABASE autoos TO autoos_user;
\c autoos
GRANT ALL ON SCHEMA public TO autoos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO autoos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO autoos_user;
\q
```

#### B.3 Descobrir o IP do servidor

```bash
ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '^127\.'
```

Ou, se usar Netplan com IP estático, confira `/etc/netplan/*.yaml`.

Anote o IPv4 da LAN (ex.: `192.168.1.50`).

#### B.4 Permitir conexões remotas

Descubra o diretório de configuração (Ubuntu/PostgreSQL 16):

```bash
sudo -u postgres psql -c "SHOW config_file;"
sudo -u postgres psql -c "SHOW hba_file;"
```

Edite `postgresql.conf`:

```bash
sudo nano /etc/postgresql/16/main/postgresql.conf
```

Ajuste:

```conf
listen_addresses = '*'
```

Edite `pg_hba.conf`:

```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

Adicione ao final (ajuste a subnet):

```conf
host    autoos    autoos_user    192.168.1.0/24    scram-sha-256
```

#### B.5 Reiniciar o serviço e liberar firewall

```bash
sudo systemctl restart postgresql
sudo systemctl enable postgresql

# UFW (se estiver ativo — comum em Ubuntu Server)
sudo ufw allow from 192.168.1.0/24 to any port 5432 proto tcp comment 'PostgreSQL LAN AutoOS'
sudo ufw status
```

Se o UFW estiver **inativo** (instalação mínima sem firewall), o PostgreSQL já escuta na LAN após o passo B.4.

#### B.6 Confirmar serviço no boot

```bash
sudo systemctl is-enabled postgresql
sudo systemctl is-active postgresql
```

---

## Etapa 2 — Testar conectividade LAN (antes do AutoOS)

Execute em **`PC-OP1`** e **`PC-OP2`** (Windows). Substitua `192.168.1.50` pelo IP real do `PC-SRV`.

```powershell
psql -h 192.168.1.50 -p 5432 -U autoos_user -d autoos -c "SELECT current_database(), current_user, now();"
```

Se funcionar, a rede e as permissões do PostgreSQL estão corretas.

**Teste local no próprio `PC-SRV` (Ubuntu):**

```bash
psql -h 192.168.1.50 -p 5432 -U autoos_user -d autoos -c "SELECT current_database(), current_user, now();"
```

**Se falhar, verifique:**

| Verificação | Windows (`PC-SRV`) | Ubuntu (`PC-SRV`) |
|-------------|-------------------|-------------------|
| Serviço rodando | `Get-Service postgresql*` | `sudo systemctl status postgresql` |
| Escuta na porta | `netstat -an \| findstr 5432` | `sudo ss -tlnp \| grep 5432` |
| Firewall | Regra inbound TCP 5432 | `sudo ufw status` |
| Config PG | `listen_addresses`, `pg_hba.conf` | idem em `/etc/postgresql/16/main/` |
| IP correto | `ipconfig` | `ip -4 addr` |

---

## Etapa 3 — Configurar clientes AutoOS (`PC-OP1` e `PC-OP2`)

Em cada cliente Windows, configure `DATABASE_URL` apontando para o `PC-SRV`:

```powershell
[System.Environment]::SetEnvironmentVariable(
  "DATABASE_URL",
  "postgres://autoos_user:SUA_SENHA_FORTE@192.168.1.50:5432/autoos",
  "User"
)
```

Feche e abra a sessão do Windows (ou reinicie) para garantir leitura da variável.

Validar:

```powershell
[Environment]::GetEnvironmentVariable("DATABASE_URL","User")
```

**Alternativa:** arquivo `src-tauri\.env` na pasta de instalação/desenvolvimento, se você distribuir dessa forma — o app também resolve `.env` em `src-tauri/`. Em produção assistida, a variável de usuário costuma ser mais simples.

**Senha com caracteres especiais:** se a senha tiver `@`, `#`, `%`, etc., use URL-encoding na `DATABASE_URL` ou escolha uma senha alfanumérica para evitar quebra de parsing.

---

## Etapa 4 — Primeiro boot controlado do dia

Com todos os PCs desligados na noite anterior:

1. Ligue o **`PC-SRV`**
2. Aguarde o PostgreSQL subir
3. Ligue **`PC-OP1`** e **`PC-OP2`**
4. Abra o AutoOS nos operadores

### Checklist rápido

- [ ] `PC-SRV` responde ping na LAN (`ping 192.168.1.50`)
- [ ] PostgreSQL está ativo no servidor (comando abaixo)
- [ ] AutoOS abre sem erro de banco nos dois clientes

**Confirmar PostgreSQL no servidor:**

| Windows | Ubuntu |
|---------|--------|
| `Get-Service -Name "postgresql*"` → `Running` | `sudo systemctl is-active postgresql` → `active` |

---

## Etapa 5 — Automatizar inicialização diária

Como os PCs são desligados todo dia, o foco é reduzir ações manuais pela manhã.

### 5.1 `PC-SRV` — serviço PostgreSQL no boot

| Windows | Ubuntu |
|---------|--------|
| Serviço `postgresql*` com `StartType = Automatic` | `sudo systemctl enable postgresql` |
| Opcional: login automático (ambiente controlado) | Opcional: boot headless sem login gráfico (padrão Server) |

**Ubuntu — evitar suspensão/hibernação acidental:**

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

### 5.2 `PC-OP1` e `PC-OP2` — abrir AutoOS com atraso (Windows)

Use **Agendador de Tarefas** em cada cliente:

1. Abrir `Task Scheduler` → `Create Task...`
2. Trigger: `At log on`
3. Action: iniciar executável do AutoOS (ou script abaixo)
4. Conditions: iniciar apenas se houver rede
5. Settings: repetir em falha (ex.: a cada 1 min, 5 tentativas)
6. Atraso de 30–60 s após o login (tempo para o `PC-SRV` estabilizar)

### 5.3 Script opcional de pré-checagem no cliente (Windows)

Crie `autoos-start.ps1`:

```powershell
$server = "192.168.1.50"
$port = 5432
$maxTries = 20
$delaySec = 3

for ($i = 1; $i -le $maxTries; $i++) {
  $ok = Test-NetConnection -ComputerName $server -Port $port -InformationLevel Quiet
  if ($ok) { break }
  Start-Sleep -Seconds $delaySec
}

Start-Process "C:\Program Files\AutoOS\AutoOS.exe"
```

Configure a tarefa agendada para chamar esse script em vez do `.exe` diretamente.

---

## Etapa 6 — Operação diária recomendada

### Ao iniciar expediente

1. Ligar **`PC-SRV`** (primeiro)
2. Confirmar PostgreSQL ativo
3. Ligar clientes
4. Confirmar abertura do AutoOS em ambos

### Ao encerrar expediente

1. Fechar AutoOS nos clientes
2. Executar backup (manual pelo app ou rotina agendada)
3. Desligar clientes
4. Desligar **`PC-SRV`**

**Desligamento seguro no Ubuntu Server:**

```bash
sudo shutdown -h now
```

Evite desligar o `PC-SRV` pela tomada com clientes ainda conectados.

---

## Etapa 7 — Backup e recuperação

O banco vive no **`PC-SRV`**, mas o backup **pelo app** roda nos clientes (usa `pg_dump` local apontando para o servidor remoto).

Rotina mínima:

- backup diário no fim do expediente (pelo app em `Configurações > Segurança`)
- cópia periódica dos arquivos `.sql` / `.dump` para segundo destino (NAS, pasta de rede, mídia externa)

**Backup manual no servidor (Ubuntu ou Windows), opcional:**

```bash
# No PC-SRV (Linux) ou qualquer máquina com pg_dump na rede:
pg_dump -h 192.168.1.50 -U autoos_user -d autoos -F c -f autoos_backup_$(date +%Y%m%d).dump
```

Teste restore em ambiente de homologação regularmente. Runbook: [4-BACKUP.md](./4-BACKUP.md).

---

## Troubleshooting rápido

### Clientes não conectam no banco

- `PC-SRV` está ligado?
- PostgreSQL ativo? (tabela da Etapa 4)
- Porta 5432 liberada no firewall do servidor?
- `listen_addresses = '*'` e `pg_hba.conf` permitem `192.168.1.0/24`?
- `DATABASE_URL` nos clientes usa o IP correto?
- Senha correta e sem caracteres que quebrem a URL?

### Banco conecta via `psql`, mas AutoOS não abre

- `DATABASE_URL` definida no escopo **User** (não só na sessão atual do terminal)
- Reiniciar sessão do Windows no cliente após alterar a variável
- Conferir logs: `%LOCALAPPDATA%\AutoOS\logs` (Windows)

### Ubuntu Server: conexão recusada após reboot

```bash
sudo systemctl status postgresql
sudo journalctl -u postgresql -n 50 --no-pager
sudo ss -tlnp | grep 5432
```

Erros comuns: typo em `pg_hba.conf`, UFW bloqueando, PostgreSQL ainda não terminou de subir (clientes abriram cedo demais — use atraso/retry na Etapa 5).

---

## Resumo de decisão

Para o cenário **3 PCs na mesma sala, LAN, desligam todo dia**, este modelo é viável com **`PC-SRV` em Windows ou Ubuntu Server** e **clientes Windows**.

O que mantém estável:

- IP fixo (ou reserva DHCP) no `PC-SRV`
- PostgreSQL como serviço automático no boot
- Clientes com `DATABASE_URL` apontando para o IP do servidor
- Rotina: **servidor primeiro, clientes depois**
- AutoOS nos clientes com atraso/retry se usar abertura automática

| Papel | SO recomendado |
|-------|----------------|
| `PC-SRV` | **Ubuntu Server 24.04 LTS** (dedicado) **ou** **Windows 10/11** (simplicidade) |
| `PC-OP1`, `PC-OP2` | **Windows 10/11** + AutoOS |

---

## Referências

- Setup geral: [1-SETUP.md](./1-SETUP.md)
- Produção/homologação: [2-PRODUCTION.md](./2-PRODUCTION.md)
- Backup/restore: [4-BACKUP.md](./4-BACKUP.md)
