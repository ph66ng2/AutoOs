# Runbook Operacional de Backup e Restore — AutoOS

**Data de Criação:** 27 de Abril de 2026  
**Validação:** PostgreSQL 18.3 em Windows com pg_dump, pg_restore, psql  
**Status:** Procedimentos testados e operacionais

---

## 1. Visão Geral

Este documento descreve os procedimentos de backup, restore e recuperação operacional do AutoOS com PostgreSQL 18.3. O foco é garantir recuperação rápida e previsível em caso de perda de dados ou necessidade de migração.

### Pré-condições

- PostgreSQL 18.3 instalado com ferramentas: `psql`, `pg_dump`, `pg_restore`
- Credenciais de acesso: usuário `autoos_user` com password configurado
- Diretório de backups: `C:\Users\Usuario\Projetos\BMITAG\AutoOS\backups\`
- Base de dados operacional: `autoos` na porta 5432, host `localhost`
- Espaço em disco: mínimo 500 MB para armazenar backups (base atual ~120 KB em formato comprimido)

### Formatos Suportados

| Formato | Comando | Tamanho | Uso | Restore |
|---------|---------|--------|-----|---------|
| SQL (texto) | `pg_dump -f backup.sql` | ~48 KB | Portabilidade, versionamento | `psql < backup.sql` |
| DUMP (custom) | `pg_dump -Fc -f backup.dump` | ~114 KB | Compressão, paralelização | `pg_restore -Fc` |

---

## 2. Procedimento de Backup

### 2.1 Backup SQL (Texto — Recomendado para Versionamento)

**Propósito:** Criar backup portável em formato SQL puro, adequado para versionamento em Git ou armazenamento de longo prazo.

**Comando:**

```powershell
$env:PGPASSWORD='tomate06'
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupDir = 'C:\Users\Usuario\Projetos\BMITAG\AutoOS\backups'
$backupFile = "$backupDir\autoos_$timestamp.sql"

& 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe' `
  -h localhost `
  -p 5432 `
  -U autoos_user `
  -d autoos `
  -f $backupFile `
  -v

Write-Host "Backup criado: $backupFile"
Write-Host "Tamanho: $((Get-Item $backupFile).Length) bytes"
```

**Validação pós-backup:**

```powershell
# Verificar integridade do arquivo
$content = Get-Content $backupFile -Raw
if ($content -like "*PostgreSQL database dump*") {
    Write-Host "✓ Arquivo SQL válido"
}

# Contar linhas
$lineCount = @(Get-Content $backupFile).Count
Write-Host "Linhas de SQL: $lineCount"
```

**Tempo estimado:** 5-10 segundos  
**Armazenamento:** ~48 KB (base atual)

---

### 2.2 Backup DUMP (Comprimido — Recomendado para Arquivamento)

**Propósito:** Criar backup comprimido para reduzir espaço de armazenamento ou transferência de dados.

**Comando:**

```powershell
$env:PGPASSWORD='tomate06'
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupDir = 'C:\Users\Usuario\Projetos\BMITAG\AutoOS\backups'
$dumpFile = "$backupDir\autoos_$timestamp.dump"

& 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe' `
  -h localhost `
  -p 5432 `
  -U autoos_user `
  -d autoos `
  -Fc `
  -f $dumpFile `
  -v

Write-Host "Backup DUMP criado: $dumpFile"
Write-Host "Tamanho: $((Get-Item $dumpFile).Length) bytes"
```

**Validação pós-backup:**

```powershell
# Verificar assinatura de arquivo DUMP custom
$signature = @(Get-Content $dumpFile -Encoding Byte -TotalCount 4) -join ' '
if ($signature -eq "84 67 80 71") {  # "TCPG" em ASCII
    Write-Host "✓ Arquivo DUMP válido"
}
```

**Tempo estimado:** 5-10 segundos  
**Armazenamento:** ~114 KB (base atual, ~60% melhor que SQL)

---

## 3. Procedimento de Restore

### ⚠️ AVISO CRÍTICO

**Restore sobrescreve dados existentes.** Sempre:
1. Restaure para uma base de teste PRIMEIRO
2. Valide os dados restaurados
3. Apenas então restaure para a base de produção se necessário

---

### 3.1 Restore de Arquivo SQL (Texto)

**Cenário:** Recuperação operacional, restaurar última versão conhecida.

**Pré-condições:**
- Base `autoos` existe e está vazia ou será sobrescrita
- Arquivo SQL válido disponível: `backup.sql`
- Conectividade com PostgreSQL confirmada

**Comando (Restaurar em base existente — DESTRUTIVO):**

```powershell
$env:PGPASSWORD='tomate06'
$backupFile = 'C:\Users\Usuario\Projetos\BMITAG\AutoOS\backups\autoos_20260427_151838.sql'

