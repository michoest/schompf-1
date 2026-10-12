import { newId, now } from '../db/index.js';
import { sumAmounts, formatAmount, normalizeUnit } from '../domain/units.js';
import { addDays, suggestTripRange, todayLocal } from '../domain/dates.js';
import { parseIngredientLine } from '../domain/dishFile.js';
import { ValidationError } from './dishes.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATES = ['open', 'have', 'in_cart', 'skip'];
const PHASES = ['planning', 'pantry', 'shopping', 'done'];

// Einkäufe ------------------------------------------------------------------

export function getShoppingWeekdays(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'shoppingWeekdays'").get();
  return row ? JSON.parse(row.value) : [3, 6];
}

export function suggestTrip(db, today = todayLocal()) {
  const coveredFroms = db.prepare('SELECT covers_from FROM shopping_trips').pluck().all();
  return suggestTripRange(today, getShoppingWeekdays(db), coveredFroms);
}

function toTrip(row) {
  return row && {
    id: row.id, date: row.date, coversFrom: row.covers_from, coversTo: row.covers_to, phase: row.phase,
    createdBy: row.created_by_name ?? null, createdAt: row.created_at,
  };
}

const SELECT_TRIP = `SELECT t.*, p.name AS created_by_name FROM shopping_trips t LEFT JOIN persons p ON p.id = t.created_by`;

export function getTrip(db, id) {
  return toTrip(db.prepare(`${SELECT_TRIP} WHERE t.id = ?`).get(id));
}

/** Aktueller Einkauf = jüngster, der noch nicht erledigt ist. */
export function getCurrentTrip(db) {
  return toTrip(db.prepare(`${SELECT_TRIP} WHERE t.phase != 'done' ORDER BY t.covers_from DESC, t.created_at DESC LIMIT 1`).get());
}

export function listTrips(db, limit = 20) {
  return db.prepare(`${SELECT_TRIP} ORDER BY t.covers_from DESC LIMIT ?`).all(limit).map(toTrip);
}

function validateRange({ date, coversFrom, coversTo }) {
  const errors = [];
  for (const [label, value] of [['Einkaufsdatum', date], ['Zeitraum von', coversFrom], ['Zeitraum bis', coversTo]]) {
    if (!DATE.test(value ?? '')) errors.push(`${label} fehlt oder ist ungültig`);
  }
  if (!errors.length && coversTo < coversFrom) errors.push('Zeitraum endet vor dem Beginn');
  if (errors.length) throw new ValidationError(errors);
}

/**
 * Neuer Einkauf: alle Gericht-Mahlzeiten im Zeitraum, die noch auf keiner Liste stehen, kommen drauf
 * (Bedarf wird eingefroren). Noch offene ältere Einkäufe werden dabei abgeschlossen.
 */
export function createTrip(db, input, personId = null) {
  const range = { ...suggestTrip(db), ...input };
  validateRange(range);
  return db.transaction(() => {
    db.prepare("UPDATE shopping_trips SET phase = 'done' WHERE phase != 'done'").run();
    const id = newId();
    const createdAt = now();
    db.prepare(`INSERT INTO shopping_trips (id, date, covers_from, covers_to, phase, created_by, created_at, snapshot)
                VALUES (?, ?, ?, ?, 'pantry', ?, ?, 1)`).run(id, range.date, range.coversFrom, range.coversTo, personId, createdAt);
    const trip = getTrip(db, id);
    commitMeals(db, trip, uncommittedMealIds(db, trip.coversFrom, trip.coversTo), createdAt);
    return trip;
  })();
}

function uncommittedMealIds(db, from, to) {
  return db.prepare(`SELECT m.id FROM meals m JOIN dishes d ON d.id = m.dish_id
                     WHERE m.kind = 'dish' AND d.kind != 'takeaway' AND m.trip_id IS NULL AND m.date BETWEEN ? AND ?`).pluck().all(from, to);
}

