import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { listMeals, saveMeal } from './repo/meals.js';
import { getDish, listDishes, ValidationError } from './repo/dishes.js';
import { ensureCurrentTrip, buildTripList, toFreeItem } from './repo/trips.js';
import { addInboxItems } from './repo/inbox.js';
import { addFeedback, listFeedback } from './repo/feedback.js';
import { dishToFile } from './domain/dishFile.js';
import { addDays, todayLocal } from './domain/dates.js';

// MCP-Server (Streamable HTTP, zustandslos) unter POST /mcp, geschützt mit dem Geräte-Token.
// Gleiche Regeln wie die App: Die Einkaufsliste ändert sich nur ausdrücklich (Artikel hinzufügen),
// nie nebenbei beim Planen.

const INSTRUCTIONS = `Schompf ist die Mahlzeitenplanungs- und Einkaufs-App von Roßes und Leines (zwei Personen, ein Haushalt).
- Produkt- und Gerichtnamen sind auf „Schatzisch“: Wortanfang weg, Mehrzahl -s, Adjektive -es (Trone = Zitrone, Ghetti = Spaghetti, We = Rewe).
  Namen immer so verwenden, wie Schompf sie liefert; bei der Suche hilft search_dishes.
- Mahlzeiten liegen in Slots pro Tag (Frühstück, Mittagessen, Abendessen, Snacks). Ein Einkauf deckt einen Zeitraum ab;
  seine Liste ist eingefroren und ändert sich nur ausdrücklich (in der App „Liste anpassen“, hier add_to_shopping).
- Merklisten: Artikel „bei Gelegenheit“, an einen Laden gebunden, wenn gerade kein Einkauf offen ist.
- Datumsangaben YYYY-MM-DD, Zeitzone Europe/Berlin.`;

const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const STATES = { open: 'offen', have: 'vorrätig', in_cart: 'im Wagen', skip: 'brauche ich nicht' };
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const weekday = date => DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
const json = data => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] });
const fail = message => ({ content: [{ type: 'text', text: message }], isError: true });

/** Fachfehler (ValidationError) als Tool-Fehler zurückgeben statt als Protokollfehler. */
const guarded = fn => async args => {
  try { return await fn(args); } catch (e) {
    if (e instanceof ValidationError) return fail(e.message);
    throw e;
  }
};

/** Gericht per genauem Namen (Groß-/Kleinschreibung egal) – nie per Wortanfang. */
function findDish(db, name) {
  const row = db.prepare('SELECT id FROM dishes WHERE name = ? COLLATE NOCASE').get(name.trim());
  return row ? getDish(db, row.id) : null;
}

function dishNotFound(db, name) {
  const q = name.trim().toLowerCase();
  const similar = listDishes(db).filter(d => d.name.toLowerCase().includes(q) || q.includes(d.name.toLowerCase())).map(d => d.name);
  return fail(`Gericht „${name}“ nicht gefunden.${similar.length ? ` Ähnlich: ${similar.join(', ')}` : ' search_dishes hilft beim Suchen.'}`);
}

function presentMeal(meal, slots) {
  const title = meal.kind === 'dish' ? meal.dishName : meal.kind === 'leftovers' ? 'Reste' : meal.text;
  return {
    id: meal.id,
    slot: meal.label ?? slots.get(meal.slotId) ?? meal.slotId,
    title,
    ...(meal.kind === 'dish' ? { servings: meal.servings } : {}),
    ...(meal.dishKind && meal.dishKind !== 'cook' ? { dish_kind: meal.dishKind === 'buy' ? 'kaufen' : 'bestellen/auswärts' } : {}),
    ...(meal.components.length ? { with: meal.components.map(c => c.dishName) } : {}),
    ...(meal.text && meal.kind !== 'text' ? { note: meal.text } : {}),
    ...(meal.status === 'prepared' ? { prepared: true } : {}),
    on_shopping_list: !!meal.tripId,
  };
}

function presentFreeItem(f, stores) {
  return {
    text: f.text, ...(f.display ? { amount: f.display } : {}), state: STATES[f.state] ?? f.state,
    ...(f.storeId ? { store: stores.get(f.storeId) } : {}), ...(f.createdBy ? { by: f.createdBy } : {}),
  };
}

