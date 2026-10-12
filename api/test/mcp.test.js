import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openDatabase, newId, now } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { createPerson, createPairingCode, pairDevice } from '../src/repo/auth.js';
import { saveDish } from '../src/repo/dishes.js';
import { createTrip } from '../src/repo/trips.js';
import { todayLocal, addDays } from '../src/domain/dates.js';

let server, base, client, db;

before(async () => {
  db = openDatabase(':memory:');
  db.prepare("INSERT INTO meal_slots (id, name, sort, time) VALUES ('dinner', 'Abendessen', 2, '17:00')").run();
  db.prepare("INSERT INTO stores (id, name, sort) VALUES (?, 'We', 0)").run(newId());
  db.prepare('INSERT INTO products (id, name, unit, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(newId(), 'Ghetti', 'g', now(), now());
  saveDish(db, { name: 'Ghetti Nese', servings: 2, totalMinutes: 30, categories: ['Nudeln'], recipe: '{Ghetti} kochen.',
    ingredients: [{ productName: 'Ghetti', amount: 125, unit: 'g' }] });
  createPerson(db, 'Roßes');
  const { token } = pairDevice(db, createPairingCode(db, 'Roßes').code, 'Claude');
  server = createApp(db).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  client = new Client({ name: 'test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
});

after(async () => { await client.close(); server.close(); });

const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { ...res, data: res.isError ? null : (() => { try { return JSON.parse(res.content[0].text); } catch { return res.content[0].text; } })() };
};

test('ohne Token kein Zugriff', async () => {
  const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 401);
});

test('Tools sind da', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(),
    ['add_feedback', 'add_to_shopping', 'get_dish', 'get_shopping', 'list_feedback', 'list_plan', 'plan_meal', 'search_dishes']);
});

test('Gericht suchen, lesen, planen – Plan zeigt es, Liste bleibt unverändert', async () => {
  assert.deepEqual((await call('search_dishes', { query: 'ghetti' })).data.dishes.map(d => d.name), ['Ghetti Nese']);
  assert.equal((await call('search_dishes', { max_minutes: 20 })).data.count, 0);
  assert.match((await call('get_dish', { name: 'ghetti nese' })).content[0].text, /125 g Ghetti/);
  const missing = await call('get_dish', { name: 'Ghetti' });
  assert.ok(missing.isError);
  assert.match(missing.content[0].text, /Ähnlich: Ghetti Nese/);

  const day = addDays(todayLocal(), 1);
  createTrip(db, { date: day, coversFrom: day, coversTo: addDays(day, 2) });
  const planned = await call('plan_meal', { date: day, slot: 'abendessen', dish: 'Ghetti Nese' });
  assert.equal(planned.data.planned.title, 'Ghetti Nese');
  assert.equal(planned.data.planned.servings, 2);
  assert.equal(planned.data.planned.on_shopping_list, false);
  assert.match(planned.data.hint, /nicht angepasst/);
  assert.ok((await call('plan_meal', { date: day, slot: 'Brunch', text: 'x' })).isError);

  const plan = (await call('list_plan')).data;
  assert.equal(plan.days[0].date, day);
  assert.equal(plan.days[0].meals[0].slot, 'Abendessen');
});

test('Einkauf: Artikel hinzufügen landet im aktuellen Einkauf', async () => {
  const added = (await call('add_to_shopping', { items: ['2 l Milch'] })).data;
  assert.match(added[0].added_to, /^Einkauf /);
  const shopping = (await call('get_shopping')).data;
  assert.ok(shopping.trip);
  assert.deepEqual(shopping.trip.extra.map(i => i.text), ['Milch']);
});

test('Anmerkungen schreiben und lesen', async () => {
  const fb = (await call('add_feedback', { text: 'Mehr Blauch', dish: 'Ghetti Nese' })).data;
  assert.equal(fb.dish, 'Ghetti Nese');
  const open = (await call('list_feedback')).data;
  assert.equal(open[0].text, 'Mehr Blauch');
  assert.equal(open[0].by, 'Roßes');
  assert.match((await call('get_dish', { name: 'Ghetti Nese' })).content[1].text, /Mehr Blauch/);
});