/** Mahlzeiten auf einen Einkauf setzen und ihren Bedarf (neu) einfrieren. */
function commitMeals(db, trip, mealIds, addedAt = now()) {
  if (!mealIds.length) return;
  const shelfLife = db.prepare('SELECT shelf_life_days FROM products WHERE id = ?').pluck();
  const insert = db.prepare(`INSERT INTO trip_sources (trip_id, meal_id, product_id, part, amount, unit, buy_from, date, slot_name, dish_name, via_dish, added_at)
                             VALUES (@tripId, @mealId, @productId, @part, @amount, @unit, @buyFrom, @date, @slotName, @dishName, @viaDish, @addedAt)`);
  for (const mealId of mealIds) {
    db.prepare('DELETE FROM trip_sources WHERE trip_id = ? AND meal_id = ?').run(trip.id, mealId);
    db.prepare('UPDATE meals SET trip_id = ? WHERE id = ?').run(trip.id, mealId);
    for (const source of collectNeeds(db, { mealIds: [mealId] })) {
      const days = shelfLife.get(source.productId);
      const buyFrom = days ? addDays(source.date, -days) : null;
      const part = buyFrom && buyFrom > trip.date ? 'later' : 'now';
      insert.run({ tripId: trip.id, ...source, viaDish: source.viaDish ?? null, part, buyFrom: part === 'later' ? buyFrom : null, addedAt });
    }
  }
}

/** Ältere Einkäufe ohne Momentaufnahme (vor Migration 002) einmalig einfrieren. */
function ensureSnapshot(db, trip) {
  if (db.prepare('SELECT snapshot FROM shopping_trips WHERE id = ?').pluck().get(trip.id)) return;
  db.transaction(() => {
    if (trip.phase !== 'done') commitMeals(db, trip, uncommittedMealIds(db, trip.coversFrom, trip.coversTo), trip.createdAt);
    db.prepare('UPDATE shopping_trips SET snapshot = 1 WHERE id = ?').run(trip.id);
  })();
}

/** Offener Einkauf, dessen Zeitraum ein Datum abdeckt (für neue Mahlzeiten). */
export function openTripForDate(db, date) {
  const trip = getCurrentTrip(db);
  return trip && date >= trip.coversFrom && date <= trip.coversTo ? trip : null;
}

/**
 * Nach dem Ändern einer Mahlzeit die Liste ausdrücklich anpassen:
 * steht sie auf einem offenen Einkauf → Bedarf neu einfrieren; neue Mahlzeit im Zeitraum → auf die Liste.
 * remove: Mahlzeit wird gelöscht → ihre Zutaten von der Liste nehmen.
 */
export function syncMealToTrip(db, mealId, { remove = false } = {}) {
  return db.transaction(() => {
    const meal = db.prepare(`SELECT m.id, m.date, m.kind, m.trip_id, d.kind AS dish_kind FROM meals m LEFT JOIN dishes d ON d.id = m.dish_id WHERE m.id = ?`).get(mealId);
    if (!meal) return null;
    const trip = meal.trip_id ? getTrip(db, meal.trip_id) : openTripForDate(db, meal.date);
    if (!trip || trip.phase === 'done') return null;
    const hasNeeds = meal.kind === 'dish' && meal.dish_kind !== 'takeaway';
    if (remove || !hasNeeds) {
      db.prepare('DELETE FROM trip_sources WHERE trip_id = ? AND meal_id = ?').run(trip.id, mealId);
      db.prepare('UPDATE meals SET trip_id = NULL WHERE id = ?').run(mealId);
      return trip;
    }
    commitMeals(db, trip, [mealId]);
    return trip;
  })();
}

class Rollback extends Error {}

/**
 * Vorschau für den Mahlzeit-Dialog: Welcher Einkauf ist betroffen und was würde sich an der Liste ändern
 * (z.B. „+200 g Hackleisch“)? Speichert nichts.
 */
