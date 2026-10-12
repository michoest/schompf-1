import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, newId, now } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { createPerson, createPairingCode } from '../src/repo/auth.js';

let server, base, token, db;

async function call(method, path, body, auth = token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

before(async () => {
  db = openDatabase(':memory:');
  db.prepare("INSERT INTO meal_slots (id, name, sort, time) VALUES ('dinner', 'Abendessen', 2, '17:00')").run();
  db.prepare('INSERT INTO products (id, name, unit, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(newId(), 'Ghetti', 'g', now(), now());
  createPerson(db, 'Andrea');
  server = createApp(db).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('ohne Anmeldung kein Zugriff, mit Code anmelden', async () => {
  assert.equal((await call('GET', '/api/dishes', null, null)).status, 401);
  assert.equal((await call('POST', '/api/auth/pair', { code: 'FALSCH', deviceName: 'iPhone' }, null)).status, 400);

  const { code } = createPairingCode(db, 'Andrea');
  const paired = await call('POST', '/api/auth/pair', { code: code.toLowerCase(), deviceName: 'iPhone' }, null);
  assert.equal(paired.status, 201);
  assert.equal(paired.body.person.name, 'Andrea');
  token = paired.body.token;

  assert.equal((await call('POST', '/api/auth/pair', { code, deviceName: 'nochmal' }, null)).status, 400, 'Code nur einmal');
  assert.equal((await call('GET', '/api/auth/me')).body.person.name, 'Andrea');
});

test('Gericht anlegen, ändern und Verlauf mit Person', async () => {
  const created = await call('POST', '/api/dishes', { name: 'Ghetti Nese', ingredients: [{ productName: 'Ghetti', amount: 125, unit: 'g' }] });
  assert.equal(created.status, 201);
  const id = created.body.id;

  const updated = await call('PUT', `/api/dishes/${id}`, { ingredients: [{ productName: 'Ghetti', amount: 150, unit: 'g' }] });
  assert.equal(updated.body.ingredients[0].amount, 150);
  assert.equal(updated.body.name, 'Ghetti Nese', 'nicht übergebene Felder bleiben');

  const changes = (await call('GET', `/api/dishes/${id}/changes`)).body;
  assert.deepEqual(changes.map(c => [c.person, c.summary]), [['Andrea', 'Ghetti: 125 g → 150 g'], ['Andrea', 'Angelegt']]);

  const invalid = await call('PUT', `/api/dishes/${id}`, { ingredients: [{ productName: 'Gibtsnicht' }] });
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body.details, ['Zutat 1: Produkt „Gibtsnicht“ unbekannt']);
});

test('Mahlzeiten: Gericht, Reste, Freitext', async () => {
  const dish = (await call('GET', '/api/dishes')).body[0];
  const meal = await call('POST', '/api/meals', { date: '2026-10-13', slotId: 'dinner', kind: 'dish', dishId: dish.id });
  assert.equal(meal.status, 201);
  assert.equal(meal.body.servings, 2, 'Portionen vom Gericht');
  assert.equal(meal.body.createdBy, 'Andrea');

  await call('POST', '/api/meals', { date: '2026-10-13', slotId: 'dinner', kind: 'leftovers' });
  const named = await call('POST', '/api/meals', { date: '2026-10-15', slotId: 'dinner', label: 'Kaffee & Kuchen', kind: 'text', text: 'Kuch' });
  assert.equal(named.body.label, 'Kaffee & Kuchen');
  await call('DELETE', `/api/meals/${named.body.id}`);
  await call('POST', '/api/meals', { date: '2026-10-14', slotId: 'dinner', kind: 'text', text: 'Holschompf' });
  assert.equal((await call('POST', '/api/meals', { date: '2026-10-14', slotId: 'dinner', kind: 'text' })).status, 400);

  const week = (await call('GET', '/api/meals?from=2026-10-13&to=2026-10-14')).body;
  assert.deepEqual(week.map(m => [m.date, m.kind, m.sort]), [['2026-10-13', 'dish', 0], ['2026-10-13', 'leftovers', 1], ['2026-10-14', 'text', 0]]);

  const moved = await call('PUT', `/api/meals/${meal.body.id}`, { date: '2026-10-14', status: 'prepared' });
  assert.equal(moved.body.date, '2026-10-14');
  assert.equal(moved.body.sort, 1);
  assert.equal(moved.body.dishId, dish.id, 'Gericht bleibt beim Verschieben');
});

test('Einkauf anlegen, abhaken; andere Geräte bekommen die Änderung live', async () => {
  const events = [];
  const controller = new AbortController();
  const stream = await fetch(`${base}/api/events?token=${token}`, { signal: controller.signal });
  assert.equal(stream.headers.get('content-type'), 'text/event-stream');
  const reader = stream.body.getReader();
  const reading = (async () => {
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const block of decoder.decode(value).split('\n\n')) {
          const data = /^event: change\ndata: (.*)$/m.exec(block);
          if (data) events.push(JSON.parse(data[1]));
        }
      }
    } catch { /* abgebrochen */ }
  })();

  const created = await call('POST', '/api/trips', { date: '2026-10-13', coversFrom: '2026-10-13', coversTo: '2026-10-16' });
  assert.equal(created.status, 201);
  const ghetti = created.body.items.find(i => i.name === 'Ghetti');
  assert.ok(ghetti, 'Bedarf aus den Mahlzeiten');
  const marked = await call('PUT', `/api/trips/${created.body.trip.id}/items/${ghetti.productId}/now`, { state: 'in_cart' });
  assert.equal(marked.body.state, 'in_cart');
  const current = (await call('GET', '/api/trips/current')).body;
  assert.equal(current.items.find(i => i.name === 'Ghetti').state, 'in_cart');
  assert.equal(current.items.find(i => i.name === 'Ghetti').updatedBy, 'Andrea');

  await new Promise(r => setTimeout(r, 50));
  controller.abort();
  await reading;
  assert.deepEqual(events.map(e => [e.scope, e.by]), [['trips', 'Andrea'], ['trips', 'Andrea']]);
});

test('Produkt in Benutzung kann nicht gelöscht werden', async () => {
  const ghetti = (await call('GET', '/api/products')).body.find(p => p.name === 'Ghetti');
  assert.equal(ghetti.usedIn, 1);
  const res = await call('DELETE', `/api/products/${ghetti.id}`);
  assert.equal(res.status, 400);
});

test('Eingang: Artikel von außen, ohne Token 401', async () => {
  assert.equal((await call('POST', '/api/inbox', { items: [{ ref: 'kairos:x', text: 'Milch' }] }, null)).status, 401);
  assert.equal((await call('POST', '/api/inbox', { items: [] })).status, 400);
  const res = await call('POST', '/api/inbox', { items: [{ ref: 'kairos:x', text: '2 l Milch' }, { ref: 'kairos:y', text: '' }] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items.map(i => i.status), ['created', 'error']);
  assert.equal((await call('POST', '/api/inbox', { items: [{ ref: 'kairos:x', text: '2 l Milch' }] })).body.items[0].status, 'exists');
});
