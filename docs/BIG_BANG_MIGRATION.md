# Big-Bang Migration Guide

## Overview

This guide covers the **one-time migration** of existing AutoOS data from a local PostgreSQL database (with `SERIAL INTEGER` primary keys) to Supabase (with `UUID` primary keys and multi-tenant `empresa_id` columns).

This is a **destructive, irreversible operation** on the Supabase side. The local database remains intact and can be restored from the safety backup if needed.

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **Tools** | `pg_dump`, `pg_restore`, `psql`, `python3` (3.8+) in PATH |
| **Local DB** | PostgreSQL 15+ with AutoOS schema fully migrated (migrations 0001–0013 applied) |
| **Supabase** | Target project with schema already deployed (`supabase/schema.sql` + `supabase/rls.sql`) |
| **Connection** | `DATABASE_URL` for local DB; `SUPABASE_DATABASE_URL` for Supabase |
| **Disk space** | At least 3× the current database size free (backup + dump + transformed SQL) |
| **Downtime** | App must be offline during migration (no writes to local DB) |

### Connection Strings

**Local PostgreSQL** (source):
```bash
export DATABASE_URL="postgres://autoos_user:password@localhost:5432/autoos"
```

**Supabase** (target):
```bash
export SUPABASE_DATABASE_URL="postgres://postgres:password@db.xxxxx.supabase.co:5432/postgres"
```

> **Tip:** The migration script auto-detects `DATABASE_URL` from the environment or `src-tauri/.env`.

---

## Migration Scripts

| Script | Purpose |
|--------|---------|
| `scripts/migrate_serial_to_uuid.py` | Transforms pg_dump SQL: INTEGER PKs → UUID PKs, remaps FKs, adds `empresa_id` |
| `scripts/big-bang-migration.sh` | Orchestrates the full migration (backup → dump → transform → import → verify → config update) |
| `scripts/big-bang-rollback.sh` | Restores local database from safety backup and reverts `database-config.json` |

---

## Step-by-Step Migration

### 1. Pre-Migration Checklist

- [ ] **Stop the AutoOS app** — ensure no writes happen during migration.
- [ ] **Verify local database integrity**:
  ```bash
  psql "$DATABASE_URL" -c "SELECT pg_database.datname, pg_database_size(pg_database.datname) FROM pg_database WHERE datname = 'autoos';"
  ```
- [ ] **Confirm Supabase schema is deployed**:
  ```bash
  psql "$SUPABASE_DATABASE_URL" -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clientes';"
  ```
- [ ] **Run a dry-run first**:
  ```bash
  ./scripts/big-bang-migration.sh --dry-run
  ```
- [ ] **Review transformed SQL** from dry-run output.

### 2. Execute Migration

```bash
./scripts/big-bang-migration.sh \
  --local-db-url  "$DATABASE_URL" \
  --supabase-db-url "$SUPABASE_DATABASE_URL"
```

The script performs these steps automatically:

1. **Safety backup** — `pg_dump --format=custom` → `~/AutoOS/backups/migrations/safety_backup_YYYYMMDD_HHMMSS.dump`
2. **Data-only dump** — `pg_dump --data-only --inserts` → `data_dump_*.sql`
3. **UUID transformation** — runs `migrate_serial_to_uuid.py` → `transformed_*.sql`
4. **Import to Supabase** — applies `supabase/seed.sql` then `transformed_*.sql`
5. **Row-count verification** — compares all 13 tables (local vs Supabase)
6. **Config update** — writes new `database-config.json` pointing to Supabase

### 3. Dry-Run Mode

To preview the transformation without importing:

```bash
./scripts/big-bang-migration.sh --dry-run
```

This runs steps 1–3 only and leaves the transformed SQL in `~/AutoOS/backups/migrations/` for manual review.

---

## Verification

After migration, verify:

### Row Counts
The migration script automatically compares row counts. Manual check:

```bash
for table in clientes equipamentos produtos movimentacoes_estoque verificacoes comunicacoes security_profiles security_audit_log equipamento_imagens servicos_catalogo gastos_fixos gastos_variaveis configuracoes_sistema; do
  local=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM $table;" | xargs)
  remote=$(psql "$SUPABASE_DATABASE_URL" -t -c "SELECT COUNT(*) FROM $table;" | xargs)
  echo "$table: local=$local remote=$remote"
done
```

### FK Integrity
The Python script verifies zero orphan FKs before generating output. If any orphan is found, the migration aborts with exit code `2`.

### Sample Data Spot-Check
```bash
psql "$SUPABASE_DATABASE_URL" -c "SELECT id, empresa_id, nome FROM clientes LIMIT 5;"
psql "$SUPABASE_DATABASE_URL" -c "SELECT id, empresa_id, equipamento_id, tecnico_nome FROM verificacoes LIMIT 5;"
```

All `id` and FK columns should be UUIDs. All rows should have `empresa_id = '00000000-0000-0000-0000-000000000001'`.

---

## Rollback

If anything goes wrong **before** the app config is updated (step 6), the local database is untouched and the app continues to work.

If the config was already updated or Supabase data is corrupted:

```bash
./scripts/big-bang-rollback.sh
```