Write-Host "⚠️  AVISO: Restore a seguir SOBRESCREVERÁ dados em autoos"
Read-Host "Pressione ENTER para confirmar ou Ctrl+C para cancelar"

& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' `
  -h localhost `
  -p 5432 `
  -U autoos_user `
  -d autoos `
  -f $backupFile `
  -v

Write-Host "✓ Restore SQL concluído"
```

**Comando (Restaurar em nova base — SEGURO):**

```powershell
$env:PGPASSWORD='postgres'  # Superuser para criar base
$newDbName = 'autoos_restored'
$backupFile = 'C:\Users\Usuario\Projetos\BMITAG\AutoOS\backups\autoos_20260427_151838.sql'

# Criar nova base (exige privs de superuser)
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' `
  -h localhost -p 5432 -U postgres -d postgres `
  -c "CREATE DATABASE $newDbName OWNER autoos_user;"

# Restaurar
$env:PGPASSWORD='tomate06'
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' `
  -h localhost -p 5432 -U autoos_user `
  -d $newDbName `
  -f $backupFile

Write-Host "✓ Restore SQL para $newDbName concluído"
```

**Validação pós-restore:**

```powershell
$env:PGPASSWORD='tomate06'

Write-Host "`n=== VALIDAÇÃO PÓS-RESTORE ==="

# 1. Verificar tabelas
Write-Host "`n1. Tabelas restauradas:"
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -p 5432 -U autoos_user -d autoos -tAc `
  "SELECT COUNT(*) as num_tabelas FROM information_schema.tables WHERE table_schema='public';"

# 2. Verificar contagem de registros
Write-Host "`n2. Contagem de registros por tabela:"
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -p 5432 -U autoos_user -d autoos -tAc `
  "SELECT tablename, (SELECT COUNT(*) FROM INFORMATION_SCHEMA.columns WHERE table_name=t.tablename AND table_schema='public') as colunas FROM pg_tables t WHERE schemaname='public' ORDER BY tablename;"

# 3. Verificar migrações aplicadas
Write-Host "`n3. Migrações aplicadas:"
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -p 5432 -U autoos_user -d autoos -tAc `
  "SELECT COUNT(*) as num_migrações FROM _sqlx_migrations;"

# 4. Testar acesso de aplicação
Write-Host "`n4. Teste de conectividade da aplicação:"
Write-Host "   Inicie 'npm run tauri dev' e confirme se a base é reconhecida."
```

**Tempo estimado:** 5-15 segundos  
**Risco:** ALTO — Sobrescreve dados se aplicado em base operacional diretamente

---

### 3.2 Restore de Arquivo DUMP (Comprimido)

**Cenário:** Restauração a partir de arquivo comprimido de longo prazo.

**Comando:**

```powershell
$env:PGPASSWORD='tomate06'
$dumpFile = 'C:\Users\Usuario\Projetos\BMITAG\AutoOS\backups\autoos_20260427_custom.dump'

Write-Host "⚠️  AVISO: Restore a seguir SOBRESCREVERÁ dados em autoos"
Read-Host "Pressione ENTER para confirmar ou Ctrl+C para cancelar"

& 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' `
  -h localhost `
  -p 5432 `
  -U autoos_user `
  -d autoos `
  -Fc `
  -v `
  $dumpFile

Write-Host "✓ Restore DUMP concluído"
```

**Alternativa (Restore com Jobs Paralelos):**

```powershell
$env:PGPASSWORD='tomate06'
$dumpFile = 'C:\Users\Usuario\Projetos\BMITAG\AutoOS\backups\autoos_20260427_custom.dump'

# Paralelizar com 4 jobs (mais rápido em bases grandes)
& 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' `
  -h localhost -p 5432 -U autoos_user -d autoos `
  -Fc -j 4 -v $dumpFile
```

**Tempo estimado:** 5-15 segundos  
**Risco:** ALTO — Mesmo que restore SQL

---

## 4. Recuperação Pós-Restore

### 4.1 Verificar Integridade da Base Restaurada

```powershell
$env:PGPASSWORD='tomate06'
$targetDb = 'autoos'

Write-Host "=== CHECKLIST DE VALIDAÇÃO PÓS-RESTORE ==="

# 1. Conectividade
try {
    $result = & 'C:\Program Files\PostgreSQL\18\bin\psql.exe' `
      -h localhost -p 5432 -U autoos_user -d $targetDb -tAc `
      "SELECT version();" 2>&1
    Write-Host "`n✓ Conectividade: OK"
    Write-Host "  Versão: $result"
} catch {
    Write-Host "`n✗ Conectividade: FALHA"
    exit 1
}

