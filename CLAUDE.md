# Schompf

Private Mahlzeitenplanungs- und Einkaufslisten-App. Monorepo: `app/` (Vue 3 + Vuetify + Pinia, Vite-PWA) und `api/` (Express + lowdb, Daten in einer JSON-Datei).

## Infrastruktur

- Frontend: GitHub Pages, Branch `gh-pages`, Domain `schompf.michoest.com` (`app/public/CNAME`).
- Backend: Raspberry Pi 5 (`ssh pi5`, Hostname `pi5.local`), Checkout in `~/dev/schompf-1`, PM2-Prozess `schompf-1-api` auf Port 3000.
  Öffentlich über Cloudflare-Tunnel → Caddy → `127.0.0.1:3000` als `schompf-api.michoest.com`.
- Live-Daten: nur `~/dev/schompf-1/api/data/db.json` auf dem Pi (nicht im Git, Repo ist öffentlich).
  Backups: `~/backups/schompf/` auf dem Pi, täglich per Cron + vor jedem API-Deploy, 30 Tage Aufbewahrung.
- Die API hat keine Authentifizierung.

## Entwicklung

- `npm run install:all` einmalig, `npm run db:pull` holt die Live-DB nach `api/data/db.json`.
- `npm run dev` startet API (:3000) und App (:5173). Im Dev-Modus ist `VITE_API_URL` leer, die App ruft relativ `/api` auf und der Vite-Proxy leitet an `VITE_API_PROXY` weiter.
- Produktions-Build nutzt `app/.env.production` (`VITE_API_URL=https://schompf-api.michoest.com`).

## Deploy

1. Backend (bei API-Änderungen zuerst): pushen, dann `npm run deploy:api`.
   API-Änderungen abwärtskompatibel halten – die PWA kann noch eine Weile die alte Frontend-Version aus dem Cache ausliefern.
2. Frontend: `npm run deploy` (baut und pusht `app/dist` nach `gh-pages`).

## Bugs & Features

GitHub Issues in `michoest/schompf-1`, Labels `bug`, `feature`, `idee`. Commits schließen Issues per `fixes #<nr>`.
