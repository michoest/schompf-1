import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, newId, now } from '../src/db/index.js';
import { suggestTripRange } from '../src/domain/dates.js';
import { saveDish } from '../src/repo/dishes.js';
import { saveMeal, deleteMeal } from '../src/repo/meals.js';
import {
  createTrip, buildTripList, setTripItem, addFreeItem, collectNeeds, suggestTrip, syncMealToTrip, previewMealSync, updateTrip,
  finishTrip, takeOverPlan, ensureCurrentTrip, getCurrentTrip, openNeedsOfMeal, releaseMealNeeds,
} from '../src/repo/trips.js';

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
      { productName: 'Blauch', amount: 0.5, unit: 'Zehe', optional: true },
      { productName: 'Salz', amount: null, unit: 'Stück' },
      { productName: 'Trone', amount: 1, unit: 'Stück', optional: true, defaultOn: false },
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
const getTripFresh = id => db.prepare('SELECT * FROM shopping_trips WHERE id = ?').all(id).map(r => ({ id: r.id, date: r.date, coversFrom: r.covers_from, coversTo: r.covers_to, phase: r.phase, createdAt: r.created_at }))[0];

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
  const sources = collectNeeds(db, { from: '2026-10-14', to: '2026-10-16' });
  const blauch = sources.filter(s => s.productId === ids.blauch);
  assert.deepEqual(blauch.map(s => s.amount), [1, 1], 'Ei-Rot × 0,5 × 2 Portionen, je Mahlzeit einmal');
  const maten = sources.filter(s => s.productId === ids.maten);
  assert.deepEqual(maten.map(s => [s.date, s.amount, s.viaDish]), [['2026-10-15', 150, 'Matenlat']], 'Matenlat nur, wo gewählt');
});

test('Optionale Zutaten: Standard an/aus, Auswahl pro Mahlzeit', () => {
  const blauch = ids.nese.ingredients.find(i => i.productName === 'Blauch');
  const trone = ids.nese.ingredients.find(i => i.productName === 'Trone');
  const standard = meal('2026-10-14', ids.nese);
  let list = buildTripList(db, trip());
  assert.equal(line(list, 'Blauch').display, '1 Zehe', 'normalerweise dabei');
  assert.equal(line(list, 'Trone'), undefined, 'nur manchmal dabei → standardmäßig nicht');

  const changed = saveMeal(db, { ingredientChoices: [{ ingredientId: blauch.id, included: false }, { ingredientId: trone.id, included: true }] }, { id: standard.id });
  assert.deepEqual(changed.ingredientChoices.map(c => c.included).sort(), [false, true]);
  syncMealToTrip(db, standard.id);
  list = buildTripList(db, getTripFresh(db.prepare('SELECT trip_id FROM meals WHERE id = ?').pluck().get(standard.id)));
  assert.equal(line(list, 'Blauch'), undefined);
  assert.equal(line(list, 'Trone').display, '2');

  // Auswahl gleich dem Standard wird nicht gespeichert
  const plain = saveMeal(db, { ingredientChoices: [{ ingredientId: blauch.id, included: true }, { ingredientId: trone.id, included: false }] }, { id: standard.id });
  assert.deepEqual(plain.ingredientChoices, []);
});

test('Liste ist eingefroren: Planänderungen nur mit ausdrücklichem Anpassen', () => {
  const m = meal('2026-10-14', ids.nese);
  const t = trip();
  assert.equal(line(buildTripList(db, t), 'Ghetti').display, '250 g');
  assert.equal(db.prepare('SELECT trip_id FROM meals WHERE id = ?').pluck().get(m.id), t.id, 'Mahlzeit steht auf dem Einkauf');

  saveMeal(db, { servings: 4 }, { id: m.id });
  assert.equal(line(buildTripList(db, t), 'Ghetti').display, '250 g', 'ohne Anpassen bleibt die Liste');

  const preview = previewMealSync(db, { servings: 6 }, { id: m.id, saveMeal });
  assert.equal(preview.committed, true);
  assert.deepEqual(preview.delta.filter(d => d.name === 'Ghetti').map(d => d.display), ['+500 g']);
  assert.equal(db.prepare('SELECT servings FROM meals WHERE id = ?').pluck().get(m.id), 4, 'Vorschau speichert nichts');

  syncMealToTrip(db, m.id);
  const ghetti = line(buildTripList(db, t), 'Ghetti');
  assert.equal(ghetti.display, '500 g');

  deleteMeal(db, m.id);
  assert.equal(line(buildTripList(db, t), 'Ghetti').display, '500 g', 'gelöscht ohne Anpassen: Zutaten bleiben auf der Liste');
});

