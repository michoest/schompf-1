/**
 * Produkte als Excel-Tabelle zum Durchgehen und Zurückspielen (Datenwerkzeug: produkte-export / produkte-import).
 * Eine Zeile pro Produkt, sortiert nach Laden › Abschnitt; Auswahllisten verhindern Tippfehler.
 * Der Import gleicht über die (versteckte) ID ab, ändert nur, was abweicht, und prüft wie die App (saveProduct).
 * Zeilen ohne ID mit Namen werden als neue Produkte angelegt; gelöscht wird nichts.
 */
import ExcelJS from 'exceljs';
import { listProducts, saveProduct } from '../src/repo/products.js';
import { UNITS } from '../src/domain/units.js';

const SEP = ' › ';
const COLUMNS = [
  { key: 'id', header: 'ID', width: 10, hidden: true },
  { key: 'name', header: 'Name', width: 28 },
  { key: 'place', header: 'Einkaufsort', width: 30 },
  { key: 'fallback', header: 'Ausweichladen', width: 18 },
  { key: 'storage', header: 'Aufbewahrung', width: 18 },
  { key: 'group', header: 'Warengruppe', width: 26 },
  { key: 'staple', header: 'Grundvorrat', width: 12 },
  { key: 'shelfLife', header: 'Haltbar (Tage)', width: 14 },
  { key: 'unit', header: 'Einheit', width: 12 },
  { key: 'usedIn', header: 'In Gerichten', width: 12 },
];

function lookups(db) {
  const stores = db.prepare('SELECT id, name, sort FROM stores ORDER BY sort').all();
  const sections = db.prepare(`SELECT sec.id, sec.name, sec.sort, sec.store_id, s.name AS store_name, s.sort AS store_sort
                               FROM store_sections sec JOIN stores s ON s.id = sec.store_id ORDER BY s.sort, sec.sort`).all();
  const storage = db.prepare('SELECT id, name FROM storage_locations ORDER BY sort').all();
  const groups = db.prepare('SELECT id, name FROM product_groups ORDER BY sort').all();
  const places = [...sections.map(s => ({ label: `${s.store_name}${SEP}${s.name}`, storeId: s.store_id, sectionId: s.id })),
    ...stores.map(s => ({ label: s.name, storeId: s.id, sectionId: null }))];
  return { stores, sections, storage, groups, places, units: UNITS.map(u => u.code) };
}