export function previewMealSync(db, input, { id = null, remove = false, saveMeal } = {}) {
  let result = null;
  try {
    db.transaction(() => {
      const before = id ? db.prepare('SELECT trip_id, date FROM meals WHERE id = ?').get(id) : null;
      const committedTrip = before?.trip_id ? getTrip(db, before.trip_id) : null;
      const trip = committedTrip ?? openTripForDate(db, input.date ?? before?.date);
      if (!trip) { result = { trip: null, committed: false, delta: [] }; throw new Rollback(); }
      const describe = { id: trip.id, date: trip.date, coversFrom: trip.coversFrom, coversTo: trip.coversTo, phase: trip.phase };
      if (trip.phase === 'done') { result = { trip: describe, committed: !!committedTrip, done: true, delta: [] }; throw new Rollback(); }
      const old = id ? db.prepare('SELECT product_id AS productId, amount, unit FROM trip_sources WHERE trip_id = ? AND meal_id = ?').all(trip.id, id) : [];
      let fresh = [];
      if (!remove) {
        const saved = saveMeal(db, input, { id });
        fresh = saved.kind === 'dish' ? collectNeeds(db, { mealIds: [saved.id] }) : [];
      }
      result = { trip: describe, committed: !!committedTrip, delta: describeDelta(db, old, fresh) };
      throw new Rollback();
    })();
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return result;
}

function describeDelta(db, old, fresh) {
  const byProduct = new Map();
  const add = (list, sign) => {
    for (const s of list) {
      if (!byProduct.has(s.productId)) byProduct.set(s.productId, []);
      byProduct.get(s.productId).push({ amount: s.amount == null ? null : sign * s.amount, unit: s.unit, sign });
    }
  };
  add(old, -1);
  add(fresh, 1);
  const name = db.prepare('SELECT name FROM products WHERE id = ?').pluck();
  const delta = [];
  for (const [productId, entries] of byProduct) {
    // „nach Bedarf“-Zutaten: nur Hinzukommen/Wegfallen zählt
    const presence = entries.reduce((n, e) => n + e.sign, 0);
    const sums = sumAmounts(entries.filter(e => e.amount != null));
    const changed = sums.filter(s => Math.abs(s.amount) > 0.001);
    if (changed.length) {
      for (const s of changed) delta.push({ productId, name: name.get(productId), display: `${s.amount > 0 ? '+' : '−'}${formatAmount(Math.abs(s.amount), s.unit)}` });
    } else if (presence !== 0 && entries.every(e => e.amount == null)) {
      delta.push({ productId, name: name.get(productId), display: presence > 0 ? '+' : '−' });
    }
  }
  return delta;
}

/** Zeitraum/Phase ändern. Wird der Zeitraum erweitert, kommen dort noch nicht verplante Mahlzeiten (als „neu“) dazu. */
export function updateTrip(db, id, input) {
  const before = getTrip(db, id);
  if (!before) return null;
  const merged = { ...before, ...input };
  validateRange(merged);
  if (!PHASES.includes(merged.phase)) throw new ValidationError([`Phase „${merged.phase}“ unbekannt`]);
  return db.transaction(() => {
    db.prepare('UPDATE shopping_trips SET date = ?, covers_from = ?, covers_to = ?, phase = ? WHERE id = ?')
      .run(merged.date, merged.coversFrom, merged.coversTo, merged.phase, id);
    const trip = getTrip(db, id);
    const rangeChanged = before.coversFrom !== trip.coversFrom || before.coversTo !== trip.coversTo;
    if (rangeChanged && trip.phase !== 'done') commitMeals(db, trip, uncommittedMealIds(db, trip.coversFrom, trip.coversTo));
    return trip;
  })();
}

// Eingriffe -----------------------------------------------------------------

export function setTripItem(db, tripId, productId, part, input, personId = null) {
  if (!getTrip(db, tripId)) return null;
  if (!['now', 'later'].includes(part)) throw new ValidationError(['Teil muss now oder later sein']);
  if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(productId)) throw new ValidationError(['Produkt unbekannt']);
  const before = db.prepare('SELECT * FROM trip_items WHERE trip_id = ? AND product_id = ? AND part = ?').get(tripId, productId, part);
  const errors = [];
  const state = input.state ?? before?.state ?? 'open';
  if (!STATES.includes(state)) errors.push(`Zustand „${state}“ unbekannt`);
  let amount = 'amount' in input ? input.amount : before?.amount ?? null;
  let unit = 'unit' in input ? input.unit : before?.unit ?? null;
  if (amount != null) {
    amount = Number(amount);
    if (!(amount > 0)) errors.push('Menge muss größer als 0 sein');
    unit = normalizeUnit(unit);
    if (!unit) errors.push(`Einheit „${input.unit}“ unbekannt`);
  } else {
    unit = null;
  }
  const useFallback = 'useFallback' in input ? (input.useFallback ? 1 : 0) : before?.use_fallback ?? 0;
  if (errors.length) throw new ValidationError(errors);
  db.prepare(`INSERT INTO trip_items (trip_id, product_id, part, state, amount, unit, use_fallback, updated_by, updated_at)
              VALUES (@tripId, @productId, @part, @state, @amount, @unit, @useFallback, @personId, @at)
              ON CONFLICT (trip_id, product_id, part) DO UPDATE SET state = @state, amount = @amount, unit = @unit,
                use_fallback = @useFallback, updated_by = @personId, updated_at = @at`)
    .run({ tripId, productId, part, state, amount, unit, useFallback, personId, at: now() });
  return { productId, part, state, amount, unit, useFallback: !!useFallback };
}

