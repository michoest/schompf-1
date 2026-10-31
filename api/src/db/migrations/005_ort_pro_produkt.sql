-- Einkaufs- und Aufbewahrungsort direkt pro Produkt statt aus der Warengruppe abgeleitet
-- (Frischkäse woanders als Käse, manche Wurst beim Metzger, andere bei We …).
-- Die Warengruppe bleibt Einordnung und Vorschlag beim Anlegen.
ALTER TABLE products ADD COLUMN store_id TEXT REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN fallback_store_id TEXT REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN storage_location_id TEXT REFERENCES storage_locations(id) ON DELETE SET NULL;

-- bisheriges Ergebnis der Regel einmalig festschreiben
UPDATE products SET store_id = (SELECT s.store_id FROM store_sections s WHERE s.id = products.section_id)
  WHERE section_id IS NOT NULL;
UPDATE products SET
    store_id = (SELECT g.preferred_store_id FROM product_groups g WHERE g.id = products.group_id),
    fallback_store_id = (SELECT g.fallback_store_id FROM product_groups g WHERE g.id = products.group_id)
  WHERE section_id IS NULL;
UPDATE products SET section_id = (SELECT sg.section_id FROM section_groups sg WHERE sg.store_id = products.store_id AND sg.group_id = products.group_id)
  WHERE section_id IS NULL AND store_id IS NOT NULL;
UPDATE products SET storage_location_id = (SELECT g.storage_location_id FROM product_groups g WHERE g.id = products.group_id);
