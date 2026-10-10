#!/usr/bin/env bash
# Deployt den Branch dev auf die Dev-Instanz (schompf-dev.michoest.com):
# API aus ~/dev/schompf-dev (PM2 schompf-dev-api, Port 3010), Frontend nach /srv/schompf-dev.
# Mit --refresh-db wird vorher die Live-Datenbank in die Dev-Instanz kopiert.
set -euo pipefail
cd "$(dirname "$0")/.."

git fetch -q origin
if [ "$(git rev-parse dev)" != "$(git rev-parse origin/dev)" ]; then
  echo "dev ist nicht synchron mit origin/dev – erst pushen." >&2
  exit 1
fi

REFRESH_DB="${1:-}"
# Produkt-Zuordnung für die Übernahme liegt nicht im Git (Haushaltsdaten) → mitkopieren
scp -q api/data/migration/produkte.json pi5:dev/schompf-dev/api/data/migration/produkte.json 2>/dev/null \
  || { ssh pi5 'mkdir -p ~/dev/schompf-dev/api/data/migration' && scp -q api/data/migration/produkte.json pi5:dev/schompf-dev/api/data/migration/produkte.json; }
ssh pi5 "REFRESH_DB=$REFRESH_DB bash -s" <<'REMOTE'
set -euo pipefail
cd ~/dev/schompf-dev
git fetch -q origin && git checkout -q dev && git reset -q --hard origin/dev
cd api
npm ci --omit=dev --no-audit --no-fund
if [ "$REFRESH_DB" = "--refresh-db" ] || [ ! -f data/schompf.db ]; then
  pm2 stop schompf-dev-api >/dev/null 2>&1 || true
  cp ~/dev/schompf-1/api/data/db.json data/db.json
  KEEP=""
  if [ -f data/schompf.db ]; then node scripts/backup.js data/schompf.prev.db && KEEP="--keep-auth data/schompf.prev.db"; fi
  node scripts/migrate-from-json.js --force $KEEP | grep -v '^ *"' | grep -v '^[{}]'
  echo "Dev-DB frisch aus Live-Daten übernommen"
fi
pm2 startOrRestart ecosystem.dev.config.cjs --update-env
pm2 save >/dev/null
sleep 2
curl -fsS http://127.0.0.1:3010/health && echo
REMOTE

(cd app && npx vite build --mode staging --logLevel warn)
rsync -a --delete app/dist/ pi5:/srv/schompf-dev/
ssh pi5 'chmod -R u=rwX,go=rX /srv/schompf-dev'  # Caddy muss lesen dürfen
echo "Dev deployt: $(git log -1 --format='%h %s') → https://schompf-dev.michoest.com"
