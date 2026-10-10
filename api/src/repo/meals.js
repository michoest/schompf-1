import { newId, now } from '../db/index.js';
import { ValidationError } from './dishes.js';

const KINDS = ['dish', 'leftovers', 'text'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const SELECT = `SELECT m.id, m.date, m.slot_id AS slotId, m.sort, m.kind, m.dish_id AS dishId, d.name AS dishName,
                       d.kind AS dishKind, m.servings, m.text, m.status, p.name AS createdBy,
                       m.created_at AS createdAt, m.updated_at AS updatedAt
                FROM meals m
                LEFT JOIN dishes d ON d.id = m.dish_id
                LEFT JOIN meal_slots s ON s.id = m.slot_id
                LEFT JOIN persons p ON p.id = m.created_by`;

function withDetails(db, meals) {
  const components = db.prepare(`SELECT mc.component_dish_id AS dishId, d.name AS dishName, mc.factor
                                  FROM meal_components mc JOIN dishes d ON d.id = mc.component_dish_id WHERE mc.meal_id = ?`);
  const choices = db.prepare('SELECT ingredient_id AS ingredientId, included FROM meal_ingredient_choices WHERE meal_id = ?');
  return meals.map(m => ({
    ...m,
    components: components.all(m.id),
    ingredientChoices: choices.all(m.id).map(c => ({ ingredientId: c.ingredientId, included: !!c.included })),
  }));
}

export function listMeals(db, { from, to } = {}) {
  const rows = db.prepare(`${SELECT} WHERE (@from IS NULL OR m.date >= @from) AND (@to IS NULL OR m.date <= @to)
                           ORDER BY m.date, s.sort, m.sort`).all({ from: from ?? null, to: to ?? null });
  return withDetails(db, rows);
}

export function getMeal(db, id) {
  const row = db.prepare(`${SELECT} WHERE m.id = ?`).get(id);
  return row ? withDetails(db, [row])[0] : null;
}

/**
 * Mahlzeit anlegen oder ändern. Bei Änderungen dürfen einzelne Felder fehlen.
 * Beilagen kommen als [{ dishId, factor }], die Auswahl optionaler Zutaten als [{ ingredientId, included }]
 * (gespeichert wird nur, was vom Standard der Zutat abweicht).
 */
export function saveMeal(db, input, { id = null, personId = null } = {}) {
  return db.transaction(() => {
    const before = id ? getMeal(db, id) : null;
    if (id && !before) return null;
    const merged = { ...before, ...input };
    const errors = [];

    if (!DATE.test(merged.date ?? '')) errors.push('Datum fehlt oder ist ungültig');
    if (!db.prepare('SELECT 1 FROM meal_slots WHERE id = ?').get(merged.slotId ?? '')) errors.push('Mahlzeit-Slot unbekannt');
    if (!KINDS.includes(merged.kind)) errors.push(`Art „${merged.kind}“ unbekannt`);
    const text = merged.text == null || String(merged.text).trim() === '' ? null : String(merged.text).trim();
    let dishId = null, servings = null;
    if (merged.kind === 'dish') {
      const dish = db.prepare('SELECT id, servings FROM dishes WHERE id = ?').get(merged.dishId ?? '');
      if (!dish) errors.push('Gericht unbekannt');
      dishId = dish?.id ?? null;
      servings = Number(merged.servings ?? dish?.servings ?? 2);
      if (!(servings > 0)) errors.push('Portionen müssen größer als 0 sein');
    }
    if (merged.kind === 'text' && !text) errors.push('Text fehlt');
    const status = merged.status ?? 'planned';
    if (!['planned', 'prepared'].includes(status)) errors.push(`Status „${status}“ unbekannt`);

    const components = merged.kind === 'dish' ? (merged.components ?? []) : [];
    for (const c of components) {
      if (!db.prepare('SELECT 1 FROM dishes WHERE id = ?').get(c.dishId)) errors.push('Beilage unbekannt');
    }
    const choices = [];
    if (merged.kind === 'dish') {
      const requested = merged.ingredientChoices
        ?? (merged.excludedIngredientIds ?? []).map(ingredientId => ({ ingredientId, included: false }));
      for (const choice of requested) {
        const ing = db.prepare('SELECT optional, default_on FROM dish_ingredients WHERE id = ?').get(choice.ingredientId);
        if (!ing) { errors.push('Zutat in der Auswahl unbekannt'); continue; }
        if (!ing.optional) continue;
        if (!!choice.included !== !!ing.default_on) choices.push({ ingredientId: choice.ingredientId, included: choice.included ? 1 : 0 });
      }
    }
    if (errors.length) throw new ValidationError(errors);

    const row = {
      id: id ?? newId(), date: merged.date, slotId: merged.slotId, kind: merged.kind, dishId, servings,
      text: merged.kind === 'dish' ? null : text, status, at: now(),
      sort: before && before.date === merged.date && before.slotId === merged.slotId
        ? before.sort
        : db.prepare('SELECT COALESCE(MAX(sort) + 1, 0) n FROM meals WHERE date = ? AND slot_id = ?').get(merged.date, merged.slotId).n,
    };
    if (before) {
      db.prepare(`UPDATE meals SET date=@date, slot_id=@slotId, sort=@sort, kind=@kind, dish_id=@dishId, servings=@servings,
                  text=@text, status=@status, updated_at=@at WHERE id=@id`).run(row);
    } else {
      db.prepare(`INSERT INTO meals (id, date, slot_id, sort, kind, dish_id, servings, text, status, created_by, created_at, updated_at)
                  VALUES (@id, @date, @slotId, @sort, @kind, @dishId, @servings, @text, @status, @personId, @at, @at)`)
        .run({ ...row, personId });
    }
    db.prepare('DELETE FROM meal_components WHERE meal_id = ?').run(row.id);
    for (const c of components) {
      db.prepare('INSERT OR REPLACE INTO meal_components (meal_id, component_dish_id, factor) VALUES (?, ?, ?)').run(row.id, c.dishId, Number(c.factor ?? 1));
    }
    db.prepare('DELETE FROM meal_ingredient_choices WHERE meal_id = ?').run(row.id);
    for (const c of choices) {
      db.prepare('INSERT OR REPLACE INTO meal_ingredient_choices (meal_id, ingredient_id, included) VALUES (?, ?, ?)').run(row.id, c.ingredientId, c.included);
    }
    return getMeal(db, row.id);
  })();
}

export function deleteMeal(db, id) {
  return db.prepare('DELETE FROM meals WHERE id = ?').run(id).changes > 0;
}