export function buildMcpServer({ db, person, changed = () => {}, planNotifier = null }) {
  const server = new McpServer({ name: 'schompf', version: '1.0.0' }, { instructions: INSTRUCTIONS });
  const slots = () => new Map(db.prepare('SELECT id, name FROM meal_slots ORDER BY sort').all().map(s => [s.id, s.name]));

  server.registerTool('list_plan', {
    description: 'Geplante Mahlzeiten im Zeitraum, nach Tag gruppiert („Was essen wir nächste Woche?“). Standard: heute bis in 6 Tagen.',
    inputSchema: { from: DATE.optional(), to: DATE.optional() },
  }, guarded(async ({ from, to }) => {
    const today = todayLocal();
    from ??= today;
    to ??= addDays(from, 6);
    const names = slots();
    const days = new Map();
    for (const meal of listMeals(db, { from, to })) {
      if (!days.has(meal.date)) days.set(meal.date, []);
      days.get(meal.date).push(presentMeal(meal, names));
    }
    return json({
      today, from, to,
      days: [...days].map(([date, meals]) => ({ date, weekday: weekday(date), meals })),
    });
  }));

  server.registerTool('search_dishes', {
    description: 'Gerichte suchen: Text passt auf Name, Kategorie oder Zutat (z.B. „Bis“, „Reis“, „schnell“ gibt es nicht – dafür max_minutes). Ohne Angaben: alle aktiven Gerichte.',
    inputSchema: {
      query: z.string().optional(),
      max_minutes: z.number().int().positive().optional().describe('Höchstens so viele Minuten Gesamtzeit'),
      include_drafts: z.boolean().default(false).describe('Auch Entwürfe zeigen'),
    },
  }, guarded(async ({ query, max_minutes, include_drafts }) => {
    const q = query?.trim().toLowerCase();
    const dishes = listDishes(db)
      .filter(d => include_drafts || d.status === 'active')
      .filter(d => !max_minutes || (d.totalMinutes != null && d.totalMinutes <= max_minutes))
      .filter(d => !q || d.name.toLowerCase().includes(q) || d.categories.some(c => c.toLowerCase().includes(q))
        || d.ingredients.some(i => i.productName.toLowerCase().includes(q)));
    return json({
      count: dishes.length,
      dishes: dishes.map(d => ({
        name: d.name, kind: { cook: 'kochen', buy: 'kaufen', takeaway: 'bestellen/auswärts' }[d.kind],
        ...(d.status === 'draft' ? { draft: true } : {}), categories: d.categories,
        ...(d.totalMinutes != null ? { minutes: d.totalMinutes } : {}), servings: d.servings,
      })),
    });
  }));

  server.registerTool('get_dish', {
    description: 'Ein Gericht vollständig: Zutaten (Mengen pro Portion), Beilagen, Vorbereitungen und Rezept, im Schompf-Dateiformat (YAML-Kopf + Rezept).',
    inputSchema: { name: z.string().min(1) },
  }, guarded(async ({ name }) => {
    const dish = findDish(db, name);
    if (!dish) return dishNotFound(db, name);
    const feedback = listFeedback(db, { status: 'open', dishId: dish.id }).map(f => ({ by: f.person, text: f.text, at: f.createdAt.slice(0, 10) }));
    return { content: [
      { type: 'text', text: dishToFile(dish) },
      ...(feedback.length ? [{ type: 'text', text: `Offene Anmerkungen: ${JSON.stringify(feedback)}` }] : []),
    ] };
  }));

  server.registerTool('get_shopping', {
    description: 'Die Einkaufsliste (durchgehend: Einträge bleiben, bis sie gekauft sind; nach Laden und Abschnitt, mit Status) und die Merklisten der Läden.',
    inputSchema: {},
  }, guarded(async () => {
    const stores = new Map(db.prepare('SELECT id, name FROM stores').all().map(s => [s.id, s.name]));
    const trip = ensureCurrentTrip(db);
    let list = null, reminders;
    if (trip) {
      const built = buildTripList(db, trip);
      const byStore = new Map();
      for (const item of built.items) {
        const store = item.store?.name ?? 'ohne Laden';
        if (!byStore.has(store)) byStore.set(store, []);
        byStore.get(store).push({
          name: item.name, amount: item.display || 'nach Bedarf', state: STATES[item.state],
          ...(item.section ? { section: item.section.name } : {}), ...(item.isNew ? { new: true } : {}),
          ...(item.buyFrom ? { buy_from: item.buyFrom } : {}),
        });
      }
      list = {
        date: trip.date, weekday: weekday(trip.date), covers: `${trip.coversFrom} – ${trip.coversTo}`,
        phase: { planning: 'Planung', pantry: 'Vorrat prüfen', shopping: 'beim Einkaufen' }[trip.phase],
        stores: Object.fromEntries(byStore),
        extra: built.freeItems.map(f => presentFreeItem(f, stores)),
      };
      reminders = built.reminders;
    } else {
      reminders = db.prepare(`SELECT f.*, p.name AS created_by_name FROM free_items f LEFT JOIN persons p ON p.id = f.created_by
                              WHERE f.trip_id IS NULL AND f.state = 'open' ORDER BY f.created_at`).all().map(toFreeItem);
    }
    const notes = {};
    for (const f of reminders) (notes[stores.get(f.storeId) ?? '?'] ??= []).push(presentFreeItem({ ...f, storeId: null }, stores));
    return json({ trip: list, notes_by_store: notes });
  }));

  server.registerTool('add_to_shopping', {
    description: 'Artikel auf die Einkaufsliste setzen, wie in der Schnellzeile der App getippt („2 l Milch“, „Waschmittel“). '
      + 'Ziel bestimmt Schompf: offener Einkauf, sonst Merkliste des passenden Ladens. Nur auf ausdrücklichen Wunsch verwenden.',
    inputSchema: {
      items: z.array(z.string().min(1).max(200)).min(1).max(50),
    },
  }, guarded(async ({ items }) => {
    const results = addInboxItems(db, items.map(text => ({ ref: `mcp:${randomUUID()}`, text })), person.id);
    if (results.some(r => r.status === 'created')) changed('free-items');
    return json(results.map(r => r.status === 'error'
      ? { text: items[results.indexOf(r)], error: r.message }
      : { text: r.text, ...(r.amount != null ? { amount: r.amount, unit: r.unit } : {}), added_to: r.target.label }));
  }));

  server.registerTool('plan_meal', {
    description: 'Mahlzeit planen: Gericht (Name) oder freier Text an einem Tag in einem Slot. '
      + 'Die Einkaufsliste eines bereits erstellten Einkaufs ändert sich dadurch NICHT (das geht nur in der App per „Liste anpassen“).',
    inputSchema: {
      date: DATE,
      slot: z.string().min(1).describe('Slot-Name oder -ID, z.B. „Abendessen“'),
      dish: z.string().optional().describe('Gerichtname (genau wie in Schompf)'),
      text: z.string().optional().describe('Freier Text statt Gericht, z.B. „Essen bei Oma“'),
      servings: z.number().positive().optional().describe('Portionen (Standard: wie beim Gericht hinterlegt)'),
    },
  }, guarded(async ({ date, slot, dish: dishName, text, servings }) => {
    const slotRow = db.prepare('SELECT id, name FROM meal_slots WHERE id = ? OR name = ? COLLATE NOCASE').get(slot, slot.trim());
    if (!slotRow) return fail(`Slot „${slot}“ unbekannt. Vorhanden: ${[...slots().values()].join(', ')}`);
    if (!dishName === !text) return fail('Entweder dish oder text angeben.');
    let input;
    if (dishName) {
      const dish = findDish(db, dishName);
      if (!dish) return dishNotFound(db, dishName);
      input = { date, slotId: slotRow.id, kind: 'dish', dishId: dish.id, ...(servings ? { servings } : {}) };
    } else {
      input = { date, slotId: slotRow.id, kind: 'text', text };
    }
    const meal = saveMeal(db, input, { personId: person.id });
    changed('meals');
    planNotifier?.mealPlanned(person, meal.date);
    const trip = db.prepare(`SELECT covers_to FROM shopping_trips WHERE phase != 'done' AND plan_taken_at IS NOT NULL AND covers_from <= ? AND covers_to >= ?`).get(date, date);
    return json({
      planned: { date, weekday: weekday(date), ...presentMeal(meal, slots()) },
      ...(trip && meal.kind === 'dish' ? { hint: `Die Einkaufsliste enthält den Plan bis ${weekday(trip.covers_to)} ${trip.covers_to}; diese Mahlzeit steht noch nicht drauf (in der App beim Bearbeiten: „Auf die Einkaufsliste“).` } : {}),
    });
  }));

  server.registerTool('list_feedback', {
    description: 'Anmerkungen der Nutzer zu Gerichten oder zur App. Standard: nur offene.',
    inputSchema: { status: z.enum(['open', 'done', 'all']).default('open') },
  }, guarded(async ({ status }) => json(listFeedback(db, { status: status === 'all' ? null : status }).map(f => ({
    id: f.id.slice(0, 8), ...(f.dishName ? { dish: f.dishName } : {}), by: f.person, text: f.text, status: f.status,
    ...(f.resolution ? { resolution: f.resolution } : {}), at: f.createdAt.slice(0, 10),
  })))));

  server.registerTool('add_feedback', {
    description: 'Anmerkung anlegen, zu einem Gericht (dish) oder allgemein zur App – wie „Feedback geben“ in der App.',
    inputSchema: { text: z.string().min(1).max(5000), dish: z.string().optional() },
  }, guarded(async ({ text, dish: dishName }) => {
    let dishId = null;
    if (dishName) {
      const dish = findDish(db, dishName);
      if (!dish) return dishNotFound(db, dishName);
      dishId = dish.id;
    }
    const feedback = addFeedback(db, { dishId, text }, person.id);
    changed('feedback');
    return json({ id: feedback.id.slice(0, 8), dish: feedback.dishName, text: feedback.text });
  }));

  return server;
}

/** Express-Handler; req.person/req.device setzt die Token-Prüfung davor. */
export function mcpHandler({ db, events, planNotifier }) {
  return async (req, res) => {
    const changed = scope => events.publish({ scope, by: req.person.name, deviceId: req.device.id });
    const server = buildMcpServer({ db, person: req.person, changed, planNotifier });
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error('mcp', e);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  };
}