export async function productsToXlsx(db) {
  const l = lookups(db);
  const placeOf = p => p.sectionId ? l.places.find(x => x.sectionId === p.sectionId)?.label : l.stores.find(s => s.id === p.storeId)?.name;
  const sortKey = p => {
    const sec = l.sections.find(s => s.id === p.sectionId);
    const store = l.stores.find(s => s.id === p.storeId);
    return [store ? store.sort : -1, sec ? sec.sort : 999, p.name.toLowerCase()];
  };
  const products = listProducts(db).sort((a, b) => {
    const [x, y] = [sortKey(a), sortKey(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Produkte', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
  ws.columns = COLUMNS;
  for (const p of products) {
    ws.addRow({
      id: p.id, name: p.name, place: placeOf(p) ?? '', fallback: l.stores.find(s => s.id === p.fallbackStoreId)?.name ?? '',
      storage: l.storage.find(s => s.id === p.storageLocationId)?.name ?? '', group: l.groups.find(g => g.id === p.groupId)?.name ?? '',
      staple: p.isStaple ? 'ja' : 'nein', shelfLife: p.shelfLifeDays ?? '', unit: p.unit, usedIn: p.usedIn,
    });
  }
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: 'A1', to: { row: 1, column: COLUMNS.length } };
  ws.getColumn('usedIn').font = { color: { argb: 'FF888888' } };

  // Auswahllisten auf einem versteckten Blatt
  const lists = wb.addWorksheet('Listen', { state: 'hidden' });
  const listCols = { place: l.places.map(p => p.label), fallback: l.stores.map(s => s.name), storage: l.storage.map(s => s.name),
    group: l.groups.map(g => g.name), staple: ['ja', 'nein'], unit: l.units };
  Object.entries(listCols).forEach(([key, values], i) => {
    const col = lists.getColumn(i + 1);
    values.forEach((v, r) => { lists.getCell(r + 1, i + 1).value = v; });
    const letter = col.letter;
    const target = ws.getColumn(key).letter;
    for (let r = 2; r <= products.length + 200; r++) {
      ws.getCell(`${target}${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [`Listen!$${letter}$1:$${letter}$${values.length}`],
        showErrorMessage: true, errorTitle: 'Bitte aus der Liste wählen', error: 'Nur Werte aus der Auswahlliste sind möglich.',
      };
    }
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const text = cell => {
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '').trim();
  if (typeof v === 'object' && 'richText' in v) return v.richText.map(t => t.text).join('').trim();
  return String(v).trim();
};

/** Tabelle übernehmen; mit probe: true nur die Änderungen ermitteln (Transaktion wird zurückgerollt). */
export async function applyXlsx(db, buffer, { probe = false } = {}) {
  const l = lookups(db);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('Produkte') ?? wb.worksheets[0];
  const col = {};
  ws.getRow(1).eachCell((cell, n) => { const c = COLUMNS.find(x => x.header === text(cell)); if (c) col[c.key] = n; });
  for (const key of ['id', 'name', 'place']) if (!col[key]) throw new Error(`Spalte „${COLUMNS.find(c => c.key === key).header}“ fehlt`);

  const byId = new Map(listProducts(db).map(p => [p.id, p]));
  const report = { changed: [], created: [], errors: [] };
  const find = (list, name, what, row) => {
    if (!name) return null;
    const hit = list.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!hit) throw new Error(`Zeile ${row}: ${what} „${name}“ unbekannt`);
    return hit.id;
  };

  class Probe extends Error {}
  try {
    db.transaction(() => {
      ws.eachRow((row, n) => {
        if (n === 1) return;
        const get = key => (col[key] ? text(row.getCell(col[key])) : undefined);
        const id = get('id');
        const name = get('name');
        if (!id && !name) return;
        try {
          const placeLabel = get('place');
          const place = placeLabel ? l.places.find(p => p.label.toLowerCase() === placeLabel.toLowerCase()) : { storeId: null, sectionId: null };
          if (!place) throw new Error(`Zeile ${n}: Einkaufsort „${placeLabel}“ unbekannt`);
          const input = { name, storeId: place.storeId, sectionId: place.sectionId };
          if (col.fallback) input.fallbackStoreId = find(l.stores, get('fallback'), 'Ausweichladen', n);
          if (col.storage) input.storageLocationId = find(l.storage, get('storage'), 'Aufbewahrung', n);
          if (col.group) input.groupId = find(l.groups, get('group'), 'Warengruppe', n);
          if (col.staple) input.isStaple = get('staple').toLowerCase() === 'ja';
          if (col.shelfLife) input.shelfLifeDays = get('shelfLife') === '' ? null : Number(get('shelfLife').replace(',', '.'));
          if (col.unit && get('unit')) input.unit = get('unit');

          const before = id && byId.get(id);
          if (id && !before) throw new Error(`Zeile ${n}: ID ${id} unbekannt`);
          if (!before) {
            saveProduct(db, input);
            report.created.push(name);
            return;
          }
          const diff = describe(before, input, l);
          if (!diff.length) return;
          saveProduct(db, input, id);
          report.changed.push(`${before.name}: ${diff.join(', ')}`);
        } catch (e) {
          report.errors.push(e.messages ? `Zeile ${n} (${name}): ${e.messages.join('; ')}` : e.message);
        }
      });
      if (report.errors.length) throw new Probe(); // nur ganz oder gar nicht
      if (probe) throw new Probe();
    })();
  } catch (e) {
    if (!(e instanceof Probe)) throw e;
  }
  return report;
}

function describe(before, input, l) {
  const store = id => l.stores.find(s => s.id === id)?.name ?? '–';
  const place = (storeId, sectionId) => l.places.find(p => p.sectionId === sectionId && sectionId)?.label ?? store(storeId);
  const name = (list, id) => list.find(x => x.id === id)?.name ?? '–';
  const out = [];
  if (input.name !== before.name) out.push(`Name → ${input.name}`);
  if (input.storeId !== (before.storeId ?? null) || input.sectionId !== (before.sectionId ?? null)) {
    out.push(`${place(before.storeId, before.sectionId)} → ${place(input.storeId, input.sectionId)}`);
  }
  if ('fallbackStoreId' in input && input.fallbackStoreId !== (before.fallbackStoreId ?? null)) out.push(`Ausweichladen → ${store(input.fallbackStoreId)}`);
  if ('storageLocationId' in input && input.storageLocationId !== (before.storageLocationId ?? null)) out.push(`Aufbewahrung → ${name(l.storage, input.storageLocationId)}`);
  if ('groupId' in input && input.groupId !== (before.groupId ?? null)) out.push(`Warengruppe → ${name(l.groups, input.groupId)}`);
  if ('isStaple' in input && input.isStaple !== before.isStaple) out.push(input.isStaple ? 'Grundvorrat' : 'kein Grundvorrat');
  if ('shelfLifeDays' in input && (input.shelfLifeDays ?? null) !== (before.shelfLifeDays ?? null)) out.push(`Haltbar → ${input.shelfLifeDays ?? '–'}`);
  if ('unit' in input && input.unit !== before.unit) out.push(`Einheit → ${input.unit}`);
  return out;
}
