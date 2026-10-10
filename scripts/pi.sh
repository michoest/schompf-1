#!/usr/bin/env bash
# Datenwerkzeug (api/scripts/schompf.js) auf dem Pi ausführen – gegen die Dev- oder die Live-Datenbank.
#   scripts/pi.sh dev gericht "Ghetti Nese" > ghetti.md
#   scripts/pi.sh dev import - --probe < ghetti.md
#   scripts/pi.sh prod uebersicht > gerichte.csv
set -euo pipefail

case "${1:-}" in
  dev)  DIR='~/dev/schompf-dev/api' ;;
  prod) DIR='~/dev/schompf-1/api' ;;
  *) echo "Aufruf: scripts/pi.sh dev|prod <Befehl> …" >&2; exit 1 ;;
esac
shift

ARGS=$(printf ' %q' "$@")
exec ssh pi5 "cd $DIR && node scripts/schompf.js$ARGS"
