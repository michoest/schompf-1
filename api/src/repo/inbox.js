import { addFreeItem, ensureCurrentTrip } from './trips.js';
import { ValidationError } from './dishes.js';

/**
 * Eingang von außen (Kairos, Claude): Artikel wie in der Schnellzeile im Einkaufs-Tab.
 * Ziel: die (durchgehende) Einkaufsliste – es gibt immer eine.
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
        const created = addFreeItem(db, { tripId: ensureCurrentTrip(db, personId).id, text: item.text }, personId);
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

function result(db, ref, status, f) {
  // ältere Einträge können noch auf einer Merkliste stehen
  const label = f.trip_id ? 'Einkaufsliste' : `Merkliste ${db.prepare('SELECT name FROM stores WHERE id = ?').get(f.store_id).name}`;
  return {
    ref, status, freeItemId: f.id, text: f.text, amount: f.amount, unit: f.unit,
    target: f.trip_id ? { kind: 'trip', id: f.trip_id, label } : { kind: 'store', id: f.store_id, label },
  };
}
