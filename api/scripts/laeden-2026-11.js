#!/usr/bin/env node
/**
 * Umstellung der Läden (Nov. 2026): statt Markt jetzt Metzgerei Klein (Fleisch, Wurst, Käse, Frischkäse)
 * und maison de fruits (Obst, Gemüse, Kräuter); Netto entfällt (Xikanisches Fannenmüse → We › Tiefkühl).
 * Was schon bei We, Schäfer oder dm liegt, bleibt. Einmalig: node scripts/laeden-2026-11.js [--probe]
 */
import { openDatabase, newId } from '../src/db/index.js';
import { databasePath } from '../src/config.js';

const probe = process.argv.includes('--probe');
const db = openDatabase(databasePath());
const store = name => db.prepare('SELECT * FROM stores WHERE name = ?').get(name);
const groupId = name => db.prepare('SELECT id FROM product_groups WHERE name = ?').pluck().get(name);
const section = (storeId, name) => db.prepare('SELECT id FROM store_sections WHERE store_id = ? AND name = ?').pluck().get(storeId, name);

if (!store('Markt') && !store('Netto')) { console.log('Schon umgestellt.'); process.exit(0); }

const NEW_STORES = [
  { name: 'maison de fruits', color: '#16A34A', sections: ['Obst', 'Gemüse', 'Kräuter & Salat'] },
  { name: 'Metzgerei Klein', color: '#B45309', sections: ['Fleisch', 'Wurst', 'Käse'] },
];
// Warengruppe → [Laden, Abschnitt]: für die Produkte vom Markt und als Vorschlag beim Anlegen
const GROUPS = {
  'Obst': ['maison de fruits', 'Obst'],
  'Gemüse': ['maison de fruits', 'Gemüse'],
  'Pilze': ['maison de fruits', 'Gemüse'],
  'Kartoffeln & Zwiebeln': ['maison de fruits', 'Gemüse'],
  'Salat & frische Kräuter': ['maison de fruits', 'Kräuter & Salat'],
  'Fleisch': ['Metzgerei Klein', 'Fleisch'],
  'Wurst & Schinken': ['Metzgerei Klein', 'Wurst'],
  'Käse': ['Metzgerei Klein', 'Käse'],
  'Frischkäse & Quark': ['Metzgerei Klein', 'Käse'],
};

const changes = [];
const run = db.transaction(() => {
  const we = store('We');
  // Merklisten-Einträge hängen am Laden und würden mit ihm gelöscht → zu We
  for (const old of [store('Markt'), store('Netto')].filter(Boolean)) {
    const moved = db.prepare('UPDATE free_items SET store_id = ? WHERE store_id = ?').run(we.id, old.id).changes;
    if (moved) changes.push(`${moved} Merklisten-Eintrag/Einträge von ${old.name} → Merkliste We`);
  }
  // neue Läden vorne (Lauf-Reihenfolge), Rest dahinter
  db.prepare('UPDATE stores SET sort = sort + 10').run();
  NEW_STORES.forEach((s, i) => {
    const id = store(s.name)?.id ?? newId();
    if (!store(s.name)) db.prepare('INSERT INTO stores (id, name, color, sort) VALUES (?, ?, ?, ?)').run(id, s.name, s.color, i);
    s.sections.forEach((name, j) => {
      if (!section(id, name)) db.prepare('INSERT INTO store_sections (id, store_id, name, sort) VALUES (?, ?, ?, ?)').run(newId(), id, name, j);
    });
    changes.push(`Laden ${s.name}: ${s.sections.join(', ')}`);
  });

  // Warengruppen: Vorschlag + Abschnitt im neuen Laden, We als Ausweichladen
  for (const [group, [storeName, sectionName]] of Object.entries(GROUPS)) {
    const g = groupId(group);
    if (!g) { changes.push(`! Warengruppe ${group} fehlt`); continue; }
    const s = store(storeName);
    db.prepare('UPDATE product_groups SET preferred_store_id = ?, fallback_store_id = ? WHERE id = ?').run(s.id, we.id, g);
    db.prepare('INSERT OR REPLACE INTO section_groups (store_id, group_id, section_id) VALUES (?, ?, ?)').run(s.id, g, section(s.id, sectionName));
  }

  // Produkte vom Markt nach Warengruppe verteilen
  const markt = store('Markt');
  if (markt) {
    const products = db.prepare(`SELECT p.id, p.name, g.name AS group_name FROM products p LEFT JOIN product_groups g ON g.id = p.group_id
                                 WHERE p.store_id = ? OR p.fallback_store_id = ?`).all(markt.id, markt.id);
    for (const p of products) {
      const target = GROUPS[p.group_name];
      if (!target) {
        db.prepare('UPDATE products SET store_id = ?, section_id = ?, fallback_store_id = NULL WHERE id = ? AND store_id = ?')
          .run(we.id, section(we.id, 'Rest'), p.id, markt.id);
        changes.push(`! ${p.name} (${p.group_name ?? 'ohne Warengruppe'}) → We › Rest`);
        continue;
      }
      const s = store(target[0]);
      db.prepare('UPDATE products SET store_id = ?, section_id = ?, fallback_store_id = ? WHERE id = ? AND store_id = ?')
        .run(s.id, section(s.id, target[1]), we.id, p.id, markt.id);
      db.prepare('UPDATE products SET fallback_store_id = NULL WHERE id = ? AND fallback_store_id = ?').run(p.id, markt.id);
    }
    changes.push(`${products.length} Produkte vom Markt verteilt`);
    db.prepare('UPDATE product_groups SET fallback_store_id = NULL WHERE fallback_store_id = ?').run(markt.id);
    db.prepare('DELETE FROM stores WHERE id = ?').run(markt.id);
  }

  const netto = store('Netto');
  if (netto) {
    const moved = db.prepare('UPDATE products SET store_id = ?, section_id = ? WHERE store_id = ?').run(we.id, section(we.id, 'Tiefkühl'), netto.id).changes;
    db.prepare('UPDATE products SET fallback_store_id = NULL WHERE fallback_store_id = ?').run(netto.id);
    db.prepare('UPDATE product_groups SET preferred_store_id = ? WHERE preferred_store_id = ?').run(we.id, netto.id);
    db.prepare('UPDATE product_groups SET fallback_store_id = NULL WHERE fallback_store_id = ?').run(netto.id);
    db.prepare('DELETE FROM stores WHERE id = ?').run(netto.id);
    changes.push(`Netto entfernt, ${moved} Produkt(e) → We › Tiefkühl`);
  }

  // Sortierung wieder lückenlos
  db.prepare('SELECT id FROM stores ORDER BY sort').pluck().all().forEach((id, i) => db.prepare('UPDATE stores SET sort = ? WHERE id = ?').run(i, id));

  summary = db.prepare(`SELECT s.name AS laden, sec.name AS abschnitt, COUNT(p.id) AS n FROM stores s
                        JOIN store_sections sec ON sec.store_id = s.id LEFT JOIN products p ON p.section_id = sec.id
                        GROUP BY sec.id HAVING n > 0 ORDER BY s.sort, sec.sort`).all();
  if (probe) throw new Probe();
});

let summary = [];
class Probe extends Error {}
try {
  run();
} catch (e) {
  if (!(e instanceof Probe)) throw e;
}
console.log(changes.join('\n'));
console.log(probe ? '\nProbe – nichts gespeichert. So würde es aussehen:' : '\nUmgestellt:');
for (const r of summary) console.log(`  ${r.laden} › ${r.abschnitt}: ${r.n}`);
