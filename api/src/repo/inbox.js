import { addFreeItem, getCurrentTrip } from './trips.js';
import { ValidationError } from './dishes.js';
import { parseIngredientLine } from '../domain/dishFile.js';

const DEFAULT_STORE = 'We';
const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/**
 * Eingang von außen (Kairos, Claude): Artikel wie in der Schnellzeile im Einkaufs-Tab.
 * Ziel: aktueller Einkauf (wie in der App), sonst Merkliste des Ladens der Warengruppe,
 * sonst Merkliste des Standard-Ladens (Einstellung `inboxStore`, sonst „We“).
 * Pro Artikel unabhängig; gleiche `ref` legt nichts doppelt an.
 * Spec: kairos-1/docs/schompf-schnittstelle.md
 */
export function addInboxItems(db, items, personId) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) throw new ValidationError(['items: 1–100 Artikel']);
  for (const item of items) {
    if (!String(item?.ref ?? '').trim() || String(item.ref).length > 100) throw new ValidationError(['ref fehlt oder ist zu lang']);
  }
  return items.map(item => {
    const ref = String(item.ref).trim();
    try {
      return db.transaction(() => {
        const existing = db.prepare('SELECT * FROM free_items WHERE external_ref = ?').get(ref);
        if (existing) return result(db, ref, 'exists', existing);
        const created = addFreeItem(db, { ...target(db, String(item.text ?? '')), text: item.text }, personId);
        const note = String(item.note ?? '').trim();
        // Notiz nur bei freien Artikeln anhängen – ein erkanntes Produkt behält seinen Namen
        const text = note && !created.product_id ? `${created.text} (${note})` : created.text;
        db.prepare('UPDATE free_items SET external_ref = ?, text = ? WHERE id = ?').run(ref, text, created.id);
        return result(db, ref, 'created', { ...created, text });
      })();
    } catch (e) {
      if (e instanceof ValidationError) return { ref, status: 'error', message: e.messages.join('; ') };
      console.error(e);
      return { ref, status: 'error', message: 'Interner Fehler' };
    }
  });
}

function target(db, text) {
  const trip = getCurrentTrip(db);
  if (trip) return { tripId: trip.id };
  // Produkt wie in addFreeItem nur per exaktem Namen, nie per Wortanfang (#3)
  const product = text.trim() ? findProduct(db, parseIngredientLine(text).productName) : null;
  if (product?.store_id) return { storeId: product.store_id };
  return { storeId: defaultStoreId(db) };
}

function findProduct(db, name) {
  return db.prepare(`SELECT p.id, COALESCE(s.store_id, g.preferred_store_id, g.fallback_store_id) AS store_id
                     FROM products p LEFT JOIN store_sections s ON s.id = p.section_id
                     LEFT JOIN product_groups g ON g.id = p.group_id WHERE p.name = ?`).get(name);
}

function defaultStoreId(db) {
  const name = db.prepare("SELECT value FROM settings WHERE key = 'inboxStore'").get()?.value ?? DEFAULT_STORE;
  const store = db.prepare('SELECT id FROM stores WHERE name = ?').get(name) ?? db.prepare('SELECT id FROM stores ORDER BY sort LIMIT 1').get();
  if (!store) throw new ValidationError(['Kein Laden angelegt']);
  return store.id;
}

function result(db, ref, status, f) {
  let label;
  if (f.trip_id) {
    const trip = db.prepare('SELECT date FROM shopping_trips WHERE id = ?').get(f.trip_id);
    const day = DAYS[new Date(`${trip.date}T12:00:00Z`).getUTCDay()];
    label = `Einkauf ${day} ${trip.date.slice(8)}.${trip.date.slice(5, 7)}.`;
  } else {
    label = `Merkliste ${db.prepare('SELECT name FROM stores WHERE id = ?').get(f.store_id).name}`;
  }
  return {
    ref, status, freeItemId: f.id, text: f.text, amount: f.amount, unit: f.unit,
    target: f.trip_id ? { kind: 'trip', id: f.trip_id, label } : { kind: 'store', id: f.store_id, label },
  };
}
