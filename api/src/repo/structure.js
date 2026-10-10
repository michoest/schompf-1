import { UNITS } from '../domain/units.js';

/** Alles, was sich selten ändert, in einem Aufruf: Läden, Abschnitte, Warengruppen, Lagerorte, Slots, Einheiten. */
export function getStructure(db) {
  const sectionGroups = db.prepare('SELECT section_id, group_id FROM section_groups').all();
  const groupsBySection = new Map();
  for (const sg of sectionGroups) {
    if (!groupsBySection.has(sg.section_id)) groupsBySection.set(sg.section_id, []);
    groupsBySection.get(sg.section_id).push(sg.group_id);
  }
  return {
    storageLocations: db.prepare('SELECT id, name FROM storage_locations ORDER BY sort').all(),
    stores: db.prepare('SELECT id, name, color FROM stores ORDER BY sort').all().map(store => ({
      ...store,
      sections: db.prepare('SELECT id, name FROM store_sections WHERE store_id = ? ORDER BY sort').all(store.id)
        .map(section => ({ ...section, groupIds: groupsBySection.get(section.id) ?? [] })),
    })),
    groups: db.prepare(`SELECT id, name, storage_location_id AS storageLocationId, preferred_store_id AS preferredStoreId,
                        fallback_store_id AS fallbackStoreId FROM product_groups ORDER BY sort`).all(),
    mealSlots: db.prepare('SELECT id, name, time FROM meal_slots ORDER BY sort').all(),
    units: UNITS.map(u => ({ code: u.code, singular: u.singular, plural: u.plural })),
  };
}
