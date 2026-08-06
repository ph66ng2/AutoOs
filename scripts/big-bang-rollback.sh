#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# big-bang-rollback.sh
# ═══════════════════════════════════════════════════════════════════════════════
# Rolls back a Big-Bang migration by restoring the local PostgreSQL database
# from the safety backup created by big-bang-migration.sh.
#
# Also restores the original database-config.json from its pre-migration backup.
#
# Usage:
#   ./scripts/big-bang-rollback.sh [--backup-file path/to/safety_backup.dump]
#
# If --backup-file is not provided, the script uses the most recent
# safety_backup_*.dump in ~/AutoOS/backups/migrations/.
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ─── Argument Parsing ─────────────────────────────────────────────────────────
BACKUP_FILE=""
LOCAL_DB_URL=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --backup-file)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --local-db-url)
            LOCAL_DB_URL="$2"
            shift 2
            ;;
        -h|--help)
            cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --backup-file PATH         Path to safety backup .dump file
  --local-db-url URL         Local PostgreSQL connection string
  -h, --help                 Show this help

Environment variables:
  DATABASE_URL               Local DB (fallback if --local-db-url not given)
EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ─── Resolve DATABASE_URL ──────────────────────────────────────────────────────
if [[ -z "$LOCAL_DB_URL" ]]; then
    LOCAL_DB_URL="${DATABASE_URL:-}"
fi
if [[ -z "$LOCAL_DB_URL" ]]; then
    PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
    if [[ -f "${PROJECT_DIR}/src-tauri/.env" ]]; then
        LOCAL_DB_URL=$(grep -E '^DATABASE_URL=' "${PROJECT_DIR}/src-tauri/.env" | cut -d= -f2- | tr -d '"')
    fi
fi
if [[ -z "$LOCAL_DB_URL" ]]; then
    log_error "Local DATABASE_URL not found. Set env var or use --local-db-url."
    exit 1
fi

# ─── Find Safety Backup ────────────────────────────────────────────────────────
MIGRATION_DIR="${HOME}/AutoOS/backups/migrations"

if [[ -z "$BACKUP_FILE" ]]; then
    BACKUP_FILE=$(ls -t "${MIGRATION_DIR}"/safety_backup_*.dump 2>/dev/null | head -n1)
    if [[ -z "$BACKUP_FILE" ]]; then
        log_error "No safety backup found in ${MIGRATION_DIR}"
        log_error "Run with --backup-file to specify one explicitly."
        exit 1
    fi
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
    log_error "Backup file not found: $BACKUP_FILE"
    exit 1
fi

log_info "Using safety backup: $BACKUP_FILE"

# ─── Confirm Destructive Action ────────────────────────────────────────────────
echo ""
echo "WARNING: This will DESTROY the current local database and restore from backup."
echo "Local DB: $LOCAL_DB_URL"
echo "Backup:   $BACKUP_FILE"
echo ""
read -rp "Type 'RESTORE' to confirm: " CONFIRM
if [[ "$CONFIRM" != "RESTORE" ]]; then
    log_error "Confirmation failed. Rollback aborted."
    exit 1
fi

# ─── Restore Database ──────────────────────────────────────────────────────────
log_info "Restoring local database from safety backup..."

# Drop and recreate to ensure clean state
DB_NAME=$(echo "$LOCAL_DB_URL" | sed -n 's|.*/\([^/]*\)$|\1|p')
ADMIN_URL=$(echo "$LOCAL_DB_URL" | sed "s|/${DB_NAME}|/postgres|")

# Try to terminate existing connections
psql "$ADMIN_URL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true

pg_restore \
    --dbname="$LOCAL_DB_URL" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    "$BACKUP_FILE"

log_info "Database restored successfully."

# ─── Restore database-config.json ──────────────────────────────────────────────
CONFIG_FILE=""
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CONFIG_FILE="${HOME}/.local/share/AutoOS/database-config.json"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    CONFIG_FILE="${LOCALAPPDATA}/AutoOS/database-config.json"
else
    CONFIG_FILE="${HOME}/.local/share/AutoOS/database-config.json"
fi

if [[ -f "$CONFIG_FILE" ]]; then
    BACKUP_CONFIG=$(ls -t "$(dirname "$CONFIG_FILE")"/database-config.json.pre-migration-*.bak 2>/dev/null | head -n1)
    if [[ -n "$BACKUP_CONFIG" && -f "$BACKUP_CONFIG" ]]; then
        cp "$BACKUP_CONFIG" "$CONFIG_FILE"
        log_info "Restored database-config.json from: $BACKUP_CONFIG"
    else
        log_warn "No pre-migration backup of database-config.json found."
        log_warn "You may need to manually update $CONFIG_FILE to point to local PostgreSQL."
    fi
else
    log_warn "No database-config.json found at $CONFIG_FILE"
fi

# ─── Done ──────────────────────────────────────────────────────────────────────
log_info "═══════════════════════════════════════════════════════════════"
log_info "ROLLBACK COMPLETED"
log_info "═══════════════════════════════════════════════════════════════"
log_info "Local database restored from: $BACKUP_FILE"
log_info ""
log_info "Next steps:"
log_info "  1. Restart the AutoOS app to reconnect to local PostgreSQL."
log_info "  2. Verify data integrity in the app."
log_info "═══════════════════════════════════════════════════════════════"

exit 0
