#!/usr/bin/env bash
# Holt eine konsistente Kopie der Live-Datenbank (SQLite) vom Pi nach api/data/schompf.db (für lokale Entwicklung).
# Die lokale Kopie wird vorher nach api/data/schompf.local-backup.db gesichert. Lokale Server vorher beenden.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p api/data
[ -f api/data/schompf.db ] && cp api/data/schompf.db api/data/schompf.local-backup.db
rm -f api/data/schompf.db-wal api/data/schompf.db-shm
ssh pi5 'cd ~/dev/schompf-1/api && node scripts/backup.js /tmp/schompf-pull.db'
scp -q pi5:/tmp/schompf-pull.db api/data/schompf.db
ssh pi5 'rm -f /tmp/schompf-pull.db'
echo "schompf.db vom Pi geholt ($(du -h api/data/schompf.db | cut -f1)) – enthält echte Logins: lokal Person/Code neu anlegen mit npm run data -- code <Person>"
