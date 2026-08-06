#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# big-bang-migration.sh
# ═══════════════════════════════════════════════════════════════════════════════
# Orchestrates the full Big-Bang migration from local PostgreSQL (SERIAL PKs)
# to Supabase (UUID PKs).
#
# Steps:
#   1. Safety backup (pg_dump → timestamped file)
#   2. Export data-only dump from local PG
#   3. Run migrate_serial_to_uuid.py on the dump
#   4. Import transformed SQL to Supabase via psql
#   5. Verify row counts (local vs Supabase, all 13 tables)
#   6. If counts OK, update app config to Supabase
#
# Dry-run mode: --dry-run skips import (steps 4-6)
#
# Prerequisites:
#   - pg_dump, pg_restore, psql in PATH
#   - Python 3.8+ with standard library
#   - Local DATABASE_URL configured (env var or src-tauri/.env)
#   - Supabase connection string in env: SUPABASE_DATABASE_URL
#   - database-config.json exists in app data dir (will be backed up)
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ─── Defaults ──────────────────────────────────────────────────────────────────
DRY_RUN=false
LOCAL_DB_URL=""
SUPABASE_DB_URL=""
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${HOME}/AutoOS/backups"
MIGRATION_DIR="${BACKUP_DIR}/migrations"
SAFETY_BACKUP="${MIGRATION_DIR}/safety_backup_${TIMESTAMP}.dump"
DATA_DUMP="${MIGRATION_DIR}/data_dump_${TIMESTAMP}.sql"
TRANSFORMED_SQL="${MIGRATION_DIR}/transformed_${TIMESTAMP}.sql"
VERIFY_LOG="${MIGRATION_DIR}/verify_${TIMESTAMP}.log"

# ─── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ─── Argument Parsing ─────────────────────────────────────────────────────────
usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --dry-run                  Skip import and config update (steps 4-6)
  --local-db-url URL         Local PostgreSQL connection string
  --supabase-db-url URL      Supabase PostgreSQL connection string
  -h, --help                 Show this help

Environment variables:
  DATABASE_URL               Local DB (fallback if --local-db-url not given)
  SUPABASE_DATABASE_URL      Supabase DB (fallback if --supabase-db-url not given)
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --local-db-url)
            LOCAL_DB_URL="$2"
            shift 2
            ;;
        --supabase-db-url)
            SUPABASE_DB_URL="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# ─── Resolve DATABASE_URLs ───────────────────────────────────────────────────
if [[ -z "$LOCAL_DB_URL" ]]; then
    LOCAL_DB_URL="${DATABASE_URL:-}"
fi
if [[ -z "$LOCAL_DB_URL" ]]; then
    if [[ -f "${PROJECT_DIR}/src-tauri/.env" ]]; then
        LOCAL_DB_URL=$(grep -E '^DATABASE_URL=' "${PROJECT_DIR}/src-tauri/.env" | cut -d= -f2- | tr -d '"')
    fi
fi
if [[ -z "$LOCAL_DB_URL" ]]; then
    log_error "Local DATABASE_URL not found. Set env var or use --local-db-url."
    exit 1
fi

if [[ -z "$SUPABASE_DB_URL" ]]; then
    SUPABASE_DB_URL="${SUPABASE_DATABASE_URL:-}"
fi
if [[ -z "$SUPABASE_DB_URL" ]]; then
    log_error "Supabase DATABASE_URL not found. Set SUPABASE_DATABASE_URL env var or use --supabase-db-url."
    exit 1
fi

# ─── Pre-flight Checks ─────────────────────────────────────────────────────────
log_info "Pre-flight checks..."

for cmd in pg_dump pg_restore psql python3; do
    if ! command -v "$cmd" &>/dev/null; then
        log_error "Required command not found: $cmd"
        exit 1
    fi
done

if [[ ! -f "${SCRIPT_DIR}/migrate_serial_to_uuid.py" ]]; then
    log_error "Python transform script not found: ${SCRIPT_DIR}/migrate_serial_to_uuid.py"
    exit 1
fi

mkdir -p "$MIGRATION_DIR"

# ─── Step 1: Safety Backup ─────────────────────────────────────────────────────
log_info "Step 1/6: Creating safety backup of local database..."
pg_dump "$LOCAL_DB_URL" \
    --format=custom \
    --file="$SAFETY_BACKUP"
log_info "Safety backup saved to: $SAFETY_BACKUP"

# ─── Step 2: Export Data-Only Dump ─────────────────────────────────────────────
log_info "Step 2/6: Exporting data-only dump from local PostgreSQL..."
pg_dump "$LOCAL_DB_URL" \
    --data-only \
    --inserts \
    --no-owner \
    --no-privileges \
    --file="$DATA_DUMP"
log_info "Data dump saved to: $DATA_DUMP"

# ─── Step 3: Transform ─────────────────────────────────────────────────────────
log_info "Step 3/6: Running UUID transformation..."
python3 "${SCRIPT_DIR}/migrate_serial_to_uuid.py" \
    --input "$DATA_DUMP" \
    --output "$TRANSFORMED_SQL"
log_info "Transformed SQL saved to: $TRANSFORMED_SQL"

