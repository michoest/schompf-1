import { newId, now } from '../db/index.js';
import { ValidationError } from './dishes.js';

const SELECT = `SELECT f.id, f.dish_id AS dishId, COALESCE(d.name, f.dish_name) AS dishName, p.name AS person, f.text,
                       f.status, f.resolution, f.created_at AS createdAt, f.resolved_at AS resolvedAt
                FROM feedback f LEFT JOIN dishes d ON d.id = f.dish_id LEFT JOIN persons p ON p.id = f.person_id`;

/** Anmerkung zu einem Gericht (dishId) oder allgemein (ohne dishId). */
export function addFeedback(db, { dishId = null, text }, personId = null) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new ValidationError(['Text fehlt']);
  const dish = dishId ? db.prepare('SELECT id, name FROM dishes WHERE id = ?').get(dishId) : null;
  if (dishId && !dish) throw new ValidationError(['Gericht unbekannt']);
  const id = newId();
  db.prepare('INSERT INTO feedback (id, dish_id, dish_name, person_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, dish?.id ?? null, dish?.name ?? null, personId, trimmed, now());
  return getFeedback(db, id);
}

export function getFeedback(db, id) {
  return db.prepare(`${SELECT} WHERE f.id = ? OR f.id LIKE ?`).get(id, `${id}%`) ?? null;
}

export function listFeedback(db, { status = null, dishId = null } = {}) {
  return db.prepare(`${SELECT} WHERE (@status IS NULL OR f.status = @status) AND (@dishId IS NULL OR f.dish_id = @dishId)
                     ORDER BY f.created_at DESC`).all({ status, dishId });
}

/** Erledigt (mit Notiz, was geändert wurde) oder wieder offen. Akzeptiert auch ID-Präfixe. */
export function resolveFeedback(db, id, { status = 'done', resolution = null } = {}) {
  const item = getFeedback(db, id);
  if (!item) return null;
  if (!['open', 'done'].includes(status)) throw new ValidationError([`Status „${status}“ unbekannt`]);
  db.prepare('UPDATE feedback SET status = ?, resolution = ?, resolved_at = ? WHERE id = ?')
    .run(status, status === 'done' ? (resolution ?? item.resolution) : null, status === 'done' ? now() : null, item.id);
  return getFeedback(db, item.id);
}
