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
ssh pi5 "REFRESH_DB=$REFRESH_DB bash -s" <<'REMOTE'
set -euo pipefail
cd ~/dev/schompf-dev
git fetch -q origin && git checkout -q dev && git reset -q --hard origin/dev
if [ "$REFRESH_DB" = "--refresh-db" ] || [ ! -f api/data/db.json ]; then
  mkdir -p api/data && cp ~/dev/schompf-1/api/data/db.json api/data/db.json
  echo "Dev-DB aus Live-DB kopiert"
fi
cd api
npm ci --omit=dev --no-audit --no-fund
pm2 startOrRestart ecosystem.dev.config.cjs --update-env
pm2 save >/dev/null
sleep 2
curl -fsS http://127.0.0.1:3010/health && echo
REMOTE

(cd app && npx vite build --mode staging --logLevel warn)
rsync -a --delete --chmod=D755,F644 app/dist/ pi5:/srv/schompf-dev/
echo "Dev deployt: $(git log -1 --format='%h %s') → https://schompf-dev.michoest.com"
