#!/usr/bin/env bash
# Sichert die Datenbank nach ~/backups/schompf (gzip) und löscht Backups älter als 30 Tage.
# Läuft auf dem Pi: täglich per Cron und vor jedem API-Deploy (scripts/deploy-api.sh).
# SQLite (api/data/schompf.db) wird per Backup-API konsistent kopiert; die alte db.json wird mitgesichert, solange es sie gibt.
# Optionales Argument: Suffix für den Dateinamen, z.B. "pre-deploy".
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${SCHOMPF_BACKUP_DIR:-$HOME/backups/schompf}"
KEEP_DAYS=30
STAMP="$(date +%Y-%m-%d_%H%M)${1:+-$1}"

mkdir -p "$BACKUP_DIR"
if [ -f "$REPO_DIR/api/data/schompf.db" ]; then
  TMP="$(mktemp)"
  (cd "$REPO_DIR/api" && node scripts/backup.js "$TMP")
  gzip -c "$TMP" > "$BACKUP_DIR/schompf-$STAMP.db.gz" && rm -f "$TMP"
  echo "Backup: $BACKUP_DIR/schompf-$STAMP.db.gz"
fi
if [ -f "$REPO_DIR/api/data/db.json" ]; then
  gzip -c "$REPO_DIR/api/data/db.json" > "$BACKUP_DIR/db-$STAMP.json.gz"
  echo "Backup: $BACKUP_DIR/db-$STAMP.json.gz"
fi
find "$BACKUP_DIR" \( -name 'db-*.json.gz' -o -name 'schompf-*.db.gz' \) -mtime +"$KEEP_DAYS" -delete
