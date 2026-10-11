import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, newId, now } from '../src/db/index.js';
import { saveDish } from '../src/repo/dishes.js';
import { saveMeal } from '../src/repo/meals.js';
import { createTrip } from '../src/repo/trips.js';
import { addFeedback, listFeedback, resolveFeedback } from '../src/repo/feedback.js';
import { dueNotifications, shiftOutOfQuietHours } from '../src/notifications.js';

process.env.TZ = 'Europe/Berlin';
let db, dish;
const local = s => new Date(s); // ohne Z = lokale Zeit

beforeEach(() => {
  db = openDatabase(':memory:');
  db.prepare("INSERT INTO meal_slots (id, name, sort, time) VALUES ('dinner', 'Abendessen', 2, '17:00')").run();
  db.prepare("INSERT INTO meal_slots (id, name, sort, time, optional) VALUES ('snack-evening', 'Spätsnack', 3, NULL, 1)").run();
  db.prepare('INSERT INTO products (id, name, unit, shelf_life_days, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(newId(), 'Hackleisch', 'g', 1, now(), now());
  db.prepare('INSERT INTO products (id, name, unit, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(newId(), 'Kichererbsen', 'g', now(), now());
  dish = saveDish(db, {
    name: 'Chili', totalMinutes: 45,
    ingredients: [{ productName: 'Hackleisch', amount: 100, unit: 'g' }, { productName: 'Kichererbsen', amount: 50, unit: 'g' }],
    preparations: [{ text: 'Kichererbsen einweichen', leadHours: 12 }],
  }).dish;
});

test('Nächtliche Erinnerungen werden auf 21 Uhr am Vorabend vorgezogen', () => {
  assert.equal(shiftOutOfQuietHours(local('2026-10-14T05:00')).toString(), local('2026-10-13T21:00').toString());
  assert.equal(shiftOutOfQuietHours(local('2026-10-14T23:30')).toString(), local('2026-10-14T21:00').toString());
  assert.equal(shiftOutOfQuietHours(local('2026-10-14T10:00')).toString(), local('2026-10-14T10:00').toString());
});

test('Vorbereitung: fällig 12 h vor dem Abendessen (05:00 → Vorabend 21 Uhr), bis zur Mahlzeit', () => {
  saveMeal(db, { date: '2026-10-14', slotId: 'dinner', kind: 'dish', dishId: dish.id });
  const types = at => dueNotifications(db, local(at)).filter(n => n.type === 'prep');
  assert.equal(types('2026-10-13T20:59').length, 0);
  const due = types('2026-10-13T21:00');
  assert.equal(due.length, 1);
  assert.equal(due[0].title, 'Vorbereitung: Chili');
  assert.equal(due[0].body, 'Kichererbsen einweichen – für Mi Abendessen');
  assert.equal(types('2026-10-14T17:00').length, 0, 'nach Beginn der Mahlzeit nicht mehr');
});

test('Kochzeit: zur Slot-Zeit, nur im Zeitfenster, nicht für Slots ohne Zeit oder Zubereitetes', () => {
  const meal = saveMeal(db, { date: '2026-10-14', slotId: 'dinner', kind: 'dish', dishId: dish.id, servings: 3 });
  saveMeal(db, { date: '2026-10-14', slotId: 'snack-evening', kind: 'dish', dishId: dish.id });
  const cook = at => dueNotifications(db, local(at)).filter(n => n.type === 'cook');
  assert.equal(cook('2026-10-14T16:59').length, 0);
  const due = cook('2026-10-14T17:05');
  assert.deepEqual(due.map(n => [n.title, n.body, n.silent, n.url]), [['Abendessen: Chili', '3 Portionen · ca. 45 Min.', true, `/gericht/${dish.id}?servings=3`]]);
  assert.equal(cook('2026-10-14T18:00').length, 0, 'nach 45 Minuten nicht mehr nachholen');
  saveMeal(db, { status: 'prepared' }, { id: meal.id });
  assert.equal(cook('2026-10-14T17:05').length, 0);
});

test('Später kaufen: Erinnerung ab 9 Uhr am Kauftag', () => {
  saveMeal(db, { date: '2026-10-16', slotId: 'dinner', kind: 'dish', dishId: dish.id });
  createTrip(db, { date: '2026-10-14', coversFrom: '2026-10-14', coversTo: '2026-10-16' });
  const buy = at => dueNotifications(db, local(at)).filter(n => n.type === 'buy');
  assert.equal(buy('2026-10-15T08:30').length, 0);
  const due = buy('2026-10-15T09:00');
  assert.equal(due[0].title, 'Heute kaufen: Hackleisch');
  assert.equal(due[0].body, 'Hackleisch 200 g (für Chili, Fr)');
});

test('Anmerkungen: anlegen, lesen, erledigen (ID-Anfang genügt)', () => {
  const f = addFeedback(db, { dishId: dish.id, text: 'Zu viel Hackleisch' });
  addFeedback(db, { text: 'Allgemein: Knöpfe größer' });
  assert.deepEqual(listFeedback(db, { status: 'open' }).map(x => x.dishName).sort(), [null, 'Chili'].sort());
  const done = resolveFeedback(db, f.id.slice(0, 8), { resolution: 'Hackleisch 100 → 80 g' });
  assert.equal(done.status, 'done');
  assert.equal(listFeedback(db, { status: 'open' }).length, 1);
});
