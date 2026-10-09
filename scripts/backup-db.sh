#!/usr/bin/env bash
# Sichert api/data/db.json nach ~/backups/schompf (gzip) und löscht Backups älter als 30 Tage.
# Läuft auf dem Pi: täglich per Cron und vor jedem API-Deploy (scripts/deploy-api.sh).
# Optionales Argument: Suffix für den Dateinamen, z.B. "pre-deploy".
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_FILE="$REPO_DIR/api/data/db.json"
BACKUP_DIR="${SCHOMPF_BACKUP_DIR:-$HOME/backups/schompf}"
KEEP_DAYS=30

mkdir -p "$BACKUP_DIR"
name="db-$(date +%Y-%m-%d_%H%M)${1:+-$1}.json.gz"
gzip -c "$DB_FILE" > "$BACKUP_DIR/$name"
find "$BACKUP_DIR" -name 'db-*.json.gz' -mtime +"$KEEP_DAYS" -delete
echo "Backup: $BACKUP_DIR/$name"
