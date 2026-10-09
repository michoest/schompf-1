# 🍽️ Schompf - Mahlzeitenplanung & Einkaufslisten

Schompf ist eine Web-App zur Mahlzeitenplanung mit automatischer Einkaufslisten-Generierung.

## Features (MVP)

- **📅 Wochenplaner**: Plane Frühstück, Mittagessen und Abendessen für die ganze Woche
- **🍲 Gericht-Verwaltung**: Erstelle Gerichte mit Zutaten, Mengen und Rezept-Links
- **🛒 Einkaufsliste**: Automatisch generiert aus geplanten Mahlzeiten
  - Gruppiert nach Händler/Geschäft
  - Sortiert nach Kategorien innerhalb eines Geschäfts
  - Aggregiert Mengen intelligent (z.B. 500g + 500g = 1kg)
  - Rückverfolgbarkeit: Sieh, welche Mahlzeit welche Zutat benötigt
- **📦 Produkt-Datenbank**: Verwalte Produkte mit Kategorien und Haltbarkeit
- **🏪 Händler & Kategorien**: Organisiere deine Einkäufe nach Geschäften und Abteilungen

## Tech Stack

### Frontend
- Vue 3 + Composition API
- Vuetify 3 (Material Design)
- Pinia (State Management)
- Vue Router
- Vite + PWA Plugin

### Backend
- Node.js + Express
- lowdb (JSON-Datei als Datenbank)

## Projekt-Struktur

```
schompf-1/
├── api/        # Express + lowdb Backend (läuft per PM2 auf dem Raspberry Pi)
├── app/        # Vue 3 + Vuetify PWA (GitHub Pages)
└── scripts/    # Deploy-, Backup- und DB-Skripte
```

## Entwicklung

```bash
npm run install:all   # einmalig
npm run db:pull       # Live-Datenbank vom Pi holen (api/data/db.json)
npm run dev           # API auf :3000, App auf :5173 (auch im WLAN erreichbar)
```

## Deploy

```bash
npm run deploy:api    # Backend: DB-Backup, git pull, npm ci, PM2-Neustart auf dem Pi
npm run deploy        # Frontend: Build + Push nach gh-pages (schompf.michoest.com)
```

Details zur Infrastruktur stehen in `CLAUDE.md`.

## Konfiguration

### Backend (`api/.env`)

```env
PORT=3000
HOST=0.0.0.0
CORS_ORIGINS=http://localhost:5173,https://schompf.michoest.com
DB_PATH=./data/db.json
```

### Frontend (`app/.env`, `app/.env.production`)

```env
VITE_API_URL=                          # leer im Dev-Modus (Vite-Proxy), Produktion: https://schompf-api.michoest.com
VITE_API_PROXY=http://localhost:3000   # Proxy-Ziel im Dev-Modus
VITE_BASE_URL=/
```

## API Endpoints

### Gerichte
- `GET /api/dishes` - Alle Gerichte
- `GET /api/dishes/:id` - Ein Gericht
- `POST /api/dishes` - Neues Gericht
- `PUT /api/dishes/:id` - Gericht aktualisieren
- `DELETE /api/dishes/:id` - Gericht löschen

### Produkte
- `GET /api/products` - Alle Produkte
- `POST /api/products` - Neues Produkt
- `PUT /api/products/:id` - Produkt aktualisieren
- `DELETE /api/products/:id` - Produkt löschen

### Händler
- `GET /api/vendors` - Alle Händler
- `POST /api/vendors` - Neuer Händler
- `PUT /api/vendors/:id` - Händler aktualisieren
- `DELETE /api/vendors/:id` - Händler löschen

### Kategorien
- `GET /api/categories` - Alle Kategorien
- `POST /api/categories` - Neue Kategorie
- `PUT /api/categories/:id` - Kategorie aktualisieren
- `DELETE /api/categories/:id` - Kategorie löschen
- `POST /api/categories/reorder` - Kategorien sortieren

### Mahlzeiten
- `GET /api/meals` - Mahlzeiten (mit from/to Filter)
- `GET /api/meals/date/:date` - Mahlzeiten für ein Datum
- `POST /api/meals` - Neue Mahlzeit
- `PUT /api/meals/:id` - Mahlzeit aktualisieren
- `DELETE /api/meals/:id` - Mahlzeit löschen
- `POST /api/meals/bulk` - Mehrere Mahlzeiten erstellen

### Einkaufsliste
- `POST /api/shopping-list/generate` - Liste generieren
- `POST /api/shopping-list/add-item` - Artikel hinzufügen

## Geplante Features (Iterationen)

### Iteration 1: Enhanced Planning
- Sub-Gerichte (z.B. Frikadellen enthält automatisch Kartoffelsalat)
- Rückverfolgbarkeit (welche Zutat für welches Gericht)
- Frische-Handling mit visuellen Indikatoren
- "Auswärts essen" Platzhalter
- Monatsansicht

### Iteration 2: Multi-Device & Voice
- Echtzeit-Synchronisation
- PWA Offline-Fähigkeit
- Push-Benachrichtigungen
- Siri Shortcuts Integration

### Iteration 3: Multi-User & AI
- Authentifizierung
- Mehrere Workspaces
- QR-Code Sharing
- AI-basierte Vorschläge
- AI-Gericht-Erstellung aus Screenshots

## Lizenz

Privates Projekt

---

Made with 🍳 for better meal planning
