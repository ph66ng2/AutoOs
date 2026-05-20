# AutoOS - Tutorial LAN com Servidor PostgreSQL Dedicado

## Cenário deste guia

- 1 PC dedicado para banco (servidor PostgreSQL)
- 2 PCs operadores rodando AutoOS (clientes)
- Todos na mesma rede LAN, mesma sala
- Todos os PCs são desligados ao fim do dia

Objetivo: ligar tudo pela manhã e operar normalmente, com inicialização previsível e o mínimo de intervenção manual.

---

## Arquitetura recomendada

- `PC-SRV` (servidor): hospeda o PostgreSQL e o banco `autoos`
- `PC-OP1` e `PC-OP2` (clientes): executam o AutoOS e conectam no banco remoto via `DATABASE_URL`

Importante:

- O app depende de PostgreSQL no startup.
- Se `PC-SRV` estiver desligado, os clientes não inicializam.
- Não configure um PostgreSQL separado em cada operador se você quer dados compartilhados.

---

## Pré-requisitos

### Em todos os PCs

- Windows 10/11 64-bit
- Mesmo segmento de rede (ex.: `192.168.1.x`)
- Horário/sincronização corretos

### Apenas no `PC-SRV`

- PostgreSQL 15+

### Nos clientes (`PC-OP1` e `PC-OP2`)

- AutoOS instalado
- Ferramentas no PATH: `psql`, `pg_dump`, `pg_restore` (recomendado para recursos de backup/restore no app)

---

## Etapa 1 - Configurar o servidor PostgreSQL (`PC-SRV`)

### 1.1 Criar banco e usuário

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

### 1.2 Descobrir o IP fixo do servidor

No `PC-SRV`:

```powershell
ipconfig
```

Anote o IPv4 da placa de rede LAN (ex.: `192.168.1.50`).

Recomendação forte:

- Configure IP estático no `PC-SRV`, ou
- Faça reserva DHCP no roteador para manter sempre o mesmo IP.

### 1.3 Permitir conexões remotas no PostgreSQL

Edite o `postgresql.conf`:

- Ajuste:

```conf
listen_addresses = '*'
```

Edite o `pg_hba.conf` e adicione uma linha para a rede local (ajuste subnet):

```conf
host    autoos    autoos_user    192.168.1.0/24    scram-sha-256
```

### 1.4 Reiniciar o serviço PostgreSQL

```powershell
Restart-Service -Name "postgresql*"
```

### 1.5 Liberar firewall do Windows no `PC-SRV`

Abra a porta TCP 5432 para a rede local:

```powershell
New-NetFirewallRule -DisplayName "PostgreSQL 5432 LAN" -Direction Inbound -Protocol TCP -LocalPort 5432 -Action Allow
```

---

## Etapa 2 - Testar conectividade LAN antes do app

No `PC-OP1` e depois no `PC-OP2`:

```powershell
psql -h 192.168.1.50 -p 5432 -U autoos_user -d autoos -c "SELECT current_database(), current_user, now();"
```

Se funcionar, a rede e permissões do PostgreSQL estão corretas.

Se falhar:

- valide IP do servidor
- valide regra do firewall
- valide `listen_addresses` e `pg_hba.conf`
- confirme que o serviço PostgreSQL está rodando

---

## Etapa 3 - Configurar clientes AutoOS (`PC-OP1` e `PC-OP2`)

Em cada cliente, configure `DATABASE_URL` apontando para o `PC-SRV`:

```powershell
[System.Environment]::SetEnvironmentVariable(
  "DATABASE_URL",
  "postgres://autoos_user:SUA_SENHA_FORTE@192.168.1.50:5432/autoos",
  "User"
)
```

Feche e abra sessão/terminal para garantir leitura da variável.

Validar:

```powershell
[Environment]::GetEnvironmentVariable("DATABASE_URL","User")
```

---

## Etapa 4 - Primeiro boot controlado do dia (procedimento padrão)

Com todos os PCs desligados na noite anterior:

1. Ligue o `PC-SRV`
2. Aguarde login e serviço PostgreSQL subir
3. Ligue `PC-OP1` e `PC-OP2`
4. Abra o AutoOS nos operadores

Checklist rápido:

- [ ] `PC-SRV` responde ping na LAN
- [ ] `Get-Service postgresql*` no `PC-SRV` está `Running`
- [ ] AutoOS abre sem erro de banco nos dois clientes

---

## Etapa 5 - Automatizar inicialização diária

Como os PCs são desligados, o foco é reduzir ações manuais pela manhã.

### 5.1 `PC-SRV`: auto login + serviço automático

- PostgreSQL normalmente já instala como serviço automático.
- Confirme startup type:

```powershell
Get-Service -Name "postgresql*" | Select-Object Name, Status, StartType
```

Se necessário:

```powershell
Set-Service -Name "postgresql-x64-15" -StartupType Automatic
```

Opcional (ambiente controlado): configurar login automático do Windows no `PC-SRV` para reduzir dependência de operador.

### 5.2 `PC-OP1` e `PC-OP2`: abrir AutoOS automaticamente com atraso

Use Task Scheduler para abrir o app no login com atraso de 30-60 segundos (tempo para rede estabilizar e servidor subir).

Passos (cada cliente):

1. Abrir `Task Scheduler`
2. `Create Task...`
3. Trigger: `At log on`
4. Action: iniciar executável do AutoOS
5. Conditions: marcar início apenas com rede disponível
6. Settings: retry em falha (ex.: a cada 1 min por 5 tentativas)

Dica:

- Isso evita abrir o app cedo demais quando o servidor ainda está iniciando.

### 5.3 Script opcional de pré-checagem no cliente

Criar `autoos-start.ps1` no cliente:

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

Configure a Task para chamar esse script em vez do `.exe` diretamente.

---

## Etapa 6 - Operação diária recomendada

### Ao iniciar expediente

1. Ligar `PC-SRV`
2. Confirmar PostgreSQL `Running`
3. Ligar clientes
4. Confirmar abertura do AutoOS em ambos

### Ao encerrar expediente

1. Fechar AutoOS nos clientes
2. Executar backup (manual pelo app ou tarefa agendada)
3. Desligar clientes
4. Desligar `PC-SRV`

---

## Etapa 7 - Backup e recuperação

Mantenha rotina de backup no `PC-SRV` (onde o banco está):

- mínimo: backup diário no fim do expediente
- ideal: cópia para segundo destino (NAS, pasta de rede, mídia externa)

Teste restore em ambiente de homologação regularmente.

---

## Troubleshooting rápido

### Clientes não conectam no banco

- `PC-SRV` está ligado?
- Serviço PostgreSQL está `Running`?
- Porta 5432 liberada no firewall?
- `pg_hba.conf` permite subnet LAN?
- `DATABASE_URL` do cliente usa IP correto?

### Banco conecta via `psql`, mas AutoOS não abre

- Verificar se `DATABASE_URL` está no escopo de usuário correto
- Reiniciar sessão do Windows no cliente
- Confirmar que não há caractere especial quebrando URL (senha)

---

## Resumo de decisão

Para seu cenário (3 PCs na mesma sala, LAN, desligam todo dia), este modelo é totalmente viável.

O segredo para ficar estável é:

- IP fixo no `PC-SRV`
- PostgreSQL como serviço automático
- AutoOS nos clientes com abertura automática e pequeno atraso/retry
- rotina simples de abertura (servidor primeiro, clientes depois)
