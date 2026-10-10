import { formatIngredientLine } from './dishFile.js';
import { formatNumber } from './units.js';

const KIND = { cook: 'kochen', buy: 'fertig', takeaway: 'holen' };
const STATUS = { active: 'aktiv', draft: 'entwurf' };

/**
 * Übersicht aller Gerichte als Tabelle (CSV mit Semikolon und BOM, öffnet direkt in Numbers/Excel).
 * Gedacht zum Durchsehen, was angepasst werden soll – nicht zum Zurückimportieren.
 */
export function dishOverviewCsv(db, dishes) {
  const stats = new Map(db.prepare(`SELECT dish_id, COUNT(*) AS planned, SUM(status = 'prepared') AS prepared, MAX(date) AS last
                                    FROM meals WHERE kind = 'dish' AND date <= date('now') GROUP BY dish_id`).all()
    .map(r => [r.dish_id, r]));
  const header = ['Name', 'Art', 'Status', 'Portionen', 'Kategorien', 'Zutaten', 'Bestandteile', 'Beilagen',
    'Vorbereitungen', 'Rezept', 'Quelle', 'Gegessen', 'Zuletzt'];
  const rows = dishes.map(d => {
    const s = stats.get(d.id);
    return [
      d.name, KIND[d.kind], STATUS[d.status], formatNumber(d.servings), d.categories.join(', '),
      d.ingredients.map(formatIngredientLine).join('\n'),
      d.components.filter(c => !c.optional).map(c => `${c.dishName} × ${formatNumber(c.factor)}`).join('\n'),
      d.components.filter(c => c.optional).map(c => `${c.dishName} × ${formatNumber(c.factor)}`).join('\n'),
      d.preparations.map(p => `${p.text} (${formatNumber(p.leadHours)} h vorher)`).join('\n'),
      d.recipe ? `ja (${d.recipe.length} Zeichen)` : (d.kind === 'cook' ? 'FEHLT' : ''),
      d.sourceUrl ?? '',
      s?.planned ?? 0,
      s?.last ?? '',
    ];
  });
  return '﻿' + [header, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
