-- Eingang von außen (Kairos, Claude): Referenz der Quelle, damit wiederholte Übergaben nichts doppelt anlegen.
ALTER TABLE free_items ADD COLUMN external_ref TEXT;
CREATE UNIQUE INDEX free_items_external_ref ON free_items(external_ref) WHERE external_ref IS NOT NULL;
