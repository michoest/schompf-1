/**
 * Gericht ↔ lesbare Datei (Markdown mit YAML-Kopf), zum Bearbeiten außerhalb der App.
 *
 *   ---
 *   name: Ghetti Nese
 *   art: kochen            # kochen | fertig | holen
 *   status: aktiv          # aktiv | entwurf
 *   portionen: 2
 *   kategorien: [Dels]
 *   zutaten:
 *     - 125 g Ghetti
 *     - 1 Nesepäckchen
 *     - Salz                 # ohne Menge = nach Bedarf
 *     - 50 g Mesan (optional)
 *   bestandteile:
 *     - Meladenrot mit Ei × 0,5
 *   beilagen:
 *     - Toffellat × 0,5
 *   vorbereitungen:
 *     - Kichererbsen einweichen (12 h vorher)
 *   ---
 *   1. Wasser aufsetzen …
 */
import YAML from 'yaml';
import { normalizeUnit, getUnit, formatNumber } from './units.js';

const KIND_TO_FILE = { cook: 'kochen', buy: 'fertig', takeaway: 'holen' };
const KIND_FROM_FILE = Object.fromEntries(Object.entries(KIND_TO_FILE).map(([k, v]) => [v, k]));
const STATUS_TO_FILE = { active: 'aktiv', draft: 'entwurf' };
const STATUS_FROM_FILE = Object.fromEntries(Object.entries(STATUS_TO_FILE).map(([k, v]) => [v, k]));

export function dishToFile(dish) {
  const head = {
    name: dish.name,
    art: KIND_TO_FILE[dish.kind],
    status: STATUS_TO_FILE[dish.status],
    portionen: dish.servings,
  };
  if (dish.categories.length) head.kategorien = dish.categories;
  if (dish.sourceUrl) head.quelle = dish.sourceUrl;
  if (dish.takeawayWhere) head.wo = dish.takeawayWhere;
  if (dish.ingredients.length) head.zutaten = dish.ingredients.map(formatIngredientLine);
  const fixed = dish.components.filter(c => !c.optional);
  const optional = dish.components.filter(c => c.optional);
  if (fixed.length) head.bestandteile = fixed.map(formatComponentLine);
  if (optional.length) head.beilagen = optional.map(formatComponentLine);
  if (dish.preparations.length) head.vorbereitungen = dish.preparations.map(p => `${p.text} (${formatNumber(p.leadHours)} h vorher)`);

  const yaml = YAML.stringify(head, { lineWidth: 0 });
  return `---\n${yaml}---\n${dish.recipe ? `${dish.recipe.trim()}\n` : ''}`;
}

export function fileToDish(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) throw new Error('Datei beginnt nicht mit einem ---Kopf---');
  const head = YAML.parse(match[1]) ?? {};
  const errors = [];

  const kind = head.art == null ? undefined : KIND_FROM_FILE[String(head.art).toLowerCase()];
  if (head.art != null && !kind) errors.push(`art: „${head.art}“ (erlaubt: kochen, fertig, holen)`);
  const status = head.status == null ? undefined : STATUS_FROM_FILE[String(head.status).toLowerCase()];
  if (head.status != null && !status) errors.push(`status: „${head.status}“ (erlaubt: aktiv, entwurf)`);

  const lines = key => (head[key] ?? []).map(String);
  const ingredients = lines('zutaten').map(line => {
    try { return parseIngredientLine(line); } catch (e) { errors.push(e.message); return null; }
  }).filter(Boolean);
  const components = [
    ...lines('bestandteile').map(l => ({ ...parseComponentLine(l), optional: false })),
    ...lines('beilagen').map(l => ({ ...parseComponentLine(l), optional: true })),
  ];
  const preparations = (head.vorbereitungen ?? []).map(item => {
    // „Text (12 h vorher)“ – oder „12 h vorher: Text“, das YAML ohne Anführungszeichen als Objekt liest
    const line = typeof item === 'object' && item ? Object.entries(item).map(([k, v]) => `${k}: ${v}`).join('') : String(item);
    const trailing = /^(.+?)\s*\((\d+(?:[.,]\d+)?)\s*h(?:\s+vorher)?\)\s*$/i.exec(line.trim());
    const leading = /^(\d+(?:[.,]\d+)?)\s*h(?:\s+vorher)?\s*:\s*(.+)$/i.exec(line.trim());
    if (trailing) return { text: trailing[1].trim(), leadHours: parseNumber(trailing[2]) };
    if (leading) return { text: leading[2].trim(), leadHours: parseNumber(leading[1]) };
    errors.push(`vorbereitungen: „${line}“ (Format: „Text (12 h vorher)“)`);
    return null;
  }).filter(Boolean);

  if (errors.length) throw new Error(errors.join('\n'));
  const recipe = match[2].trim();
  return {
    name: head.name != null ? String(head.name).trim() : undefined,
    kind, status,
    servings: head.portionen,
    categories: (head.kategorien ?? []).map(String),
    sourceUrl: head.quelle ?? null,
    takeawayWhere: head.wo ?? null,
    recipe: recipe || null,
    ingredients, components, preparations,
  };
}

/** „125 g Ghetti“, „2 Zehen Blauch“, „Salz“, „1/2 Bund Silie (optional)“ */
export function parseIngredientLine(line) {
  let rest = line.trim();
  let optional = false;
  const opt = /\s*\(optional\)\s*$/i.exec(rest);
  if (opt) { optional = true; rest = rest.slice(0, opt.index).trim(); }

  let amount = null;
  let unit = 'Stück';
  const num = /^(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)\s+(.*)$/.exec(rest);
  if (num) {
    amount = parseNumber(num[1]);
    rest = num[2];
    const [first, ...others] = rest.split(/\s+/);
    const asUnit = normalizeUnit(first);
    if (asUnit && others.length) { unit = asUnit; rest = others.join(' '); }
  }
  if (!rest) throw new Error(`zutaten: „${line}“ – Produkt fehlt`);
  return { productName: rest, amount, unit, optional };
}

export function formatIngredientLine(ing) {
  const optional = ing.optional ? ' (optional)' : '';
  if (ing.amount == null) return `${ing.productName}${optional}`;
  const unit = getUnit(ing.unit);
  let unitText = '';
  if (ing.unit !== 'Stück') unitText = ` ${ing.amount === 1 ? unit?.singular ?? ing.unit : unit?.plural ?? ing.unit}`;
  // Produktname, der selbst wie eine Einheit beginnt, braucht ein explizites „Stück“
  else if (normalizeUnit(ing.productName.split(/\s+/)[0]) && ing.productName.includes(' ')) unitText = ' Stück';
  return `${formatNumber(ing.amount)}${unitText} ${ing.productName}${optional}`;
}

function formatComponentLine(c) {
  return `${c.dishName} × ${formatNumber(c.factor)}`;
}

function parseComponentLine(line) {
  const m = /^(.*?)\s+[×x]\s*(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s*$/.exec(line.trim());
  return m ? { dishName: m[1].trim(), factor: parseNumber(m[2]) } : { dishName: line.trim(), factor: 1 };
}

function parseNumber(text) {
  const t = String(text).replace(/\s/g, '');
  if (t.includes('/')) {
    const [a, b] = t.split('/').map(Number);
    return a / b;
  }
  return parseFloat(t.replace(',', '.'));
}
