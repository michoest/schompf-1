/**
 * Feste Einheitenliste. Gespeichert wird immer der `code`; Einzahl/Mehrzahl und
 * Schatzisch-Schreibweisen sind Aliase. Gewicht und Volumen werden umgerechnet,
 * alle anderen Einheiten werden nur mit sich selbst addiert.
 */
export const UNITS = [
  { code: 'g', singular: 'g', plural: 'g', base: 'g', factor: 1, aliases: ['gramm'] },
  { code: 'kg', singular: 'kg', plural: 'kg', base: 'g', factor: 1000, aliases: ['kilogramm', 'kilo'] },
  { code: 'ml', singular: 'ml', plural: 'ml', base: 'ml', factor: 1, aliases: ['milliliter'] },
  { code: 'l', singular: 'l', plural: 'l', base: 'ml', factor: 1000, aliases: ['liter'] },
  { code: 'Stück', singular: 'Stück', plural: 'Stück', aliases: ['', 'stk', 'st', 'stücks'] },
  { code: 'EL', singular: 'EL', plural: 'EL', aliases: ['esslöffel'] },
  { code: 'TL', singular: 'TL', plural: 'TL', aliases: ['teelöffel'] },
  { code: 'Zehe', singular: 'Zehe', plural: 'Zehen', aliases: [] },
  { code: 'Packung', singular: 'Packung', plural: 'Packungen', aliases: ['packungs', 'pck', 'pkg'] },
  { code: 'Bund', singular: 'Bund', plural: 'Bund', aliases: ['bunds'] },
  { code: 'Scheibe', singular: 'Scheibe', plural: 'Scheiben', aliases: ['scheibs'] },
  { code: 'Zweig', singular: 'Zweig', plural: 'Zweige', aliases: ['weig', 'weigs'] },
  { code: 'Stiel', singular: 'Stiel', plural: 'Stiele', aliases: ['tiel', 'tiele'] },
  { code: 'Stängel', singular: 'Stängel', plural: 'Stängel', aliases: ['tängel'] },
  { code: 'Prise', singular: 'Prise', plural: 'Prisen', aliases: ['rise'] },
  { code: 'Glas', singular: 'Glas', plural: 'Gläser', aliases: ['las'] },
  { code: 'Tube', singular: 'Tube', plural: 'Tuben', aliases: ['tubs'] },
  { code: 'Dose', singular: 'Dose', plural: 'Dosen', aliases: ['dosen'] },
  { code: 'Becher', singular: 'Becher', plural: 'Becher', aliases: [] },
  { code: 'Paar', singular: 'Paar', plural: 'Paar', aliases: [] },
  { code: 'cm', singular: 'cm', plural: 'cm', aliases: [] },
  { code: 'Kästchen', singular: 'Kästchen', plural: 'Kästchen', aliases: [] },
  { code: 'Rolle', singular: 'Rolle', plural: 'Rollen', aliases: [] },
  { code: 'Kugel', singular: 'Kugel', plural: 'Kugeln', aliases: [] },
  { code: 'Schuss', singular: 'Schuss', plural: 'Schuss', aliases: [] },
];

const BY_CODE = new Map(UNITS.map(u => [u.code, u]));
const LOOKUP = new Map();
for (const u of UNITS) {
  for (const key of [u.code, u.singular, u.plural, ...u.aliases]) {
    LOOKUP.set(key.toLowerCase(), u.code);
  }
}

/** Einheit aus Eingabe (beliebige Schreibweise) → code, oder null wenn unbekannt. */
export function normalizeUnit(input) {
  return LOOKUP.get(String(input ?? '').trim().toLowerCase()) ?? null;
}

export function getUnit(code) {
  return BY_CODE.get(code) ?? null;
}

/** Menge in die Basiseinheit ihrer Gruppe umrechnen (kg → g, l → ml, sonst unverändert). */
export function toBase(amount, code) {
  const unit = BY_CODE.get(code);
  if (!unit?.base) return { amount, unit: code };
  return { amount: amount == null ? null : amount * unit.factor, unit: unit.base };
}

/**
 * Mengen addieren. Ergebnis: eine Summe pro Basiseinheit, in der Reihenfolge des ersten
 * Auftretens. `amount: null` bedeutet „nach Bedarf“ und zählt nur, wenn es keine
 * bezifferte Menge derselben Einheit gibt.
 */
export function sumAmounts(entries) {
  const sums = new Map();
  for (const { amount, unit } of entries) {
    const base = toBase(amount, unit);
    const current = sums.get(base.unit);
    if (!current) {
      sums.set(base.unit, { amount: base.amount, unit: base.unit });
    } else if (base.amount != null) {
      current.amount = (current.amount ?? 0) + base.amount;
    }
  }
  return [...sums.values()].map(s => ({ ...s, amount: s.amount == null ? null : round(s.amount) }));
}

/** Menge lesbar machen: große g/ml-Werte in kg/l, deutsche Dezimalschreibweise, Mehrzahl. */
export function formatAmount(amount, code) {
  const unit = BY_CODE.get(code);
  if (amount == null) return 'nach Bedarf';
  let value = amount;
  let display = unit ?? { singular: code, plural: code };
  if (code === 'g' && amount >= 1000) { value = amount / 1000; display = BY_CODE.get('kg'); }
  if (code === 'ml' && amount >= 1000) { value = amount / 1000; display = BY_CODE.get('l'); }
  const label = value === 1 ? display.singular : display.plural;
  const number = formatNumber(value);
  return code === 'Stück' ? number : `${number} ${label}`;
}

export function formatNumber(value) {
  return String(round(value)).replace('.', ',');
}

function round(value) {
  return Math.round(value * 100) / 100;
}
