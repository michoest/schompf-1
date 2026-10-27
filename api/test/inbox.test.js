import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, newId, now } from '../src/db/index.js';
import { createTrip, finishTrip } from '../src/repo/trips.js';
import { addInboxItems } from '../src/repo/inbox.js';

let db, ids;

function insert(table, row) {
  const cols = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(c => '@' + c).join(',')})`).run(row);
  return row.id;
}

beforeEach(() => {
  db = openDatabase(':memory:');
  const markt = insert('stores', { id: newId(), name: 'Markt', sort: 0 });
  const we = insert('stores', { id: newId(), name: 'We', sort: 1 });
  const dm = insert('stores', { id: newId(), name: 'dm', sort: 2 });
  const gemuese = insert('product_groups', { id: newId(), name: 'Gemüse', preferred_store_id: markt, fallback_store_id: we, sort: 0 });
  const drogerie = insert('product_groups', { id: newId(), name: 'Drogerie', preferred_store_id: dm, sort: 1 });
  const product = (name, unit, group_id) => insert('products', { id: newId(), name, unit, group_id, created_at: now(), updated_at: now() });
  ids = { markt, we, dm, trone: product('Trone', 'Stück', gemuese), mittel: product('Waschmittel', 'Stück', drogerie), person: newId() };
  insert('persons', { id: ids.person, name: 'Roßes' });
});

const item = (ref, text, extra = {}) => ({ ref, text, ...extra });

test('offener Einkauf → Artikel landet im aktuellen Einkauf', () => {
  const trip = createTrip(db, { date: '2026-10-14', coversFrom: '2026-10-14', coversTo: '2026-10-16' });
  const [r] = addInboxItems(db, [item('kairos:1', '3 Trone')], ids.person);
  assert.equal(r.status, 'created');
  assert.deepEqual(r.target, { kind: 'trip', id: trip.id, label: 'Einkaufsliste' });
  assert.equal(r.text, 'Trone');
  assert.equal(r.amount, 3);
  const row = db.prepare('SELECT * FROM free_items WHERE id = ?').get(r.freeItemId);
  assert.equal(row.product_id, ids.trone, 'zählt beim Produkt mit');
  assert.equal(row.created_by, ids.person);
});

test('nach „Einkauf fertig“ → neue Runde der Liste', () => {
  createTrip(db, { date: '2026-10-14', coversFrom: '2026-10-14', coversTo: '2026-10-16' });
  const next = finishTrip(db);
  const [r] = addInboxItems(db, [item('kairos:1', 'Trone')], ids.person);
  assert.equal(r.target.id, next.id);
});

test('ohne Einkauf → es wird eine Liste angelegt; unbekanntes Produkt mit Notiz in Klammern', () => {
  const [trone, milch] = addInboxItems(db, [item('kairos:1', 'Trone', { note: 'Bio' }), item('kairos:2', '2 l Hafermilch', { note: 'Barista' })], ids.person);
  assert.equal(trone.target.kind, 'trip');
  assert.equal(milch.target.id, trone.target.id);
  assert.equal(trone.text, 'Trone', 'erkanntes Produkt behält seinen Namen, Notiz entfällt');
  assert.equal(milch.text, 'Hafermilch (Barista)');
  assert.equal(milch.amount, 2);
  assert.equal(milch.unit, 'l');
});

test('Wortanfang reicht nicht für die Zuordnung (#3)', () => {
  const [r] = addInboxItems(db, [item('kairos:1', 'Tronensaft')], ids.person);
  assert.equal(db.prepare('SELECT product_id FROM free_items WHERE id = ?').get(r.freeItemId).product_id, null);
});

test('gleiche ref zweimal → exists, kein Duplikat', () => {
  const [first] = addInboxItems(db, [item('kairos:1', 'Trone')], ids.person);
  const [second] = addInboxItems(db, [item('kairos:1', 'Trone')], ids.person);
  assert.equal(second.status, 'exists');
  assert.equal(second.freeItemId, first.freeItemId);
  assert.deepEqual(second.target, first.target);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM free_items').get().n, 1);
});

test('ungültiger Artikel im Batch → nur dieser error', () => {
  const results = addInboxItems(db, [item('kairos:1', 'Trone'), item('kairos:2', '  '), item('kairos:3', 'Waschmittel')], ids.person);
  assert.deepEqual(results.map(r => r.status), ['created', 'error', 'created']);
  assert.ok(results[1].message);
});

test('ungültiger Request', () => {
  assert.throws(() => addInboxItems(db, [], ids.person));
  assert.throws(() => addInboxItems(db, undefined, ids.person));
  assert.throws(() => addInboxItems(db, Array.from({ length: 101 }, (_, i) => item(`r${i}`, 'Trone')), ids.person));
  assert.throws(() => addInboxItems(db, [item('', 'Trone')], ids.person));
});
