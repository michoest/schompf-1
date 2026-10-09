#!/usr/bin/env bash
# Deployt die API auf den Pi: Backup der DB, git pull, npm ci, PM2-Neustart, Health-Check.
# Voraussetzung: lokaler main ist nach origin gepusht.
set -euo pipefail

git fetch -q origin
if [ "$(git rev-parse main)" != "$(git rev-parse origin/main)" ]; then
  echo "main ist nicht synchron mit origin/main – erst pushen." >&2
  exit 1
fi

ssh pi5 'bash -s' <<'EOF'
set -euo pipefail
cd ~/dev/schompf-1
git pull --ff-only
bash scripts/backup-db.sh pre-deploy
cd api
npm ci --omit=dev --no-audit --no-fund
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save >/dev/null
sleep 2
curl -fsS http://127.0.0.1:3000/health && echo
echo "Deployt: $(git log -1 --format='%h %s')"
EOF