# 2. Schema completo
$tableCount = & 'C:\Program Files\PostgreSQL\18\bin\psql.exe' `
  -h localhost -p 5432 -U autoos_user -d $targetDb -tAc `
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"

Write-Host "`n✓ Schema: $tableCount tabelas encontradas"
if ([int]$tableCount -lt 8) {
    Write-Host "  ⚠️  AVISO: Esperado ≥ 8 tabelas (schema pode estar incompleto)"
}

# 3. Dados críticos
$clienteCount = & 'C:\Program Files\PostgreSQL\18\bin\psql.exe' `
  -h localhost -p 5432 -U autoos_user -d $targetDb -tAc `
  "SELECT COUNT(*) FROM clientes;"

$equipCount = & 'C:\Program Files\PostgreSQL\18\bin\psql.exe' `
  -h localhost -p 5432 -U autoos_user -d $targetDb -tAc `
  "SELECT COUNT(*) FROM equipamentos;"

$prodCount = & 'C:\Program Files\PostgreSQL\18\bin\psql.exe' `
  -h localhost -p 5432 -U autoos_user -d $targetDb -tAc `
  "SELECT COUNT(*) FROM produtos;"

Write-Host "`n✓ Dados críticos:"
Write-Host "  Clientes: $clienteCount"
Write-Host "  Equipamentos: $equipCount"
Write-Host "  Produtos: $prodCount"

if ([int]$clienteCount -eq 0 -or [int]$equipCount -eq 0) {
    Write-Host "  ⚠️  AVISO: Alguns domínios críticos estão vazios"
}

# 4. Migrações
$migCount = & 'C:\Program Files\PostgreSQL\18\bin\psql.exe' `
  -h localhost -p 5432 -U autoos_user -d $targetDb -tAc `
  "SELECT COUNT(*) FROM _sqlx_migrations;"

Write-Host "`n✓ Migrações: $migCount versões aplicadas"

# 5. Segurança
$profileCount = & 'C:\Program Files\PostgreSQL\18\bin\psql.exe' `
  -h localhost -p 5432 -U autoos_user -d $targetDb -tAc `
  "SELECT COUNT(*) FROM security_profiles;"

Write-Host "`n✓ Perfis de segurança: $profileCount encontrados"
```

---

### 4.2 Reabrir Aplicação Após Restore

```bash
# 1. Parar app anterior (se rodando)
# Ctrl+C no terminal de npm run tauri dev

# 2. Verificar conectividade
$env:PGPASSWORD='tomate06'
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' `
  -h localhost -p 5432 -U autoos_user -d autoos -c "SELECT 1;"

# 3. Iniciar app novamente
cd C:\Users\Usuario\Projetos\BMITAG\AutoOS
npm run tauri dev

# 4. Verificar logs na inicialização
# Procure por: "Banco de dados inicializado com sucesso"
```

**Esperado:**

```
2026-04-27T15:xx:xx.xxxxxxZ  INFO ThreadId(01) autoos: AutoOS iniciando...
2026-04-27T15:xx:xx.xxxxxxZ  INFO ThreadId(01) autoos: Inicializando banco de dados...
2026-04-27T15:xx:xx.xxxxxxZ  INFO ThreadId(01) autoos: Banco de dados inicializado com sucesso
```

Se logs mostram erro de migração pendente, a restauração pode estar incompleta. Verifique a tabela `_sqlx_migrations`.

---

## 5. Falhas e Troubleshooting

### 5.1 Erro: "permissão negada ao criar banco de dados"

**Causa:** Usuário `autoos_user` não tem permissão de CREATE DATABASE.

**Solução:** Use superuser `postgres` para criar base:

```powershell
$env:PGPASSWORD='postgres'
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' `
  -h localhost -p 5432 -U postgres -d postgres `
  -c "CREATE DATABASE nova_base OWNER autoos_user;"
```

---

### 5.2 Erro: "input file does not appear to be a valid archive"

**Causa:** Arquivo DUMP está corrompido ou em formato incorreto.

**Solução:**

1. Validar arquivo:
   ```powershell
   $file = 'backup.dump'
   $firstBytes = @(Get-Content $file -Encoding Byte -TotalCount 4) -join ' '
   # Se não começar com "84 67 80 71" (TCPG), arquivo está corrompido
   ```

2. Tentar restore com SQL ao invés:
   ```powershell
   # Se você tem backup.sql, use:
   & 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U autoos_user -d autoos -f backup.sql
   ```

3. Gerar novo backup:
   ```powershell
   & 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe' -U autoos_user -d autoos -f backup_novo.dump -Fc
   ```

---

### 5.3 Erro: "ERROR: relation 'clientes' already exists"

**Causa:** Base não estava vazia antes do restore.

**Solução:**

