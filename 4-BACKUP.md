# AutoOS - Backup e Restore

## Visão Geral

Este documento consolida os procedimentos de backup e restore do AutoOS.

**Importante:** O backup/restore real requer PostgreSQL e ferramentas instaladas (`pg_dump`, `pg_restore`, `psql`).

---

## Via App

Em `Configurações > Segurança > Backup e restore do banco`:

1. **Validar ferramentas** -确认 pg_dump, pg_restore, psql disponíveis
2. **Gerar backup agora** - Cria arquivo .dump com data/hora
3. **Restaurar backup** - Solicita caminho absoluto + confirmación "RESTAURAR"

O app registra auditoria de todas as operações.

---

## Via Linha de Comando

### Backup SQL (texto)

```bash
export PGPASSWORD="SUA_SENHA"
mkdir -p "$HOME/AutoOS/backups"

pg_dump -h localhost -p 5432 -U autoos_user -d autoos \
  -f "$HOME/AutoOS/backups/autoos_$(date +%Y%m%d_%H%M%S).sql"

unset PGPASSWORD
```

### Backup DUMP (custom - recomendado)

```bash
export PGPASSWORD="SUA_SENHA"
mkdir -p "$HOME/AutoOS/backups"

pg_dump -h localhost -p 5432 -U autoos_user -d autoos \
  -Fc -f "$HOME/AutoOS/backups/autoos_$(date +%Y%m%d_%H%M%S).dump"

unset PGPASSWORD
```

### Restore SQL

```bash
export PGPASSWORD="SUA_SENHA"

psql -h localhost -p 5432 -U autoos_user -d autoos \
  -f "$HOME/AutoOS/backups/autoos_YYYYMMDD_HHMMSS.sql"

unset PGPASSWORD
```

### Restore DUMP

```bash
export PGPASSWORD="SUA_SENHA"

pg_restore --clean --if-exists --no-owner --no-privileges \
  -h localhost -p 5432 -U autoos_user -d autoos \
  "$HOME/AutoOS/backups/autoos_YYYYMMDD_HHMMSS.dump"

unset PGPASSWORD
```

---

## Pós-Restore

1. Iniciar app: `npm run tauri dev`
2. Backend reaplica migrações pendentes
3. Validar em `Configurações > Segurança > Banco e schema`
4. Conferir dados críticas (clientes, equipamentos, produtos)

---

## Validação Pós-Restore

```bash
export PGPASSWORD="SUA_SENHA"

# Conectividade
psql -h localhost -p 5432 -U autoos_user -d autoos -tAc "SELECT version();"

# Tabelas
psql -h localhost -p 5432 -U autoos_user -d autoos -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"

# Dados
psql -h localhost -p 5432 -U autoos_user -d autoos -tAc "SELECT COUNT(*) FROM clientes;"
psql -h localhost -p 5432 -U autoos_user -d autoos -tAc "SELECT COUNT(*) FROM equipamentos;"
psql -h localhost -p 5432 -U autoos_user -d autoos -tAc "SELECT COUNT(*) FROM produtos;"

# Migrações aplicadas
psql -h localhost -p 5432 -U autoos_user -d autoos -tAc "SELECT COUNT(*) FROM _sqlx_migrations;"

unset PGPASSWORD
```

---

## Rotina Recomendada

- Backup antes de mudança estrutural
- Backup antes de troca de máquina
- Testar restore em ambiente controlado
- Rejeitar em base nova, validar, só depois aplicar na operacional

---

## Troubleshooting

| Sintoma | Ação |
|--------|------|
| psql not found | Instalar cliente PostgreSQL |
| Connection refused | Subir serviço PostgreSQL |
| permission denied | Reaplicar GRANT no schema |

---

## Referências

- Setup: [1-SETUP.md](./1-SETUP.md)
- Produção: [2-PRODUCTION.md](./2-PRODUCTION.md)
- Roadmap: [3-NEXT_STEPS.md](./3-NEXT_STEPS.md)