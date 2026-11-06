-- Zuschlag pro Gericht (z.B. 10 % Naschteig bei Kuchen): nur für die Einkaufsliste, Rezeptmengen bleiben
ALTER TABLE dishes ADD COLUMN extra_percent INTEGER;
UPDATE dishes SET extra_percent = 10 WHERE id IN (SELECT dish_id FROM dish_categories WHERE category = 'Kuch');

-- „Heute woanders kaufen“: Laden/Abschnitt nur für diese Einkaufsrunde (das Produkt bleibt, wie es ist)
ALTER TABLE trip_items ADD COLUMN store_id TEXT REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE trip_items ADD COLUMN section_id TEXT REFERENCES store_sections(id) ON DELETE SET NULL;

-- von Hand hinzugefügte Artikel einsortieren (store_id gab es schon für die Merklisten)
ALTER TABLE free_items ADD COLUMN section_id TEXT REFERENCES store_sections(id) ON DELETE SET NULL;
