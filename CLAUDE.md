# Schompf

Private Mahlzeitenplanungs- und Einkaufs-App (zwei Personen: Roßes und Leines). Monorepo: `app/` (Vue 3 + Vuetify + Pinia, Vite-PWA mit eigenem Service Worker `app/src/sw.js`) und `api/` (Express + SQLite via better-sqlite3).

## Infrastruktur

- **Produktion** (seit 2026-10-11, Branch `main`):
  - Frontend: GitHub Pages, Branch `gh-pages`, `schompf.michoest.com` (`app/public/CNAME`, `404.html` = `index.html` für App-Routen).
  - API: Pi 5 (`ssh pi5`, `pi5.local`), Checkout `~/dev/schompf-1`, PM2 `schompf-1-api`, Port 3000, über Cloudflare-Tunnel → Caddy als `schompf-api.michoest.com`.
  - Daten: `~/dev/schompf-1/api/data/schompf.db` (SQLite). Alte `db.json` bleibt als Archiv; Sicherung vor dem Umstieg: `~/backups/schompf/db-vor-umstieg.json`, Git-Tag `vor-umstieg`.
  - Backups: `~/backups/schompf/` täglich 3:15 per Cron + vor jedem API-Deploy (SQLite-Backup-API), 30 Tage.
  - Benachrichtigungen: Web-Push (VAPID-Schlüssel in `api/.env`, nicht im Git), Erinnerungen per Scheduler im API-Prozess (TZ Europe/Berlin).
- **Dev-Instanz** (Branch `dev`): Checkout `~/dev/schompf-dev`, PM2 `schompf-dev-api` Port 3010, Frontend in `/srv/schompf-dev`, Caddy liefert beides unter `schompf-dev.michoest.com` (no-cache für App-Hülle, `sw.js` no-store wegen Cloudflare). `SCHEDULER=off` (keine Erinnerungen).
- Alle API-Endpunkte brauchen ein Geräte-Token (Anmeldung per Einmal-Code, `scripts/pi.sh prod code <Person>`).
- iPhone-Benachrichtigungen nur, wenn die App in **Safari** zum Home-Bildschirm hinzugefügt wurde (nicht Arc/Chrome).

Fachliches Zielbild: `docs/konzept.md`. Produkt- und Gerichtnamen sind auf „Schatzisch“ (Wortanfang weg, Mehrzahl -s, Adjektive -es).
Anmerkungen der Nutzer: `scripts/pi.sh prod feedback` lesen, umsetzen, `scripts/pi.sh prod erledigt <ID> <Notiz>`.

## Entwicklung

- `npm run install:all` einmalig, `npm run db:pull` holt die Live-DB nach `api/data/db.json`.
- `npm run dev` startet API (:3000) und App (:5173). Im Dev-Modus ist `VITE_API_URL` leer, die App ruft relativ `/api` auf und der Vite-Proxy leitet an `VITE_API_PROXY` weiter.
- Produktions-Build nutzt `app/.env.production` (`VITE_API_URL=https://schompf-api.michoest.com`).

## Datenbank-Schema

Schema in `api/src/db/migrations/NNN_*.sql`, Stand in `PRAGMA user_version`. **Änderungen nur als neue Migration** (002, 003, …) – bestehende Dateien nicht mehr ändern, weil die Dev-DB (und später die Live-DB) echte Daten trägt (Anmerkungen, Push-Abos, Geräte).
Übernahme aus der alten App: `npm run migrate` (bzw. `deploy:dev -- --refresh-db`), Inhalte aus `api/data/migration/` (nicht im Git): `produkte.json`, `rezepte/`, `gerichte/`, `zeiten.json`.

## Deploy

Gearbeitet wird auf `dev`; `main` = Produktion. `npm run deploy:dev` deployt `dev` auf die Dev-Instanz (`-- --refresh-db` nur bewusst: verwirft Dev-Einkäufe/-Planung, behält Logins/Abos/Anmerkungen).
Release: `dev` per fast-forward nach `main`, dann Backend und Frontend direkt nacheinander (Frontend und API müssen zusammenpassen).

1. Backend (bei API-Änderungen zuerst): pushen, dann `npm run deploy:api`.
   API-Änderungen abwärtskompatibel halten – die PWA kann noch eine Weile die alte Frontend-Version aus dem Cache ausliefern.
2. Frontend: `npm run deploy` (nur von `main`; baut und pusht `app/dist` nach `gh-pages`).

## Bugs & Features

GitHub Issues in `michoest/schompf-1`, Labels `bug`, `feature`, `idee`. Commits schließen Issues per `fixes #<nr>`.
