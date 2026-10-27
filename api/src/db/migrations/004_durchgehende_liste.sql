-- Durchgehende Einkaufsliste: ein Einkauf ist eine „Runde“; offene Sachen wandern bei „Einkauf fertig“ in die nächste.
-- plan_taken_at: letzte ausdrückliche Planübernahme – was danach dazukommt, ist in der Liste „neu“.
ALTER TABLE shopping_trips ADD COLUMN plan_taken_at TEXT;
UPDATE shopping_trips SET plan_taken_at = created_at;