This:
1. Finds the most recent safety backup in `~/AutoOS/backups/migrations/`
2. Requires typing `RESTORE` to confirm the destructive action
3. Runs `pg_restore --clean --if-exists` to restore the local database
4. Restores `database-config.json` from its pre-migration backup

To use a specific backup:
```bash
./scripts/big-bang-rollback.sh --backup-file ~/AutoOS/backups/migrations/safety_backup_20240115_120000.dump
```

---

## Estimated Time

| Phase | Duration (typical) | Notes |
|-------|-------------------|-------|
| Safety backup | 1–5 min | Depends on DB size |
| Data dump | 1–3 min | `--data-only --inserts` |
| UUID transform | 30 sec – 2 min | Python parsing + generation |
| Import to Supabase | 2–10 min | Network latency dominates |
| Verification | 10–30 sec | 13 `COUNT(*)` queries |
| Config update | Instant | Local file write |
| **Total** | **5–20 min** | For a 100 MB database |

> **Note:** `equipamento_imagens` with large `BYTEA` blobs will significantly increase dump and transform time. Consider migrating images to Supabase Storage first (see `src-tauri/src/commands/image_migration.rs`).

---

## Troubleshooting

### "Orphan FKs detected"
Some leaf table rows reference root table rows that don't exist. This indicates data corruption in the source database.

**Fix:**
```bash
psql "$DATABASE_URL" -c "DELETE FROM verificacoes WHERE equipamento_id NOT IN (SELECT id FROM equipamentos);"
```
(Repeat for each orphan FK type.)

### "Missing UUID map for table.id=X"
An INSERT references an `id` that wasn't found in the first pass. This can happen with non-standard INSERT formats.

**Fix:** Ensure `pg_dump` uses `--inserts` (which includes column lists). The script skips INSERTs without column lists.

### Row count mismatch after import
Possible causes:
- Supabase seed data already existed and conflicted with transformed data
- RLS policies blocked some inserts
- Network timeout during import

**Fix:** Check `psql` error output, fix issues, and re-run migration (the safety backup is idempotent).

### `database-config.json` not found
The script looks in platform-specific paths:
- **Linux:** `~/.local/share/AutoOS/database-config.json`
- **Windows:** `%LOCALAPPDATA%\AutoOS\database-config.json`

If the file doesn't exist, the script warns but continues. Update the config manually after migration.

---

## Important Warnings

1. **Do NOT run against production without dry-run first.**
2. **Do NOT edit the safety backup.** It is the only path to rollback.
3. **Do NOT skip verification.** Row-count mismatches indicate data loss.
4. **The migration is one-way for Supabase.** There is no script to migrate Supabase → local PostgreSQL.
5. **Image data (`equipamento_imagens.bytes`) is NOT migrated.** The target schema uses `storage_path TEXT NOT NULL`. Images must be migrated to Supabase Storage separately before or after this migration.

---

## Schema Mapping Reference

| Local Table | PK Type | Supabase PK Type | `empresa_id` | FK Changes |
|-------------|---------|------------------|--------------|------------|
| `clientes` | `SERIAL` | `uuid` | Added | — |
| `produtos` | `SERIAL` | `uuid` | Added | — |
| `equipamentos` | `SERIAL` | `uuid` | Added | `cliente_id` → `uuid` |
| `security_profiles` | `SERIAL` | `uuid` | Added | — |
| `gastos_fixos` | `SERIAL` | `uuid` | Added | — |
| `servicos_catalogo` | `SERIAL` | `uuid` | Added | — |
| `movimentacoes_estoque` | `SERIAL` | `uuid` | Added | `produto_id` → `uuid` |
| `verificacoes` | `SERIAL` | `uuid` | Added | `equipamento_id`, `adjusted_by_profile_id` → `uuid` |
| `comunicacoes` | `SERIAL` | `uuid` | Added | `equipamento_id` → `uuid` |
| `security_audit_log` | `SERIAL` | `uuid` | Added | `profile_id` → `uuid` |
| `equipamento_imagens` | `SERIAL` | `uuid` | Added | `equipamento_id` → `uuid`; `bytes` dropped, `storage_path` added |
| `gastos_variaveis` | `SERIAL` | `uuid` | Added | `referencia_id` → `uuid` |
| `configuracoes_sistema` | `INTEGER (id=1)` | `uuid (fixed)` | Added | `id` fixed to `00000000-0000-0000-0000-000000000002` |

---

## Fixed UUIDs

| Entity | UUID | Purpose |
|--------|------|---------|
| Empresa BMITAG | `00000000-0000-0000-0000-000000000001` | Added to all rows as `empresa_id` |
| Configurações Sistema | `00000000-0000-0000-0000-000000000002` | Singleton row, fixed PK |

---

## Migration Map Tables

The transform script creates auxiliary tables in the target database for audit and verification:

```sql
CREATE TABLE migration_map_clientes (old_id INTEGER PRIMARY KEY, new_uuid uuid NOT NULL UNIQUE);
-- ... one per migrated table (12 tables)
```

These allow tracing any UUID back to its original INTEGER ID.

---

## Support

If the migration fails and rollback is insufficient, contact the development team with:
1. The safety backup file path
2. The transformed SQL file path
3. The verification log
4. Any error messages from `pg_restore` or `psql`
