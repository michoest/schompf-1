-- Schompf: Grundschema (fachliches Modell siehe docs/konzept.md)
-- IDs sind Text-UUIDs (bestehende IDs aus db.json bleiben erhalten), Zeitstempel ISO-8601.

-- Personen & Geräte ---------------------------------------------------------

CREATE TABLE persons (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE devices (
  id           TEXT PRIMARY KEY,
  person_id    TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT
);

-- Kurzlebige Codes, mit denen sich ein neues Gerät einer Person zuordnet
CREATE TABLE pairing_codes (
  code       TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- Läden, Warengruppen, Lagerorte --------------------------------------------

CREATE TABLE storage_locations (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE stores (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT,
  sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE store_sections (
  id       TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  sort     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (store_id, name)
);

CREATE TABLE product_groups (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL UNIQUE COLLATE NOCASE,
  storage_location_id TEXT REFERENCES storage_locations(id) ON DELETE SET NULL,
  preferred_store_id  TEXT REFERENCES stores(id) ON DELETE SET NULL,
  fallback_store_id   TEXT REFERENCES stores(id) ON DELETE SET NULL,
  sort                INTEGER NOT NULL DEFAULT 0
);

-- In welchem Abschnitt eines Ladens liegt eine Warengruppe (höchstens einer pro Laden)
CREATE TABLE section_groups (
  store_id   TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  group_id   TEXT NOT NULL REFERENCES product_groups(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL REFERENCES store_sections(id) ON DELETE CASCADE,
  PRIMARY KEY (store_id, group_id)
);

CREATE TABLE products (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  unit            TEXT NOT NULL DEFAULT 'Stück',
  group_id        TEXT REFERENCES product_groups(id) ON DELETE SET NULL,
  -- Ausnahme: fester Abschnitt (und damit Laden) statt der Warengruppen-Regel
  section_id      TEXT REFERENCES store_sections(id) ON DELETE SET NULL,
  is_staple       INTEGER NOT NULL DEFAULT 0,
  shelf_life_days INTEGER,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- Gerichte ------------------------------------------------------------------

CREATE TABLE dishes (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind           TEXT NOT NULL DEFAULT 'cook' CHECK (kind IN ('cook', 'buy', 'takeaway')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft')),
  servings       REAL NOT NULL DEFAULT 2,
  source_url     TEXT,
  takeaway_where TEXT,
  recipe         TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE dish_categories (
  dish_id  TEXT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  PRIMARY KEY (dish_id, category)
);

CREATE TABLE dish_ingredients (
  id         TEXT PRIMARY KEY,
  dish_id    TEXT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  amount     REAL,            -- NULL = nach Bedarf (z.B. Salz)
  unit       TEXT NOT NULL,
  optional   INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX dish_ingredients_dish ON dish_ingredients(dish_id);
CREATE INDEX dish_ingredients_product ON dish_ingredients(product_id);

-- Feste Bestandteile (optional = 0) und wählbare Beilagen (optional = 1)
CREATE TABLE dish_components (
  id                TEXT PRIMARY KEY,
  dish_id           TEXT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  component_dish_id TEXT NOT NULL REFERENCES dishes(id),
  factor            REAL NOT NULL DEFAULT 1,
  optional          INTEGER NOT NULL DEFAULT 0,
  sort              INTEGER NOT NULL DEFAULT 0,
  UNIQUE (dish_id, component_dish_id)
);

CREATE TABLE dish_preparations (
  id         TEXT PRIMARY KEY,
  dish_id    TEXT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  lead_hours REAL NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE dish_changes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  dish_id   TEXT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  at        TEXT NOT NULL,
  person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
  source    TEXT NOT NULL,     -- app | import | claude | migration
  summary   TEXT NOT NULL
);
CREATE INDEX dish_changes_dish ON dish_changes(dish_id);

-- Planung -------------------------------------------------------------------

CREATE TABLE meal_slots (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL,
  time TEXT NOT NULL           -- HH:MM, Kochzeit für Erinnerungen
);

CREATE TABLE meals (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,    -- YYYY-MM-DD
  slot_id    TEXT NOT NULL REFERENCES meal_slots(id),
  sort       INTEGER NOT NULL DEFAULT 0,
  kind       TEXT NOT NULL CHECK (kind IN ('dish', 'leftovers', 'text')),
  dish_id    TEXT REFERENCES dishes(id),
  servings   REAL,
  text       TEXT,
  status     TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'prepared')),
  created_by TEXT REFERENCES persons(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((kind = 'dish') = (dish_id IS NOT NULL))
);
CREATE INDEX meals_date ON meals(date);

-- Gewählte Beilagen einer Mahlzeit
CREATE TABLE meal_components (
  meal_id           TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  component_dish_id TEXT NOT NULL REFERENCES dishes(id),
  factor            REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (meal_id, component_dish_id)
);

CREATE TABLE meal_excluded_ingredients (
  meal_id       TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL REFERENCES dish_ingredients(id) ON DELETE CASCADE,
  PRIMARY KEY (meal_id, ingredient_id)
);

-- Einkauf -------------------------------------------------------------------

CREATE TABLE shopping_trips (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  covers_from TEXT NOT NULL,
  covers_to   TEXT NOT NULL,
  phase       TEXT NOT NULL DEFAULT 'planning' CHECK (phase IN ('planning', 'pantry', 'shopping', 'done')),
  created_by  TEXT REFERENCES persons(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);

-- Eingriffe pro Einkauf und Produkt; der Bedarf selbst wird berechnet
CREATE TABLE trip_items (
  trip_id      TEXT NOT NULL REFERENCES shopping_trips(id) ON DELETE CASCADE,
  product_id   TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  state        TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'have', 'in_cart', 'skip')),
  amount       REAL,           -- Mengen-Override
  unit         TEXT,
  use_fallback INTEGER NOT NULL DEFAULT 0,  -- „gibt's hier nicht“
  updated_by   TEXT REFERENCES persons(id) ON DELETE SET NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (trip_id, product_id)
);

-- Freie Artikel: zu einem Einkauf oder auf der Merkliste eines Ladens
CREATE TABLE free_items (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT REFERENCES shopping_trips(id) ON DELETE CASCADE,
  store_id   TEXT REFERENCES stores(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  text       TEXT NOT NULL,
  amount     REAL,
  unit       TEXT,
  state      TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'have', 'in_cart', 'skip')),
  created_by TEXT REFERENCES persons(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  done_at    TEXT,
  CHECK (trip_id IS NOT NULL OR store_id IS NOT NULL)
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