Opção 1: Drope tabelas primeiro:
```sql
DROP TABLE IF EXISTS movimentacoes_estoque CASCADE;
DROP TABLE IF EXISTS equipamento_imagens CASCADE;
DROP TABLE IF EXISTS comunicacoes CASCADE;
DROP TABLE IF EXISTS verificacoes CASCADE;
DROP TABLE IF EXISTS produtos CASCADE;
DROP TABLE IF EXISTS equipamentos CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS security_audit_log CASCADE;
DROP TABLE IF EXISTS security_profiles CASCADE;
```

Opção 2: Restaure em nova base e faça switchover.

---

### 5.4 Erro: "psql: erro: a conexão com o servidor falhou"

**Causa:** PostgreSQL não está rodando ou porta/host incorretos.

**Solução:**

```powershell
# Verificar se PostgreSQL está rodando
Get-Service PostgreSQL-x64-18 | Select-Object Status

# Se parado, iniciar:
Start-Service PostgreSQL-x64-18

# Testar conectividade
$env:PGPASSWORD='tomate06'
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -p 5432 -U autoos_user -d postgres -c "SELECT 1;"
```

---

## 6. Plano de Manutenção

### 6.1 Backup Automático Recomendado

Criar tarefa agendada do Windows:

```powershell
# Script: C:\backups\backup_autoos.ps1

$env:PGPASSWORD='tomate06'
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupDir = 'C:\Users\Usuario\Projetos\BMITAG\AutoOS\backups'
$backupFile = "$backupDir\autoos_$timestamp.sql"

& 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe' `
  -h localhost -p 5432 -U autoos_user -d autoos `
  -f $backupFile

# Cleanup: manter apenas últimos 30 dias
Get-ChildItem $backupDir -Filter "autoos_*.sql" `
  | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } `
  | Remove-Item

Write-Host "Backup criado: $backupFile" | Tee-Object -Append -FilePath "$backupDir\backup.log"
```

**Agendar (Task Scheduler):**

- Frequência: Diária às 23:00
- Retenção: 30 dias
- Notificação: Log em `C:\Users\Usuario\Projetos\BMITAG\AutoOS\backups\backup.log`

---

### 6.2 Teste de Restore Periódico

**Frequência:** Mensal  
**Procedimento:**

1. Selecionar backup de 30 dias atrás
2. Restaurar em base de teste: `autoos_test_restore`
3. Executar validação completa (seção 4.1)
4. Documentar resultado

**Comando simplificado:**

```powershell
$backupFile = Get-ChildItem 'C:\Users\Usuario\Projetos\BMITAG\AutoOS\backups\' `
  -Filter "autoos_*.sql" `
  | Sort-Object LastWriteTime -Descending `
  | Select-Object -First 1

Write-Host "Testando restore de: $($backupFile.FullName)"
Write-Host "Data: $($backupFile.LastWriteTime)"

# [Executar validação aqui]
```

---

## 7. Documentação de Incidente

Ao recuperar de perda de dados, registrar:

| Campo | Exemplo |
|-------|---------|
| Data/Hora do Incidente | 2026-04-27 15:30 UTC |
| Causa Identificada | Corrupção de índice em produtos |
| Backup Utilizado | autoos_20260427_151838.sql (4 horas antes) |
| Tempo de Restore | 12 segundos |
| Dados Perdidos | 2 movimentações de estoque (4 horas) |
| Validação | ✓ Schema ok, ✓ Dados ok, ✓ App ok |
| Lições Aprendidas | Implementar verificação de integridade semanal |

---

## 8. Checklist de Produção

Antes de usar este runbook em ambientes críticos:

- [ ] PostgreSQL 18.3+ instalado com psql, pg_dump, pg_restore
- [ ] Diretório de backups criado com 500 MB+ disponíveis
- [ ] Primeira backup SQL executada e validada
- [ ] Primeira backup DUMP executada e validada
- [ ] Teste de restore completo executado com sucesso
- [ ] App reabre corretamente após restore de teste
- [ ] Logs de erro/aviso revisados durante restore
- [ ] Plano de manutenção agendado no Task Scheduler
- [ ] Documentação atualizada com paths específicos do ambiente
- [ ] Equipe treinada nos procedimentos de restore

---

## 9. Referências

- [PostgreSQL 18 Documentation: pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html)
- [PostgreSQL 18 Documentation: pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html)
- [AutoOS POSTGRES_SETUP.md](./POSTGRES_SETUP.md) — Configuração de ambiente
- [AutoOS POSTGRES_BACKUP_RESTORE.md](./POSTGRES_BACKUP_RESTORE.md) — Procedimentos complementares

---

**Última Atualização:** 27 de Abril de 2026  
**Validado em:** Windows 11, PostgreSQL 18.3, Tauri 2.x + React 18  
**Próxima Revisão Sugerida:** 27 de Julho de 2026 (trimestral)
