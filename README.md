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
schompf-0/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── dishes.js
│   │   │   ├── products.js
│   │   │   ├── vendors.js
│   │   │   ├── categories.js
│   │   │   ├── meals.js
│   │   │   └── shoppingList.js
│   │   ├── services/
│   │   │   └── database.js
│   │   └── server.js
│   ├── data/           # Datenbank (wird automatisch erstellt)
│   ├── package.json
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── MealSlot.vue
    │   │   └── DishSelector.vue
    │   ├── views/
    │   │   ├── PlanerView.vue
    │   │   ├── ShoppingListView.vue
    │   │   ├── DishesView.vue
    │   │   ├── DishEditView.vue
    │   │   ├── ProductsView.vue
    │   │   └── SettingsView.vue
    │   ├── stores/
    │   │   └── index.js
    │   ├── services/
    │   │   └── api.js
    │   ├── router/
    │   │   └── index.js
    │   ├── plugins/
    │   │   └── vuetify.js
    │   ├── App.vue
    │   ├── main.js
    │   └── style.css
    ├── public/
    │   ├── CNAME
    │   └── favicon.svg
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── .env.example
```

## Installation

### Backend (Raspberry Pi)

```bash
cd backend

# .env erstellen
cp .env.example .env
# Anpassen: PORT, CORS_ORIGINS

# Dependencies installieren
npm install

# Starten
npm start
# oder für Entwicklung:
npm run dev
```

### Frontend (Lokal entwickeln)

```bash
cd frontend

# .env erstellen
cp .env.example .env
# Anpassen: VITE_API_URL (z.B. http://raspberry-pi:3000)

# Dependencies installieren
npm install

# Dev Server starten
npm run dev
```

### Frontend deployen (GitHub Pages)

```bash
cd frontend

# .env.production erstellen
echo "VITE_API_URL=https://schompf.server.michoest.com" > .env.production
echo "VITE_BASE_URL=/" >> .env.production

# Build und Deploy
npm run deploy
```

## Konfiguration

### Backend (.env)

```env
PORT=3000
HOST=0.0.0.0
CORS_ORIGINS=http://localhost:5173,https://schompf.michoest.com
DB_PATH=./data/db.json
```

### Frontend (.env)

```env
VITE_API_URL=http://localhost:3000
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
