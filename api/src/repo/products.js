import { newId, now } from '../db/index.js';
import { normalizeUnit } from '../domain/units.js';
import { ValidationError } from './dishes.js';

const SELECT = `SELECT p.id, p.name, p.unit, p.group_id AS groupId, g.name AS groupName, p.section_id AS sectionId,
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
  const sectionId = 'sectionId' in input ? input.sectionId : before?.sectionId ?? null;
  if (sectionId && !db.prepare('SELECT 1 FROM store_sections WHERE id = ?').get(sectionId)) errors.push('Abschnitt unbekannt');
  const shelfLifeDays = 'shelfLifeDays' in input ? input.shelfLifeDays : before?.shelfLifeDays ?? null;
  if (shelfLifeDays != null && !(Number.isInteger(Number(shelfLifeDays)) && Number(shelfLifeDays) > 0)) errors.push('Haltbarkeit muss eine ganze Zahl > 0 sein');
  if (errors.length) throw new ValidationError(errors);

  const row = {
    id: id ?? newId(), name, unit, groupId, sectionId,
    isStaple: (input.isStaple ?? before?.isStaple) ? 1 : 0,
    shelfLifeDays: shelfLifeDays == null ? null : Number(shelfLifeDays),
    at: now(),
  };
  if (before) {
    db.prepare(`UPDATE products SET name=@name, unit=@unit, group_id=@groupId, section_id=@sectionId, is_staple=@isStaple,
                shelf_life_days=@shelfLifeDays, updated_at=@at WHERE id=@id`).run(row);
  } else {
    db.prepare(`INSERT INTO products (id, name, unit, group_id, section_id, is_staple, shelf_life_days, created_at, updated_at)
                VALUES (@id, @name, @unit, @groupId, @sectionId, @isStaple, @shelfLifeDays, @at, @at)`).run(row);
  }
  return getProduct(db, row.id);
}

export function deleteProduct(db, id) {
  const used = db.prepare('SELECT COUNT(*) n FROM dish_ingredients WHERE product_id = ?').get(id).n;
  if (used) throw new ValidationError([`Produkt steckt noch in ${used} Gericht(en)`]);
  return db.prepare('DELETE FROM products WHERE id = ?').run(id).changes > 0;
}
