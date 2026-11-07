#!/usr/bin/env bash
# Deployt den Branch dev auf die Dev-Instanz (schompf-dev.michoest.com):
# API aus ~/dev/schompf-dev (PM2 schompf-dev-api, Port 3010), Frontend nach /srv/schompf-dev.
# Mit --refresh-db wird vorher die Live-Datenbank in die Dev-Instanz kopiert (Dev-Logins und Push-Abos bleiben).
set -euo pipefail
cd "$(dirname "$0")/.."

git fetch -q origin
if [ "$(git rev-parse dev)" != "$(git rev-parse origin/dev)" ]; then
  echo "dev ist nicht synchron mit origin/dev – erst pushen." >&2
  exit 1
fi

REFRESH_DB="${1:-}"
# Übernahme-Daten (Produkt-Zuordnung, Rezepte, Gerichte, Zeiten) liegen nicht im Git (Haushaltsdaten) → mitkopieren
ssh pi5 'mkdir -p ~/dev/schompf-dev/api/data/migration'
rsync -a --delete api/data/migration/ pi5:dev/schompf-dev/api/data/migration/
ssh pi5 "REFRESH_DB=$REFRESH_DB bash -s" <<'REMOTE'
set -euo pipefail
cd ~/dev/schompf-dev
git fetch -q origin && git checkout -q dev && git reset -q --hard origin/dev
cd api
npm ci --omit=dev --no-audit --no-fund
# Schlüssel für Benachrichtigungen einmalig erzeugen (bleiben in .env, nicht im Git)
grep -q '^VAPID_PUBLIC_KEY=' .env || { node scripts/schompf.js vapid >> .env && echo "VAPID-Schlüssel erzeugt"; }
if [ "$REFRESH_DB" = "--refresh-db" ] || [ ! -f data/schompf.db ]; then
  # konsistente Kopie der Live-SQLite (läuft auch, während die Live-API schreibt)
  (cd ~/dev/schompf-1/api && node scripts/backup.js /tmp/schompf-live.db)
  KEEP=""
  if [ -f data/schompf.db ]; then node scripts/backup.js data/schompf.prev.db && KEEP="--keep-auth data/schompf.prev.db"; fi
  pm2 stop schompf-dev-api >/dev/null 2>&1 || true
  node scripts/refresh-from-live.js /tmp/schompf-live.db $KEEP
  rm -f /tmp/schompf-live.db
fi
pm2 startOrRestart ecosystem.dev.config.cjs --update-env
pm2 save >/dev/null
sleep 2
curl -fsS http://127.0.0.1:3010/health && echo
REMOTE

(cd app && npx vite build --mode staging --logLevel warn)
# iOS fragt teils die Standardnamen ab (/apple-touch-icon.png …) → auf Dev auch dort die orangen Icons
cp app/public/dev/*.png app/public/dev/favicon.svg app/dist/
rsync -a --delete app/dist/ pi5:/srv/schompf-dev/
ssh pi5 'chmod -R u=rwX,go=rX /srv/schompf-dev'  # Caddy muss lesen dürfen
echo "Dev deployt: $(git log -1 --format='%h %s') → https://schompf-dev.michoest.com"
