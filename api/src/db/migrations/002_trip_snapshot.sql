-- Einkaufsliste als Momentaufnahme: „Liste erstellen“ friert den Bedarf der Mahlzeiten ein.
-- Danach ändert sich die Liste nur noch, wenn beim Ändern einer Mahlzeit ausdrücklich „Liste anpassen“ gewählt wird.

-- Hat der Einkauf schon eine Momentaufnahme? (ältere Einkäufe werden beim ersten Öffnen einmalig eingefroren)
ALTER TABLE shopping_trips ADD COLUMN snapshot INTEGER NOT NULL DEFAULT 0;

-- Auf welchem Einkauf steht eine Mahlzeit (früher „committed“)
ALTER TABLE meals ADD COLUMN trip_id TEXT REFERENCES shopping_trips(id) ON DELETE SET NULL;
CREATE INDEX meals_trip ON meals(trip_id);

-- Eingefrorener Bedarf pro Mahlzeit und Produkt (Herkunft bleibt sichtbar, auch wenn die Mahlzeit später gelöscht wird)
CREATE TABLE trip_sources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id    TEXT NOT NULL REFERENCES shopping_trips(id) ON DELETE CASCADE,
  meal_id    TEXT REFERENCES meals(id) ON DELETE SET NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  part       TEXT NOT NULL DEFAULT 'now' CHECK (part IN ('now', 'later')),
  amount     REAL,
  unit       TEXT NOT NULL,
  buy_from   TEXT,             -- bei part = later: ab wann kaufen
  date       TEXT NOT NULL,    -- Tag der Mahlzeit beim Einfrieren
  slot_name  TEXT,
  dish_name  TEXT,
  via_dish   TEXT,
  added_at   TEXT NOT NULL     -- später als der Einkauf → in der Liste als „neu“ markiert
);
CREATE INDEX trip_sources_trip ON trip_sources(trip_id);
CREATE INDEX trip_sources_meal ON trip_sources(meal_id);
