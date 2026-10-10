import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, newId, now } from '../src/db/index.js';
import { suggestTripRange } from '../src/domain/dates.js';
import { saveDish } from '../src/repo/dishes.js';
import { saveMeal, deleteMeal } from '../src/repo/meals.js';
import { createTrip, buildTripList, setTripItem, addFreeItem, collectNeeds, suggestTrip } from '../src/repo/trips.js';

let db, ids;

function insert(table, row) {
  const cols = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(c => '@' + c).join(',')})`).run(row);
  return row.id;
}

function product(name, unit, groupId, extra = {}) {
  return insert('products', { id: newId(), name, unit, group_id: groupId, created_at: now(), updated_at: now(), ...extra });
}

beforeEach(() => {
  db = openDatabase(':memory:');
  db.prepare("INSERT INTO settings (key, value) VALUES ('shoppingWeekdays', '[3,6]')").run();
  insert('meal_slots', { id: 'lunch', name: 'Mittagessen', sort: 1, time: '12:00' });
  insert('meal_slots', { id: 'dinner', name: 'Abendessen', sort: 2, time: '17:00' });
  const markt = insert('stores', { id: newId(), name: 'Markt', sort: 0 });
  const we = insert('stores', { id: newId(), name: 'We', sort: 1 });
  const muesetand = insert('store_sections', { id: newId(), store_id: markt, name: 'Müsetand', sort: 0 });
  const metzger = insert('store_sections', { id: newId(), store_id: markt, name: 'Metzger', sort: 1 });
  const weMuese = insert('store_sections', { id: newId(), store_id: we, name: 'Müse', sort: 0 });
  const weRest = insert('store_sections', { id: newId(), store_id: we, name: 'Rest', sort: 1 });
  const kuehl = insert('storage_locations', { id: newId(), name: 'Kühlschrank', sort: 0 });
  const gemuese = insert('product_groups', { id: newId(), name: 'Gemüse', storage_location_id: kuehl, preferred_store_id: markt, fallback_store_id: we, sort: 0 });
  const fleisch = insert('product_groups', { id: newId(), name: 'Fleisch', storage_location_id: kuehl, preferred_store_id: markt, fallback_store_id: we, sort: 1 });
  const trocken = insert('product_groups', { id: newId(), name: 'Nudeln', preferred_store_id: we, sort: 2 });
  for (const [store, group, section] of [[markt, gemuese, muesetand], [we, gemuese, weMuese], [markt, fleisch, metzger], [we, fleisch, weRest], [we, trocken, weRest]]) {
    insert('section_groups', { store_id: store, group_id: group, section_id: section });
  }
  ids = {
    markt, we, metzger, weRest,
    ghetti: product('Ghetti', 'g', trocken),
    hack: product('Hackleisch', 'g', fleisch, { shelf_life_days: 1 }),
    maten: product('Maten', 'g', gemuese),
    blauch: product('Blauch', 'Zehe', gemuese),
    salz: product('Salz', 'Stück', trocken, { is_staple: 1 }),
    antipastis: product('Antipastis', 'Stück', trocken, { section_id: muesetand }),
    trone: product('Trone', 'Stück', gemuese),
  };
  ids.nese = saveDish(db, {
    name: 'Ghetti Nese', servings: 2, ingredients: [
      { productName: 'Ghetti', amount: 125, unit: 'g' },
      { productName: 'Hackleisch', amount: 100, unit: 'g' },
      { productName: 'Blauch', amount: 0.5, unit: 'Zehe' },
      { productName: 'Salz', amount: null, unit: 'Stück' },
    ],
  }).dish;
  ids.lat = saveDish(db, { name: 'Matenlat', ingredients: [{ productName: 'Maten', amount: 150, unit: 'g' }] }).dish;
  ids.brot = saveDish(db, { name: 'Ei-Rot', ingredients: [{ productName: 'Blauch', amount: 1, unit: 'Zehen' }] }).dish;
  ids.rillen = saveDish(db, {
    name: 'Rillen', ingredients: [{ productName: 'Hackleisch', amount: 200, unit: 'g' }],
    components: [{ dishName: 'Ei-Rot', factor: 0.5, optional: false }, { dishName: 'Matenlat', factor: 0.5, optional: true }],
  }).dish;
  ids.ner = saveDish(db, { name: 'Ner', kind: 'takeaway' }).dish;
});

const meal = (date, dish, extra = {}) => saveMeal(db, { date, slotId: 'dinner', kind: 'dish', dishId: dish.id, ...extra });
const trip = (from = '2026-10-14', to = '2026-10-16', date = from) => createTrip(db, { date, coversFrom: from, coversTo: to });
const line = (list, name, part = 'now') => list.items.find(i => i.name === name && i.part === part);

test('Zeitraum-Vorschlag mit Einkaufstagen Mi + Sa', () => {
  assert.deepEqual(suggestTripRange('2026-10-13', [3, 6]), { date: '2026-10-14', coversFrom: '2026-10-14', coversTo: '2026-10-16' }, 'Di → Mi–Fr');
  assert.deepEqual(suggestTripRange('2026-10-16', [3, 6]), { date: '2026-10-17', coversFrom: '2026-10-17', coversTo: '2026-10-20' }, 'Fr → Sa–Di');
  assert.deepEqual(suggestTripRange('2026-10-17', [3, 6]), { date: '2026-10-17', coversFrom: '2026-10-17', coversTo: '2026-10-20' }, 'Sa → Sa–Di');
  assert.deepEqual(suggestTripRange('2026-10-17', [3, 6], ['2026-10-17']).coversFrom, '2026-10-21', 'Sa schon abgedeckt → nächster Mi');
  trip('2026-10-14', '2026-10-16');
  assert.equal(suggestTrip(db, '2026-10-14').coversFrom, '2026-10-17');
});

test('Mengen pro Portion × Portionen, Einheiten werden zusammengefasst', () => {
  meal('2026-10-14', ids.nese, { servings: 2 });
  meal('2026-10-15', ids.nese, { servings: 3 });
  meal('2026-10-15', ids.brot, { servings: 1, slotId: 'lunch' });
  const list = buildTripList(db, trip());
  assert.equal(line(list, 'Ghetti').display, '625 g');
  assert.equal(line(list, 'Blauch').display, '3,5 Zehen', '0,5×2 + 0,5×3 + 1 (Zehe/Zehen zusammen)');
  assert.equal(line(list, 'Ghetti').sources.length, 2);
});

test('„nach Bedarf“ verschwindet neben bezifferten Mengen', () => {
  const zucker = saveDish(db, { name: 'Zuckerzeug', ingredients: [{ productName: 'Salz', amount: 70, unit: 'g' }] }).dish;
  meal('2026-10-14', ids.nese);
  meal('2026-10-15', zucker, { servings: 1 });
  assert.equal(line(buildTripList(db, trip()), 'Salz').display, '70 g');
});

test('Feste Bestandteile einmal, optionale Beilagen nur wenn gewählt, Holen ohne Bedarf', () => {
  meal('2026-10-14', ids.rillen, { servings: 2 });
  // wie in den übernommenen Daten: fester Bestandteil zusätzlich als gewählte Beilage gespeichert
  meal('2026-10-15', ids.rillen, { servings: 2, components: [{ dishId: ids.brot.id, factor: 0.5 }, { dishId: ids.lat.id, factor: 0.5 }] });
  meal('2026-10-16', ids.ner);
  const sources = collectNeeds(db, '2026-10-14', '2026-10-16');
  const blauch = sources.filter(s => s.productId === ids.blauch);
  assert.deepEqual(blauch.map(s => s.amount), [1, 1], 'Ei-Rot × 0,5 × 2 Portionen, je Mahlzeit einmal');
  const maten = sources.filter(s => s.productId === ids.maten);
  assert.deepEqual(maten.map(s => [s.date, s.amount, s.viaDish]), [['2026-10-15', 150, 'Matenlat']], 'Matenlat nur, wo gewählt');
});

test('Weggelassene optionale Zutat zählt nicht', () => {
  const blauchIngredient = ids.nese.ingredients.find(i => i.productName === 'Blauch');
  meal('2026-10-14', ids.nese, { excludedIngredientIds: [blauchIngredient.id] });
  assert.equal(line(buildTripList(db, trip()), 'Blauch'), undefined);
});

test('Planänderungen wirken sofort (alte Liste: Mengen gelöschter Mahlzeiten blieben stehen)', () => {
  const m = meal('2026-10-14', ids.nese);
  const t = trip();
  assert.equal(line(buildTripList(db, t), 'Ghetti').display, '250 g');
  saveMeal(db, { servings: 4 }, { id: m.id });
  assert.equal(line(buildTripList(db, t), 'Ghetti').display, '500 g');
  deleteMeal(db, m.id);
  assert.equal(line(buildTripList(db, t), 'Ghetti'), undefined);
});

test('„Brauche ich nicht“ gilt nur für diesen Einkauf (alte Liste: für immer unsichtbar)', () => {
  meal('2026-10-14', ids.nese);
  const first = trip();
  setTripItem(db, first.id, ids.ghetti, 'now', { state: 'skip' });
  assert.equal(line(buildTripList(db, first), 'Ghetti').state, 'skip');
  meal('2026-10-17', ids.nese);
  const second = trip('2026-10-17', '2026-10-20');
  assert.equal(line(buildTripList(db, second), 'Ghetti').state, 'open');
});

test('Grundvorrat ist vorab vorrätig, Mengen-Override wird angezeigt', () => {
  meal('2026-10-14', ids.nese);
  const t = trip();
  const list = buildTripList(db, t);
  assert.equal(line(list, 'Salz').state, 'have');
  assert.equal(line(list, 'Salz').display, 'nach Bedarf');
  setTripItem(db, t.id, ids.ghetti, 'now', { amount: 0.5, unit: 'kg' });
  const ghetti = line(buildTripList(db, t), 'Ghetti');
  assert.equal(ghetti.display, '0,5 kg');
  assert.deepEqual(ghetti.needed, [{ amount: 250, unit: 'g' }], 'berechneter Bedarf bleibt sichtbar');
});

test('Laden: Warengruppe, Ausweichladen, feste Ausnahme', () => {
  meal('2026-10-14', ids.nese);
  const t = trip();
  addFreeItem(db, { tripId: t.id, text: '1 Antipastis' });
  let list = buildTripList(db, t);
  assert.deepEqual([line(list, 'Hackleisch').store.name, line(list, 'Hackleisch').section.name], ['Markt', 'Metzger']);
  assert.deepEqual([line(list, 'Antipastis').store.name, line(list, 'Antipastis').section.name], ['Markt', 'Müsetand']);
  assert.equal(line(list, 'Antipastis').hasFallback, false);

  setTripItem(db, t.id, ids.hack, 'now', { useFallback: true });
  list = buildTripList(db, t);
  assert.deepEqual([line(list, 'Hackleisch').store.name, line(list, 'Hackleisch').section.name], ['We', 'Rest'], 'gibt\'s hier nicht → We');
});

test('Haltbarkeit: späterer Anteil wird getrennt und mit Datum ausgewiesen', () => {
  meal('2026-10-14', ids.nese);             // Hackleisch für Mi: jetzt kaufen
  meal('2026-10-16', ids.nese);             // Hackleisch für Fr: Haltbarkeit 1 Tag → ab Do
  const list = buildTripList(db, trip());
  assert.equal(line(list, 'Hackleisch').display, '200 g');
  const later = line(list, 'Hackleisch', 'later');
  assert.equal(later.display, '200 g');
  assert.equal(later.buyFrom, '2026-10-15');
  assert.equal(line(list, 'Ghetti').display, '500 g', 'ohne Haltbarkeit alles jetzt');
});

test('Freie Artikel: exakter Produktname zählt beim Produkt mit, sonst eigene Zeile – nie per Wortanfang', () => {
  meal('2026-10-14', ids.nese);
  const t = trip();
  addFreeItem(db, { tripId: t.id, text: '100 g Ghetti' });
  addFreeItem(db, { tripId: t.id, text: '2 Tro' });            // Wortanfang von „Trone“ → KEIN Treffer
  addFreeItem(db, { tripId: t.id, text: 'Waschmittel' });
  addFreeItem(db, { storeId: ids.markt, text: 'Blumen' });     // Merkliste
  const list = buildTripList(db, t);
  assert.equal(line(list, 'Ghetti').display, '350 g');
  assert.equal(line(list, 'Trone'), undefined);
  assert.deepEqual(list.freeItems.map(f => [f.text, f.display]), [['Tro', '2'], ['Waschmittel', '']]);
  assert.deepEqual(list.reminders.map(r => r.text), ['Blumen']);
});
