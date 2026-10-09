#!/usr/bin/env bash
# Deployt das Frontend auf GitHub Pages (schompf.michoest.com) – nur von main aus.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$(git branch --show-current)" != "main" ]; then
  echo "Produktions-Deploy nur von main aus (aktuell: $(git branch --show-current))." >&2
  exit 1
fi
cd app && npm run deploy