if [[ "$DRY_RUN" == true ]]; then
    log_warn "DRY-RUN mode active — skipping import, verification, and config update."
    log_info "Transformed SQL is ready at: $TRANSFORMED_SQL"
    log_info "Review it, then run again without --dry-run to complete migration."
    exit 0
fi

# ─── Step 4: Import to Supabase ────────────────────────────────────────────────
log_info "Step 4/6: Importing transformed SQL to Supabase..."
log_warn "This will write data to the Supabase database. Ensure the target schema is already deployed."

# Apply seed first (empresa + configuracoes_sistema defaults)
if [[ -f "${PROJECT_DIR}/supabase/seed.sql" ]]; then
    log_info "Applying Supabase seed (empresas, configuracoes_sistema, security_profiles)..."
    psql "$SUPABASE_DB_URL" \
        --file="${PROJECT_DIR}/supabase/seed.sql" \
        --set ON_ERROR_STOP=on
fi

# Apply transformed data
psql "$SUPABASE_DB_URL" \
    --file="$TRANSFORMED_SQL" \
    --set ON_ERROR_STOP=on

log_info "Import completed."

# ─── Step 5: Verify Row Counts ─────────────────────────────────────────────────
log_info "Step 5/6: Verifying row counts (local vs Supabase)..."

TABLES=(
    clientes
    equipamentos
    produtos
    movimentacoes_estoque
    verificacoes
    comunicacoes
    security_profiles
    security_audit_log
    equipamento_imagens
    servicos_catalogo
    gastos_fixos
    gastos_variaveis
    configuracoes_sistema
)

VERIFICATION_PASSED=true

for table in "${TABLES[@]}"; do
    local_count=$(psql "$LOCAL_DB_URL" -t -c "SELECT COUNT(*) FROM ${table};" | xargs)
    remote_count=$(psql "$SUPABASE_DB_URL" -t -c "SELECT COUNT(*) FROM ${table};" | xargs)

    if [[ "$local_count" == "$remote_count" ]]; then
        log_info "  ${table}: ${local_count} rows ✓"
    else
        log_error "  ${table}: LOCAL=${local_count} vs SUPABASE=${remote_count} ✗ MISMATCH!"
        VERIFICATION_PASSED=false
    fi
done

if [[ "$VERIFICATION_PASSED" == false ]]; then
    log_error "Verification FAILED — row counts do not match."
    log_error "Check ${VERIFY_LOG} for details."
    log_error "Consider running big-bang-rollback.sh to restore local state."
    exit 3
fi

log_info "Verification PASSED — all 13 tables match."

# ─── Step 6: Update App Config ─────────────────────────────────────────────────
log_info "Step 6/6: Updating app config to point to Supabase..."

# Parse Supabase URL to extract components for database-config.json
# Format: postgres://username:password@host:port/database
if [[ "$SUPABASE_DB_URL" =~ postgres://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+) ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASS="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
else
    log_warn "Could not parse Supabase URL for database-config.json. Manual update required."
    DB_USER=""
    DB_PASS=""
    DB_HOST=""
    DB_PORT="5432"
    DB_NAME=""
fi

# Determine config file path (Linux / Windows / macOS)
CONFIG_FILE=""
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CONFIG_FILE="${HOME}/.local/share/AutoOS/database-config.json"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    CONFIG_FILE="${LOCALAPPDATA}/AutoOS/database-config.json"
else
    CONFIG_FILE="${HOME}/.local/share/AutoOS/database-config.json"
fi

if [[ -n "$CONFIG_FILE" && -n "$DB_HOST" ]]; then
    mkdir -p "$(dirname "$CONFIG_FILE")"

    # Backup existing config
    if [[ -f "$CONFIG_FILE" ]]; then
        cp "$CONFIG_FILE" "${CONFIG_FILE}.pre-migration-${TIMESTAMP}.bak"
        log_info "Existing config backed up to: ${CONFIG_FILE}.pre-migration-${TIMESTAMP}.bak"
    fi

    cat > "$CONFIG_FILE" <<EOF
{
  "host": "${DB_HOST}",
  "port": ${DB_PORT},
  "database": "${DB_NAME}",
  "username": "${DB_USER}",
  "password": "${DB_PASS}"
}
EOF
    log_info "App config updated: $CONFIG_FILE"
else
    log_warn "App config NOT updated — please configure manually."
fi

# ─── Done ──────────────────────────────────────────────────────────────────────
log_info "═══════════════════════════════════════════════════════════════"
log_info "BIG-BANG MIGRATION COMPLETED SUCCESSFULLY"
log_info "═══════════════════════════════════════════════════════════════"
log_info "Safety backup:     $SAFETY_BACKUP"
log_info "Data dump:         $DATA_DUMP"
log_info "Transformed SQL:   $TRANSFORMED_SQL"
log_info ""
log_info "Next steps:"
log_info "  1. Restart the AutoOS app to connect to Supabase."
log_info "  2. Run integration tests against Supabase."
log_info "  3. If anything goes wrong, run: ./scripts/big-bang-rollback.sh"
log_info "═══════════════════════════════════════════════════════════════"

exit 0
