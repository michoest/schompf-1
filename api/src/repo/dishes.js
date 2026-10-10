import { newId, now } from '../db/index.js';
import { normalizeUnit, formatAmount } from '../domain/units.js';

export class ValidationError extends Error {
  constructor(messages) {
    super(messages.join('; '));
    this.messages = messages;
  }
}

const KINDS = ['cook', 'buy', 'takeaway'];
const STATUSES = ['active', 'draft'];

/**
 * Gericht als vollständiges Dokument laden (per ID oder Name).
 * Form: { id, name, kind, status, servings, sourceUrl, takeawayWhere, recipe, categories,
 *         ingredients[], components[], preparations[], createdAt, updatedAt }
 */
export function getDish(db, idOrName) {
  const row = db.prepare('SELECT * FROM dishes WHERE id = ? OR name = ?').get(idOrName, idOrName);
  return row ? toDocument(db, row) : null;
}

export function listDishes(db) {
  return db.prepare('SELECT * FROM dishes ORDER BY name COLLATE NOCASE').all().map(row => toDocument(db, row));
}

function toDocument(db, row) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    servings: row.servings,
    sourceUrl: row.source_url,
    takeawayWhere: row.takeaway_where,
    recipe: row.recipe,
    categories: db.prepare('SELECT category FROM dish_categories WHERE dish_id = ? ORDER BY category').all(row.id).map(r => r.category),
    ingredients: db.prepare(`SELECT i.id, i.product_id, p.name AS product_name, i.amount, i.unit, i.optional
                             FROM dish_ingredients i JOIN products p ON p.id = i.product_id
                             WHERE i.dish_id = ? ORDER BY i.sort`).all(row.id)
      .map(i => ({ id: i.id, productId: i.product_id, productName: i.product_name, amount: i.amount, unit: i.unit, optional: !!i.optional })),
    components: db.prepare(`SELECT c.component_dish_id, d.name, c.factor, c.optional
                            FROM dish_components c JOIN dishes d ON d.id = c.component_dish_id
                            WHERE c.dish_id = ? ORDER BY c.sort`).all(row.id)
      .map(c => ({ dishId: c.component_dish_id, dishName: c.name, factor: c.factor, optional: !!c.optional })),
    preparations: db.prepare('SELECT text, lead_hours FROM dish_preparations WHERE dish_id = ? ORDER BY sort').all(row.id)
      .map(p => ({ text: p.text, leadHours: p.lead_hours })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Gericht anlegen oder ersetzen. Zutaten/Beilagen dürfen per ID oder Name auf
 * Produkte/Gerichte verweisen. Bestehende Zutaten behalten ihre ID, wenn das Produkt
 * gleich bleibt (damit weggelassene optionale Zutaten in Mahlzeiten erhalten bleiben).
 * Jede Änderung wird mit Zusammenfassung in dish_changes protokolliert.
 *
 * ctx: { source: 'app'|'import'|'claude', personId?, createProducts?: boolean }
 */
export function saveDish(db, input, ctx = {}) {
  return db.transaction(() => {
    const before = input.id ? getDish(db, input.id) : (input.name ? getDish(db, input.name) : null);
    const doc = validate(db, input, before, ctx);
    const id = before?.id ?? input.id ?? newId();
    const timestamp = now();

    if (before) {
      db.prepare(`UPDATE dishes SET name=@name, kind=@kind, status=@status, servings=@servings, source_url=@sourceUrl,
                  takeaway_where=@takeawayWhere, recipe=@recipe, updated_at=@updatedAt WHERE id=@id`)
        .run({ ...doc, id, updatedAt: timestamp });
    } else {
      db.prepare(`INSERT INTO dishes (id, name, kind, status, servings, source_url, takeaway_where, recipe, created_at, updated_at)
                  VALUES (@id, @name, @kind, @status, @servings, @sourceUrl, @takeawayWhere, @recipe, @at, @at)`)
        .run({ ...doc, id, at: timestamp });
    }

    db.prepare('DELETE FROM dish_categories WHERE dish_id = ?').run(id);
    for (const category of doc.categories) {
      db.prepare('INSERT INTO dish_categories (dish_id, category) VALUES (?, ?)').run(id, category);
    }

    // Zutaten: IDs pro Produkt wiederverwenden, Rest löschen
    const reusable = new Map((before?.ingredients ?? []).map(i => [i.productId, i.id]));
    const kept = new Set();
    doc.ingredients.forEach((ing, sort) => {
      let ingId = reusable.get(ing.productId);
      if (ingId && !kept.has(ingId)) {
        db.prepare('UPDATE dish_ingredients SET amount=?, unit=?, optional=?, sort=? WHERE id=?')
          .run(ing.amount, ing.unit, ing.optional ? 1 : 0, sort, ingId);
      } else {
        ingId = newId();
        db.prepare('INSERT INTO dish_ingredients (id, dish_id, product_id, amount, unit, optional, sort) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(ingId, id, ing.productId, ing.amount, ing.unit, ing.optional ? 1 : 0, sort);
      }
      kept.add(ingId);
    });
    for (const old of before?.ingredients ?? []) {
      if (!kept.has(old.id)) db.prepare('DELETE FROM dish_ingredients WHERE id = ?').run(old.id);
    }

    db.prepare('DELETE FROM dish_components WHERE dish_id = ?').run(id);
    doc.components.forEach((c, sort) => {
      db.prepare('INSERT INTO dish_components (id, dish_id, component_dish_id, factor, optional, sort) VALUES (?, ?, ?, ?, ?, ?)')
        .run(newId(), id, c.dishId, c.factor, c.optional ? 1 : 0, sort);
    });

    db.prepare('DELETE FROM dish_preparations WHERE dish_id = ?').run(id);
    doc.preparations.forEach((p, sort) => {
      db.prepare('INSERT INTO dish_preparations (id, dish_id, text, lead_hours, sort) VALUES (?, ?, ?, ?, ?)')
        .run(newId(), id, p.text, p.leadHours, sort);
    });

    const after = getDish(db, id);
    const summary = before ? describeChanges(before, after) : 'Angelegt';
    if (summary) {
      db.prepare('INSERT INTO dish_changes (dish_id, at, person_id, source, summary) VALUES (?, ?, ?, ?, ?)')
        .run(id, timestamp, ctx.personId ?? null, ctx.source ?? 'app', summary);
    }
    return { dish: after, summary };
  })();
}

export function deleteDish(db, id) {
  const used = db.prepare('SELECT COUNT(*) n FROM meals WHERE dish_id = ?').get(id).n;
  const asComponent = db.prepare('SELECT COUNT(*) n FROM dish_components WHERE component_dish_id = ?').get(id).n;
  if (used || asComponent) {
    throw new ValidationError([`Gericht wird noch verwendet (${used} Mahlzeiten, ${asComponent}× als Beilage) – stattdessen auf Entwurf setzen`]);
  }
  return db.prepare('DELETE FROM dishes WHERE id = ?').run(id).changes > 0;
}

export function getDishChanges(db, id) {
  return db.prepare(`SELECT c.at, c.source, c.summary, p.name AS person FROM dish_changes c
                     LEFT JOIN persons p ON p.id = c.person_id WHERE c.dish_id = ? ORDER BY c.id DESC`).all(id);
}

function validate(db, input, before, ctx) {
  const errors = [];
  const name = String(input.name ?? before?.name ?? '').trim();
  if (!name) errors.push('Name fehlt');
  const clash = name && db.prepare('SELECT id FROM dishes WHERE name = ?').get(name);
  if (clash && clash.id !== before?.id) errors.push(`Es gibt schon ein Gericht „${name}“`);

  const kind = input.kind ?? before?.kind ?? 'cook';
  if (!KINDS.includes(kind)) errors.push(`Unbekannte Art „${kind}“`);
  const status = input.status ?? before?.status ?? 'active';
  if (!STATUSES.includes(status)) errors.push(`Unbekannter Status „${status}“`);
  const servings = Number(input.servings ?? before?.servings ?? 2);
  if (!(servings > 0)) errors.push('Portionen müssen größer als 0 sein');

  const ingredients = (input.ingredients ?? before?.ingredients ?? []).map((ing, i) => {
    const product = resolveProduct(db, ing, ctx);
    if (!product) { errors.push(`Zutat ${i + 1}: Produkt „${ing.productName ?? ing.productId}“ unbekannt`); return null; }
    const unit = normalizeUnit(ing.unit ?? product.unit);
    if (!unit) errors.push(`Zutat „${product.name}“: Einheit „${ing.unit}“ unbekannt`);
    const amount = ing.amount == null || ing.amount === '' ? null : Number(ing.amount);
    if (amount != null && !(amount > 0)) errors.push(`Zutat „${product.name}“: Menge „${ing.amount}“ ungültig`);
    return { productId: product.id, amount, unit, optional: !!ing.optional };
  }).filter(Boolean);
  if (kind === 'takeaway' && ingredients.length) errors.push('Holen-Gerichte haben keine Zutaten');
  const products = ingredients.map(i => i.productId);
  if (new Set(products).size !== products.length) errors.push('Ein Produkt steht mehrfach in den Zutaten');

  const components = (input.components ?? before?.components ?? []).map(c => {
    const dish = db.prepare('SELECT id, name FROM dishes WHERE id = ? OR name = ?').get(c.dishId ?? null, c.dishName ?? null);
    if (!dish) { errors.push(`Beilage „${c.dishName ?? c.dishId}“ unbekannt`); return null; }
    if (dish.id === before?.id) { errors.push('Ein Gericht kann nicht seine eigene Beilage sein'); return null; }
    const factor = Number(c.factor ?? 1);
    if (!(factor > 0)) errors.push(`Beilage „${dish.name}“: Faktor ungültig`);
    return { dishId: dish.id, factor, optional: !!c.optional };
  }).filter(Boolean);

  const preparations = (input.preparations ?? before?.preparations ?? []).map(p => {
    const leadHours = Number(p.leadHours);
    if (!String(p.text ?? '').trim() || !(leadHours > 0)) errors.push(`Vorbereitung „${p.text}“: Text und Vorlauf nötig`);
    return { text: String(p.text ?? '').trim(), leadHours };
  });

  if (errors.length) throw new ValidationError(errors);
  return {
    name, kind, status, servings,
    sourceUrl: pick(input, before, 'sourceUrl'),
    takeawayWhere: pick(input, before, 'takeawayWhere'),
    recipe: pick(input, before, 'recipe'),
    categories: [...new Set((input.categories ?? before?.categories ?? []).map(c => String(c).trim()).filter(Boolean))],
    ingredients, components, preparations,
  };
}

function pick(input, before, field) {
  const value = field in input ? input[field] : before?.[field];
  return value == null || String(value).trim() === '' ? null : String(value).trim();
}

function resolveProduct(db, ing, ctx) {
  if (ing.productId) {
    const byId = db.prepare('SELECT id, name, unit FROM products WHERE id = ?').get(ing.productId);
    if (byId) return byId;
  }
  const name = String(ing.productName ?? '').trim();
  if (!name) return null;
  const byName = db.prepare('SELECT id, name, unit FROM products WHERE name = ?').get(name);
  if (byName || !ctx.createProducts) return byName ?? null;
  const id = newId();
  const unit = normalizeUnit(ing.unit) ?? 'Stück';
  db.prepare('INSERT INTO products (id, name, unit, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, name, unit, now(), now());
  return { id, name, unit };
}

/** Menschlich lesbare Zusammenfassung, z.B. „Reis: 250 g → 200 g; + Silie“. */
export function describeChanges(before, after) {
  const parts = [];
  const fields = [['name', 'Name'], ['kind', 'Art'], ['status', 'Status'], ['servings', 'Portionen'], ['sourceUrl', 'Quelle'], ['takeawayWhere', 'Wo']];
  for (const [field, label] of fields) {
    if ((before[field] ?? null) !== (after[field] ?? null)) parts.push(`${label}: ${before[field] ?? '–'} → ${after[field] ?? '–'}`);
  }
  if ((before.recipe ?? '') !== (after.recipe ?? '')) parts.push('Rezept geändert');
  if (before.categories.join() !== after.categories.join()) parts.push(`Kategorien: ${after.categories.join(', ') || '–'}`);

  const show = i => `${formatAmount(i.amount, i.unit)}${i.optional ? ' (optional)' : ''}`;
  const oldIngredients = new Map(before.ingredients.map(i => [i.productId, i]));
  for (const ing of after.ingredients) {
    const old = oldIngredients.get(ing.productId);
    if (!old) parts.push(`+ ${ing.productName} (${show(ing)})`);
    else if (show(old) !== show(ing)) parts.push(`${ing.productName}: ${show(old)} → ${show(ing)}`);
    oldIngredients.delete(ing.productId);
  }
  for (const old of oldIngredients.values()) parts.push(`− ${old.productName}`);

  const describeComponents = list => list.map(c => `${c.dishName}×${c.factor}${c.optional ? '?' : ''}`).join(', ');
  if (describeComponents(before.components) !== describeComponents(after.components)) parts.push(`Beilagen: ${describeComponents(after.components) || '–'}`);
  const describePreps = list => list.map(p => `${p.leadHours}h ${p.text}`).join(' | ');
  if (describePreps(before.preparations) !== describePreps(after.preparations)) parts.push('Vorbereitungen geändert');
  return parts.join('; ');
}
