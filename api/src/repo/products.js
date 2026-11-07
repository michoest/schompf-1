import { newId, now } from '../db/index.js';
import { normalizeUnit } from '../domain/units.js';
import { ValidationError, renameInRecipes } from './dishes.js';

const SELECT = `SELECT p.id, p.name, p.unit, p.group_id AS groupId, g.name AS groupName,
                       p.store_id AS storeId, p.section_id AS sectionId, p.fallback_store_id AS fallbackStoreId,
                       p.storage_location_id AS storageLocationId,
                       p.is_staple AS isStaple, p.shelf_life_days AS shelfLifeDays,
                       (SELECT COUNT(*) FROM dish_ingredients i WHERE i.product_id = p.id) AS usedIn,
                       p.created_at AS createdAt, p.updated_at AS updatedAt
                FROM products p LEFT JOIN product_groups g ON g.id = p.group_id`;

const toProduct = row => row && { ...row, isStaple: !!row.isStaple };

export function listProducts(db) {
  return db.prepare(`${SELECT} ORDER BY p.name COLLATE NOCASE`).all().map(toProduct);
}

export function getProduct(db, id) {
  return toProduct(db.prepare(`${SELECT} WHERE p.id = ?`).get(id));
}

/** Vorschlag aus der Warengruppe (Laden, Abschnitt dort, Ausweichladen, Aufbewahrung) – nur beim Anlegen. */
export function groupDefaults(db, groupId) {
  const g = groupId && db.prepare('SELECT * FROM product_groups WHERE id = ?').get(groupId);
  if (!g) return { storeId: null, sectionId: null, fallbackStoreId: null, storageLocationId: null };
  const sectionId = g.preferred_store_id
    ? db.prepare('SELECT section_id FROM section_groups WHERE store_id = ? AND group_id = ?').pluck().get(g.preferred_store_id, g.id) ?? null
    : null;
  return { storeId: g.preferred_store_id, sectionId, fallbackStoreId: g.fallback_store_id, storageLocationId: g.storage_location_id };
}

export function saveProduct(db, input, id = null) {
  const before = id ? getProduct(db, id) : null;
  if (id && !before) return null;
  const errors = [];
  const name = String(input.name ?? before?.name ?? '').trim();
  if (!name) errors.push('Name fehlt');
  const clash = name && db.prepare('SELECT id FROM products WHERE name = ?').get(name);
  if (clash && clash.id !== id) errors.push(`Es gibt schon ein Produkt „${name}“`);
  const unit = normalizeUnit(input.unit ?? before?.unit ?? 'Stück');
  if (!unit) errors.push(`Einheit „${input.unit}“ unbekannt`);
  const groupId = 'groupId' in input ? input.groupId : before?.groupId ?? null;
  if (groupId && !db.prepare('SELECT 1 FROM product_groups WHERE id = ?').get(groupId)) errors.push('Warengruppe unbekannt');
  // Orte: ausdrücklich pro Produkt; beim Anlegen ohne Angabe aus der Warengruppe vorbelegt
  const defaults = before ? before : groupDefaults(db, groupId);
  const pick = key => (key in input ? input[key] || null : defaults[key] ?? null);
  const sectionId = pick('sectionId');
  const section = sectionId && db.prepare('SELECT store_id FROM store_sections WHERE id = ?').get(sectionId);
  if (sectionId && !section) errors.push('Abschnitt unbekannt');
  const storeId = pick('storeId') ?? section?.store_id ?? null;
  if (section && storeId && section.store_id !== storeId) errors.push('Abschnitt gehört nicht zu diesem Laden');
  const fallbackStoreId = pick('fallbackStoreId');
  for (const store of [storeId, fallbackStoreId]) {
    if (store && !db.prepare('SELECT 1 FROM stores WHERE id = ?').get(store)) errors.push('Laden unbekannt');
  }
  const storageLocationId = pick('storageLocationId');
  if (storageLocationId && !db.prepare('SELECT 1 FROM storage_locations WHERE id = ?').get(storageLocationId)) errors.push('Aufbewahrungsort unbekannt');
  const shelfLifeDays = 'shelfLifeDays' in input ? input.shelfLifeDays : before?.shelfLifeDays ?? null;
  // 0 = frisch: erst am Tag selbst kaufen
  if (shelfLifeDays != null && !(Number.isInteger(Number(shelfLifeDays)) && Number(shelfLifeDays) >= 0)) errors.push('Haltbarkeit muss eine ganze Zahl ab 0 sein');
  if (errors.length) throw new ValidationError(errors);

  const row = {
    id: id ?? newId(), name, unit, groupId, storeId, sectionId, fallbackStoreId: fallbackStoreId === storeId ? null : fallbackStoreId, storageLocationId,
    isStaple: (input.isStaple ?? before?.isStaple) ? 1 : 0,
    shelfLifeDays: shelfLifeDays == null ? null : Number(shelfLifeDays),
    at: now(),
  };
  if (before) {
    db.transaction(() => {
      db.prepare(`UPDATE products SET name=@name, unit=@unit, group_id=@groupId, store_id=@storeId, section_id=@sectionId,
                  fallback_store_id=@fallbackStoreId, storage_location_id=@storageLocationId, is_staple=@isStaple,
                  shelf_life_days=@shelfLifeDays, updated_at=@at WHERE id=@id`).run(row);
      if (before.name !== name) renameInRecipes(db, before.name, name);
    })();
  } else {
    db.prepare(`INSERT INTO products (id, name, unit, group_id, store_id, section_id, fallback_store_id, storage_location_id,
                                      is_staple, shelf_life_days, created_at, updated_at)
                VALUES (@id, @name, @unit, @groupId, @storeId, @sectionId, @fallbackStoreId, @storageLocationId,
                        @isStaple, @shelfLifeDays, @at, @at)`).run(row);
  }
  return getProduct(db, row.id);
}

export function deleteProduct(db, id) {
  const used = db.prepare('SELECT COUNT(*) n FROM dish_ingredients WHERE product_id = ?').get(id).n;
  if (used) throw new ValidationError([`Produkt steckt noch in ${used} Gericht(en)`]);
  return db.prepare('DELETE FROM products WHERE id = ?').run(id).changes > 0;
}