test('Neue Mahlzeit im Zeitraum: nur mit Anpassen auf die Liste, dann als neu markiert', () => {
  meal('2026-10-14', ids.nese);
  const t = trip();
  const late = meal('2026-10-15', ids.lat);
  assert.equal(line(buildTripList(db, t), 'Maten'), undefined);
  assert.equal(previewMealSync(db, { date: '2026-10-15', slotId: 'lunch', kind: 'dish', dishId: ids.lat.id }, { saveMeal }).trip.id, t.id);
  db.prepare("UPDATE shopping_trips SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").run(t.id);
  syncMealToTrip(db, late.id);
  const maten = line(buildTripList(db, getTripFresh(t.id)), 'Maten');
  assert.equal(maten.display, '300 g');
  assert.equal(maten.isNew, true);
});

test('Gelöschte Mahlzeit mit Anpassen: Zutaten verschwinden; neuer Einkauf nimmt nur Mahlzeiten ohne Liste', () => {
  const m = meal('2026-10-14', ids.nese);
  const first = trip('2026-10-14', '2026-10-16');
  syncMealToTrip(db, m.id, { remove: true });
  assert.equal(line(buildTripList(db, first), 'Ghetti'), undefined);

  const bought = meal('2026-10-15', ids.lat);
  syncMealToTrip(db, bought.id);
  setTripItem(db, first.id, ids.maten, 'now', { state: 'in_cart' });
  saveMeal(db, { date: '2026-10-18' }, { id: bought.id });   // verschoben in den nächsten Zeitraum
  meal('2026-10-19', ids.nese);
  const second = trip('2026-10-17', '2026-10-20');
  const list = buildTripList(db, second);
  assert.equal(line(list, 'Maten'), undefined, 'schon eingekauft, obwohl verschoben');
  assert.equal(line(list, 'Ghetti').display, '250 g');
  assert.equal(previewMealSync(db, { servings: 3 }, { id: bought.id, saveMeal }).done, true, 'alter Einkauf ist abgeschlossen');
});

test('Zeitraum erweitern übernimmt dort noch nicht verplante Mahlzeiten', () => {
  meal('2026-10-14', ids.nese);
  const t = trip('2026-10-14', '2026-10-14');
  meal('2026-10-15', ids.lat);
  updateTrip(db, t.id, { coversTo: '2026-10-15' });
  assert.equal(line(buildTripList(db, getTripFresh(t.id)), 'Maten').display, '300 g');
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
  const t = trip();
  const list = buildTripList(db, t, '2026-10-14');
  assert.equal(line(list, 'Hackleisch').display, '200 g');
  const later = line(list, 'Hackleisch', 'later');
  assert.equal(later.display, '200 g');
  assert.equal(later.buyFrom, '2026-10-15');
  assert.equal(line(list, 'Ghetti').display, '500 g', 'ohne Haltbarkeit alles jetzt');
  // am Kauftag steht es von selbst in der normalen Liste
  const thursday = buildTripList(db, t, '2026-10-15');
  assert.equal(line(thursday, 'Hackleisch', 'later'), undefined);
  assert.equal(line(thursday, 'Hackleisch').display, '400 g');
});

test('Einkauf fertig: Erledigtes verschwindet, Offenes bleibt samt Mengenänderung auf der Liste', () => {
  meal('2026-10-14', ids.nese);
  const t = trip();
  setTripItem(db, t.id, ids.ghetti, 'now', { state: 'in_cart' });
  setTripItem(db, t.id, ids.hack, 'now', { amount: 300, unit: 'g' });
  setTripItem(db, t.id, ids.blauch, 'now', { state: 'have' });
  addFreeItem(db, { tripId: t.id, text: 'Regano' });
  const gekauft = addFreeItem(db, { tripId: t.id, text: 'Brezeln' });
  db.prepare("UPDATE free_items SET state = 'in_cart' WHERE id = ?").run(gekauft.id);

  const next = finishTrip(db);
  assert.equal(getTripFresh(t.id).phase, 'done');
  assert.equal(getCurrentTrip(db).id, next.id);
  const list = buildTripList(db, next, '2026-10-14');
  assert.equal(line(list, 'Ghetti'), undefined, 'im Wagen → erledigt');
  assert.equal(line(list, 'Blauch'), undefined, 'vorrätig → erledigt');
  assert.equal(line(list, 'Hackleisch').display, '300 g', 'offen, Mengenänderung bleibt');
  assert.deepEqual(list.freeItems.map(f => f.text), ['Regano']);
  assert.equal(line(finishTrip(db) && buildTripList(db, getCurrentTrip(db), '2026-10-14'), 'Hackleisch').display, '300 g', 'auch über mehrere Runden');
});

