#!/usr/bin/env bash
# Holt die Live-Datenbank vom Pi nach api/data/db.json (für lokale Entwicklung).
# Die lokale Kopie wird vorher nach api/data/db.local-backup.json gesichert.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p api/data
[ -f api/data/db.json ] && cp api/data/db.json api/data/db.local-backup.json
scp -q pi5:dev/schompf-1/api/data/db.json api/data/db.json
echo "db.json vom Pi geholt ($(du -h api/data/db.json | cut -f1))"