// Freie Artikel ---------------------------------------------------------------

/**
 * Freier Artikel aus einer Zeile wie „2 Trone“. Passt der Name exakt zu einem Produkt,
 * wird er diesem zugeordnet (und zählt bei dessen Bedarf mit) – nie per Wortanfang (#3).
 * Ohne tripId und mit storeId landet er auf der Merkliste des Ladens.
 */
export function addFreeItem(db, { tripId = null, storeId = null, text, productId = null }, personId = null) {
  if (!tripId && !storeId) throw new ValidationError(['Einkauf oder Laden angeben']);
  if (tripId && !getTrip(db, tripId)) throw new ValidationError(['Einkauf unbekannt']);
  if (storeId && !db.prepare('SELECT 1 FROM stores WHERE id = ?').get(storeId)) throw new ValidationError(['Laden unbekannt']);
  if (!String(text ?? '').trim()) throw new ValidationError(['Text fehlt']);
  const parsed = parseIngredientLine(String(text));
  const product = productId
    ? db.prepare('SELECT id, name FROM products WHERE id = ?').get(productId)
    : db.prepare('SELECT id, name FROM products WHERE name = ?').get(parsed.productName);
  const id = newId();
  db.prepare(`INSERT INTO free_items (id, trip_id, store_id, product_id, text, amount, unit, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tripId, tripId ? null : storeId, product?.id ?? null, product?.name ?? parsed.productName,
      parsed.amount, parsed.amount == null ? null : parsed.unit, personId, now());
  return db.prepare('SELECT * FROM free_items WHERE id = ?').get(id);
}

export function updateFreeItem(db, id, input) {
  const item = db.prepare('SELECT * FROM free_items WHERE id = ?').get(id);
  if (!item) return null;
  const state = input.state ?? item.state;
  if (!STATES.includes(state)) throw new ValidationError([`Zustand „${state}“ unbekannt`]);
  const doneAt = state === 'open' ? null : (item.done_at ?? now());
  db.prepare('UPDATE free_items SET state = ?, done_at = ? WHERE id = ?').run(state, doneAt, id);
  return db.prepare('SELECT * FROM free_items WHERE id = ?').get(id);
}

export function deleteFreeItem(db, id) {
  return db.prepare('DELETE FROM free_items WHERE id = ?').run(id).changes > 0;
}

// Bedarf ----------------------------------------------------------------------

/**
 * Bedarf aus dem Plan: alle Gericht-Mahlzeiten im Zeitraum, Mengen pro Portion × Portionen.
 * Feste Bestandteile zählen immer (einmal), optionale Beilagen nur, wenn bei der Mahlzeit gewählt;
 * optionale Zutaten nach Auswahl der Mahlzeit bzw. ihrem Standard („normalerweise dabei“).
 * Ergebnis: Liste von Quellen { productId, amount, unit, mealId, date, slotName, dishName, viaDish }.
 */
export function collectNeeds(db, { from = null, to = null, mealIds = null } = {}) {
  const meals = db.prepare(`SELECT m.id, m.date, m.dish_id, m.servings, s.name AS slot_name, s.sort AS slot_sort, d.name AS dish_name
                            FROM meals m JOIN dishes d ON d.id = m.dish_id JOIN meal_slots s ON s.id = m.slot_id
                            WHERE m.kind = 'dish' AND d.kind != 'takeaway'
                              AND (@from IS NULL OR m.date >= @from) AND (@to IS NULL OR m.date <= @to)
                              AND (@ids IS NULL OR m.id IN (SELECT value FROM json_each(@ids)))
                            ORDER BY m.date, s.sort, m.sort`).all({ from, to, ids: mealIds ? JSON.stringify(mealIds) : null });
  const ingredientsOf = db.prepare('SELECT id, product_id, amount, unit, optional, default_on FROM dish_ingredients WHERE dish_id = ? ORDER BY sort');
  const componentsOf = db.prepare(`SELECT c.component_dish_id, c.factor, c.optional, d.name, d.kind
                                   FROM dish_components c JOIN dishes d ON d.id = c.component_dish_id WHERE c.dish_id = ? ORDER BY c.sort`);
  const chosenOf = db.prepare(`SELECT mc.component_dish_id, mc.factor, d.name, d.kind
                               FROM meal_components mc JOIN dishes d ON d.id = mc.component_dish_id WHERE mc.meal_id = ?`);
  const choicesOf = db.prepare('SELECT ingredient_id, included FROM meal_ingredient_choices WHERE meal_id = ?');

  const sources = [];
  for (const meal of meals) {
    const choices = new Map(choicesOf.all(meal.id).map(c => [c.ingredient_id, !!c.included]));
    const base = { mealId: meal.id, date: meal.date, slotName: meal.slot_name, dishName: meal.dish_name };

    const visit = (dishId, multiplier, viaDish, visited) => {
      if (visited.has(dishId)) return;
      const seen = new Set(visited).add(dishId);
      for (const ing of ingredientsOf.all(dishId)) {
        // optionale Zutaten: Auswahl der Mahlzeit, sonst Standard der Zutat
        if (ing.optional && !(choices.get(ing.id) ?? !!ing.default_on)) continue;
        sources.push({ ...base, viaDish, productId: ing.product_id, unit: ing.unit, amount: ing.amount == null ? null : ing.amount * multiplier });
      }
      for (const c of componentsOf.all(dishId)) {
        if (!c.optional && c.kind !== 'takeaway') visit(c.component_dish_id, multiplier * c.factor, c.name, seen);
      }
      return seen;
    };

    const visited = visit(meal.dish_id, meal.servings, null, new Set()) ?? new Set();
    const fixed = new Set(componentsOf.all(meal.dish_id).filter(c => !c.optional).map(c => c.component_dish_id));
    for (const chosen of chosenOf.all(meal.id)) {
      if (fixed.has(chosen.component_dish_id) || chosen.kind === 'takeaway') continue; // feste Bestandteile nicht doppelt
      visit(chosen.component_dish_id, meal.servings * chosen.factor, chosen.name, visited);
    }
  }
  return sources;
}

/**
 * Vollständige Einkaufsliste eines Einkaufs: eingefrorener Bedarf + Eingriffe + freie Artikel + Merkliste.
 * Pro Produkt eine Zeile (bzw. zwei, wenn ein Teil wegen Haltbarkeit erst später gekauft wird).
 */
export function buildTripList(db, trip) {
  ensureSnapshot(db, trip);
  const products = new Map(db.prepare(`
    SELECT p.id, p.name, p.unit, p.is_staple, p.shelf_life_days, p.section_id, p.group_id,
           g.name AS group_name, g.preferred_store_id, g.fallback_store_id, g.storage_location_id, g.sort AS group_sort,
           sl.name AS storage_name, sl.sort AS storage_sort
    FROM products p
    LEFT JOIN product_groups g ON g.id = p.group_id
    LEFT JOIN storage_locations sl ON sl.id = g.storage_location_id`).all().map(p => [p.id, p]));
  const stores = new Map(db.prepare('SELECT id, name, color, sort FROM stores').all().map(s => [s.id, s]));
  const sections = new Map(db.prepare('SELECT id, store_id, name, sort FROM store_sections').all().map(s => [s.id, s]));
  const sectionFor = db.prepare('SELECT section_id FROM section_groups WHERE store_id = ? AND group_id = ?').pluck();
  const interventions = new Map(db.prepare(`SELECT ti.*, p.name AS updated_by_name FROM trip_items ti
                                            LEFT JOIN persons p ON p.id = ti.updated_by WHERE ti.trip_id = ?`).all(trip.id)
    .map(ti => [`${ti.product_id}:${ti.part}`, ti]));

  const lines = new Map();
  const lineFor = (productId, part) => {
    const key = `${productId}:${part}`;
    if (!lines.has(key)) lines.set(key, { key, productId, part, sources: [], buyFrom: null });
    return lines.get(key);
  };

  // „neu“: nach dem Erstellen des Einkaufs hinzugekommen (mit etwas Toleranz)
  const newAfter = new Date(Date.parse(trip.createdAt) + 5000).toISOString();
  const frozen = db.prepare(`SELECT meal_id AS mealId, product_id AS productId, part, amount, unit, buy_from AS buyFrom, date,
                                    slot_name AS slotName, dish_name AS dishName, via_dish AS viaDish, added_at AS addedAt
                             FROM trip_sources WHERE trip_id = ? ORDER BY date, id`).all(trip.id);
  for (const source of frozen) {
    if (!products.has(source.productId)) continue;
    const line = lineFor(source.productId, source.part);
    line.sources.push({ type: 'meal', ...source, isNew: source.addedAt > newAfter });
    if (source.part === 'later' && (!line.buyFrom || source.buyFrom < line.buyFrom)) line.buyFrom = source.buyFrom;
  }

  const freeItems = db.prepare(`SELECT f.*, p.name AS created_by_name FROM free_items f
                                LEFT JOIN persons p ON p.id = f.created_by WHERE f.trip_id = ? ORDER BY f.created_at`).all(trip.id);
  const standalone = [];
  for (const f of freeItems) {
    if (f.product_id && products.has(f.product_id)) {
      lineFor(f.product_id, 'now').sources.push({
        type: 'manual', freeItemId: f.id, text: f.text, amount: f.amount, unit: f.unit ?? products.get(f.product_id).unit, by: f.created_by_name,
      });
    } else {
      standalone.push(toFreeItem(f));
    }
  }

  const items = [...lines.values()].map(line => {
    const product = products.get(line.productId);
    const ti = interventions.get(line.key);
    const useFallback = !!ti?.use_fallback && !!product.fallback_store_id && !product.section_id;
    let storeId = null, sectionId = null;
    if (product.section_id) {
      sectionId = product.section_id;
      storeId = sections.get(sectionId)?.store_id ?? null;
    } else if (product.group_id) {
      storeId = useFallback ? product.fallback_store_id : product.preferred_store_id;
      sectionId = storeId ? sectionFor.get(storeId, product.group_id) ?? null : null;
    }
    const store = stores.get(storeId);
    const section = sections.get(sectionId);
    const summed = sumAmounts(line.sources.map(s => ({ amount: s.amount, unit: s.unit })));
    // „nach Bedarf“ nur zeigen, wenn es gar keine bezifferte Menge gibt
    const needed = summed.some(n => n.amount != null) ? summed.filter(n => n.amount != null) : summed.slice(0, 1);
    const override = ti?.amount != null ? { amount: ti.amount, unit: ti.unit } : null;
    return {
      key: line.key,
      productId: line.productId,
      part: line.part,
      name: product.name,
      group: product.group_id ? { id: product.group_id, name: product.group_name, sort: product.group_sort } : null,
      storage: product.storage_location_id ? { id: product.storage_location_id, name: product.storage_name, sort: product.storage_sort } : null,
      isStaple: !!product.is_staple,
      store: store ? { id: store.id, name: store.name, color: store.color, sort: store.sort } : null,
      section: section ? { id: section.id, name: section.name, sort: section.sort } : null,
      hasFallback: !!product.fallback_store_id && !product.section_id,
      useFallback,
      needed,
      override,
      display: override ? formatAmount(override.amount, override.unit) : needed.map(n => formatAmount(n.amount, n.unit)).join(' + '),
      state: ti?.state ?? (product.is_staple ? 'have' : 'open'),
      updatedBy: ti?.updated_by_name ?? null,
      isNew: line.sources.some(s => s.isNew),
      buyFrom: line.buyFrom,
      sources: line.sources,
    };
  });

  const reminders = db.prepare(`SELECT f.*, p.name AS created_by_name FROM free_items f LEFT JOIN persons p ON p.id = f.created_by
                                WHERE f.trip_id IS NULL AND (f.state = 'open' OR f.done_at >= ?) ORDER BY f.created_at`)
    .all(trip.createdAt).map(toFreeItem);

  return { trip, items, freeItems: standalone, reminders };
}

export function toFreeItem(f) {
  return {
    id: f.id, tripId: f.trip_id, storeId: f.store_id, productId: f.product_id, text: f.text,
    amount: f.amount, unit: f.unit, display: f.amount == null ? '' : formatAmount(f.amount, f.unit ?? 'Stück'),
    state: f.state, createdBy: f.created_by_name ?? null, createdAt: f.created_at,
  };
}