test('Es gibt immer eine Liste; Plan übernehmen nimmt nur Offenes ab dem Tag, ohne Zubereitetes', () => {
  assert.ok(!getCurrentTrip(db));
  const empty = ensureCurrentTrip(db);
  assert.equal(buildTripList(db, empty).items.length, 0, 'leere Liste, nichts im Hintergrund übernommen');
  meal('2026-10-13', ids.lat);                       // vor dem Tag: bleibt draußen
  const done = meal('2026-10-14', ids.nese);
  saveMeal(db, { status: 'prepared' }, { id: done.id });
  meal('2026-10-15', ids.nese);
  meal('2026-10-20', ids.lat);                       // nach „bis“
  const t = takeOverPlan(db, { from: '2026-10-14', to: '2026-10-16' });
  assert.equal(t.id, empty.id);
  assert.equal(t.coversTo, '2026-10-16');
  const list = buildTripList(db, t, '2026-10-14');
  assert.equal(line(list, 'Ghetti').display, '250 g');
  assert.equal(line(list, 'Maten'), undefined);
  assert.equal(line(list, 'Ghetti').isNew, false, 'Übernommenes ist nicht „neu“');
});

test('Neuer Bedarf auf einer schon erledigten Zeile steht wieder offen da', () => {
  meal('2026-10-14', ids.nese);
  const t = trip();
  setTripItem(db, t.id, ids.ghetti, 'now', { state: 'in_cart' });
  setTripItem(db, t.id, ids.hack, 'now', { state: 'in_cart' });
  const later = meal('2026-10-15', ids.lat);
  syncMealToTrip(db, later.id);
  let list = buildTripList(db, t, '2026-10-14');
  assert.equal(line(list, 'Ghetti').state, 'in_cart', 'anderes Produkt: bleibt im Wagen');
  addFreeItem(db, { tripId: t.id, text: '100 g Ghetti' });
  list = buildTripList(db, t, '2026-10-14');
  assert.equal(line(list, 'Ghetti').state, 'open');
  assert.equal(line(list, 'Ghetti').display, '100 g', 'nur der neue Bedarf');
  // eigene Mahlzeit neu einfrieren (z.B. Portionen geändert) öffnet nichts wieder
  syncMealToTrip(db, db.prepare('SELECT id FROM meals WHERE date = ?').pluck().get('2026-10-14'));
  assert.equal(line(buildTripList(db, t, '2026-10-14'), 'Hackleisch').state, 'in_cart');
});

test('Zubereitet/gelöscht: nur offene Zutaten, nur der eigene Anteil verschwindet', () => {
  const a = meal('2026-10-14', ids.nese);
  meal('2026-10-15', ids.nese);
  const t = trip();
  setTripItem(db, t.id, ids.ghetti, 'now', { state: 'in_cart' });
  const needs = openNeedsOfMeal(db, a.id);
  assert.deepEqual(needs.map(n => [n.name, n.display]).sort(), [['Blauch', '1 Zehe'], ['Hackleisch', '200 g']]);
  releaseMealNeeds(db, a.id);
  const list = buildTripList(db, t, '2026-10-14');
  assert.equal(line(list, 'Ghetti').display, '500 g', 'schon im Wagen: bleibt');
  assert.equal(line(list, 'Hackleisch').display, '200 g', 'nur der Anteil des anderen Essens');
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

test('Neuer Einkauf übernimmt offene freie Artikel des abgeschlossenen Einkaufs', () => {
  const alt = trip('2026-10-14', '2026-10-16');
  addFreeItem(db, { tripId: alt.id, text: 'Regano' });
  const erledigt = addFreeItem(db, { tripId: alt.id, text: 'Brezeln' });
  db.prepare("UPDATE free_items SET state = 'in_cart' WHERE id = ?").run(erledigt.id);
  const neu = trip('2026-10-17', '2026-10-20');
  assert.equal(getTripFresh(alt.id).phase, 'done');
  assert.deepEqual(buildTripList(db, neu).freeItems.map(f => f.text), ['Regano']);
  assert.deepEqual(buildTripList(db, getTripFresh(alt.id)).freeItems.map(f => f.text), ['Brezeln']);
});
