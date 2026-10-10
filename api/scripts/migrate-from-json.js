#!/usr/bin/env node
/**
 * Übernahme der alten lowdb-Datei (db.json) in eine neue SQLite-Datenbank.
 * Wiederholbar: erzeugt die Zieldatei jedes Mal neu (mit --force wird eine vorhandene ersetzt).
 *
 *   node scripts/migrate-from-json.js [--json data/db.json] [--mapping data/migration/produkte.json]
 *                                     [--out data/schompf.db] [--force]
 *
 * Grundstruktur (Läden, Warengruppen, Lagerorte, Slots) kommt aus seed/struktur.json,
 * die Produkt-Zuordnung aus der Mapping-Datei (nicht im Git, enthält Haushaltsdaten).
 */
import { readFileSync, existsSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { openDatabase, newId } from '../src/db/index.js';
import { normalizeUnit } from '../src/domain/units.js';

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const { values: args } = parseArgs({
  options: {
    json: { type: 'string', default: join(API_DIR, 'data/db.json') },
    mapping: { type: 'string', default: join(API_DIR, 'data/migration/produkte.json') },
    out: { type: 'string', default: join(API_DIR, 'data/schompf.db') },
    force: { type: 'boolean', default: false },
  },
});

const old = JSON.parse(readFileSync(args.json, 'utf8'));
const mapping = JSON.parse(readFileSync(args.mapping, 'utf8'));
const structure = JSON.parse(readFileSync(join(API_DIR, 'seed/struktur.json'), 'utf8'));

if (existsSync(args.out)) {
  if (!args.force) {
    console.error(`${args.out} existiert bereits – mit --force ersetzen.`);
    process.exit(1);
  }
  for (const suffix of ['', '-wal', '-shm']) rmSync(args.out + suffix, { force: true });
}

const db = openDatabase(args.out);
const report = { warnings: [], counts: {} };
const warn = msg => report.warnings.push(msg);
const key = name => String(name ?? '').trim().toLowerCase();

// Sonderfälle aus der Abstimmung (docs/konzept.md, „Übernahme der bisherigen Daten“)
const DISH_KIND = { 'ner': 'takeaway', 'coli': 'buy' };
const DISH_DRAFT = new Set(['kelhuhn']);
const DISH_DELETE = new Set(['picknick']);
const EXTRA_COMPONENTS = [{ dish: 'Leischküchle', component: 'Toffellat', factor: 1, optional: true }];
const SHELF_LIFE_MAX = 6; // nur bewusst kurz gesetzte Haltbarkeiten übernehmen

db.transaction(() => {
  const ids = seedStructure();
  const products = migrateProducts(ids);
  const dishes = migrateDishes(products);
  migrateMeals(dishes);
  migrateFreeItems(products, ids);
})();

db.close();
printReport();

// ---------------------------------------------------------------------------

function seedStructure() {
  const storage = new Map();
  structure.storageLocations.forEach((name, i) => {
    const id = newId();
    db.prepare('INSERT INTO storage_locations (id, name, sort) VALUES (?, ?, ?)').run(id, name, i);
    storage.set(name, id);
  });

  const stores = new Map();    // name → id
  const sections = new Map();  // "Laden/Abschnitt" → id
  structure.stores.forEach((store, i) => {
    const id = newId();
    db.prepare('INSERT INTO stores (id, name, color, sort) VALUES (?, ?, ?, ?)').run(id, store.name, store.color, i);
    stores.set(store.name, id);
    store.sections.forEach((section, j) => {
      const sectionId = newId();
      db.prepare('INSERT INTO store_sections (id, store_id, name, sort) VALUES (?, ?, ?, ?)').run(sectionId, id, section, j);
      sections.set(`${store.name}/${section}`, sectionId);
    });
  });

  const groups = new Map();
  structure.groups.forEach((group, i) => {
    const id = newId();
    db.prepare(`INSERT INTO product_groups (id, name, storage_location_id, preferred_store_id, fallback_store_id, sort)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, group.name, storage.get(group.storage) ?? null, stores.get(group.preferred) ?? null,
        group.fallback ? stores.get(group.fallback) : null, i);
    for (const [storeName, sectionName] of Object.entries(group.sections)) {
      const sectionId = sections.get(`${storeName}/${sectionName}`);
      if (!sectionId) throw new Error(`Abschnitt ${storeName}/${sectionName} fehlt in der Struktur`);
      db.prepare('INSERT INTO section_groups (store_id, group_id, section_id) VALUES (?, ?, ?)')
        .run(stores.get(storeName), id, sectionId);
    }
    groups.set(group.name, id);
  });

  structure.mealSlots.forEach((slot, i) => {
    db.prepare('INSERT INTO meal_slots (id, name, sort, time) VALUES (?, ?, ?, ?)').run(slot.id, slot.name, i, slot.time);
  });

  return { storage, stores, sections, groups };
}

function migrateProducts(ids) {
  const byName = new Map();  // key(name) → product id
  const byOldId = new Map(); // alte ID → neue/gleiche ID
  const now = new Date().toISOString();
  const staples = new Set(mapping.staples.map(key));
  const deleted = new Set((mapping.delete ?? []).map(key));
  const aliases = mapping.ingredientAliases ?? {};

  const insert = db.prepare(`INSERT INTO products (id, name, unit, group_id, section_id, is_staple, shelf_life_days, created_at, updated_at)
                             VALUES (@id, @name, @unit, @group_id, @section_id, @is_staple, @shelf_life_days, @created_at, @updated_at)`);

  const groupFor = name => {
    const groupName = mapping.groups[name];
    if (!groupName) return null;
    const id = ids.groups.get(groupName);
    if (!id) throw new Error(`Warengruppe „${groupName}“ (für ${name}) fehlt in der Struktur`);
    return id;
  };
  const sectionFor = name => {
    const ref = mapping.sectionExceptions?.[name];
    if (!ref) return null;
    const id = ids.sections.get(ref);
    if (!id) throw new Error(`Abschnitt ${ref} (Ausnahme für ${name}) fehlt in der Struktur`);
    return id;
  };

  for (const p of old.products) {
    const name = p.name.trim();
    if (deleted.has(key(name))) continue;
    // Doppelte Produkte (z.B. „Saures Sahne“ → „Saure Sahne“) werden zusammengeführt
    if (aliases[name] && old.products.some(o => o.name === aliases[name])) continue;
    const unit = normalizeUnit(p.defaultUnit);
    if (!unit) warn(`Produkt ${name}: unbekannte Einheit „${p.defaultUnit}“ → Stück`);
    const group_id = groupFor(name);
    if (!group_id) warn(`Produkt ${name}: keine Warengruppe`);
    insert.run({
      id: p.id, name, unit: unit ?? 'Stück', group_id, section_id: sectionFor(name),
      is_staple: staples.has(key(name)) ? 1 : 0,
      shelf_life_days: p.freshnessDays != null && p.freshnessDays <= SHELF_LIFE_MAX ? p.freshnessDays : null,
      created_at: p.createdAt ?? now, updated_at: p.updatedAt ?? now,
    });
    byName.set(key(name), p.id);
    byOldId.set(p.id, p.id);
  }

  // Zusammengeführte Produkte auf ihr Ziel zeigen lassen
  for (const p of old.products) {
    if (!byOldId.has(p.id) && aliases[p.name.trim()]) {
      const target = byName.get(key(aliases[p.name.trim()]));
      if (target) { byOldId.set(p.id, target); byName.set(key(p.name), target); }
    }
  }

  // Neue Produkte aus bisher unverknüpften Zutaten
  for (const [name, group] of Object.entries(mapping.newProducts ?? {})) {
    if (group.startsWith('=')) continue;
    const id = newId();
    const groupId = ids.groups.get(group);
    if (!groupId) throw new Error(`Warengruppe „${group}“ (für neues Produkt ${name}) fehlt`);
    insert.run({ id, name, unit: 'Stück', group_id: groupId, section_id: null, is_staple: 0, shelf_life_days: null, created_at: now, updated_at: now });
    byName.set(key(name), id);
  }
  for (const [name, group] of Object.entries(mapping.newProducts ?? {})) {
    if (group.startsWith('=')) byName.set(key(name), byName.get(key(group.slice(1))));
  }

  report.counts.products = db.prepare('SELECT COUNT(*) n FROM products').get().n;
  return { byName, byOldId, aliases };
}

function resolveProduct(ingredient, products, dishName) {
  const name = String(ingredient.productName ?? '').trim();
  // 1. Name passt genau → dieses Produkt (repariert falsche Verknüpfungen wie Wiebels → Wi)
  let id = products.byName.get(key(name));
  // 2. bekannter Alias (z.B. Olivenöl → Livenöl)
  if (!id && products.aliases[name]) id = products.byName.get(key(products.aliases[name]));
  // 3. bisherige Verknüpfung, falls gültig
  if (!id && products.byOldId.has(ingredient.productId)) {
    id = products.byOldId.get(ingredient.productId);
    warn(`Zutat „${name}“ in ${dishName}: unbekannter Name, alte Verknüpfung behalten`);
  }
  // 4. sonst neues Produkt ohne Warengruppe (klären!)
  if (!id) {
    id = newId();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO products (id, name, unit, created_at, updated_at) VALUES (?, ?, 'Stück', ?, ?)`).run(id, name, now, now);
    products.byName.set(key(name), id);
    warn(`Zutat „${name}“ in ${dishName}: neues Produkt ohne Warengruppe angelegt`);
  }
  return id;
}

function parseAmount(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function migrateDishes(products) {
  const byId = new Map();     // alte Gericht-ID → ID (gelöschte fehlen)
  const ingredientIds = new Set();
  const insertDish = db.prepare(`INSERT INTO dishes (id, name, kind, status, servings, source_url, recipe, created_at, updated_at)
                                 VALUES (@id, @name, @kind, @status, @servings, @source_url, @recipe, @created_at, @updated_at)`);
  const insertIngredient = db.prepare(`INSERT INTO dish_ingredients (id, dish_id, product_id, amount, unit, optional, sort)
                                       VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const now = new Date().toISOString();

  for (const d of old.dishes) {
    const name = d.name.trim();
    if (DISH_DELETE.has(key(name))) continue;
    const kind = DISH_KIND[key(name)] ?? 'cook';
    insertDish.run({
      id: d.id, name, kind,
      status: d.published === false || DISH_DRAFT.has(key(name)) ? 'draft' : 'active',
      servings: d.defaultServings || 2,
      source_url: d.recipeUrl || null,
      recipe: d.recipe?.trim() || null,
      created_at: d.createdAt ?? now, updated_at: d.updatedAt ?? now,
    });
    byId.set(d.id, d.id);
    for (const category of new Set(d.categories ?? [])) {
      db.prepare('INSERT INTO dish_categories (dish_id, category) VALUES (?, ?)').run(d.id, category);
    }
    if (kind === 'takeaway') continue; // Holen-Gerichte haben keine Zutaten

    // Gleiches Produkt mehrfach (z.B. Rote + Gelbe Tailmaten → Tailmaten): Mengen addieren
    const merged = new Map();
    for (const ing of d.ingredients ?? []) {
      const productId = resolveProduct(ing, products, name);
      const unit = normalizeUnit(ing.unit);
      if (!unit) warn(`Zutat „${ing.productName}“ in ${name}: unbekannte Einheit „${ing.unit}“ übernommen`);
      const amount = parseAmount(ing.amount);
      const existing = merged.get(productId);
      if (!existing) { merged.set(productId, { id: ing.id, productId, amount, unit: unit ?? ing.unit, optional: !!ing.optional }); continue; }
      if (existing.unit !== (unit ?? ing.unit) || existing.optional !== !!ing.optional) {
        warn(`Zutat „${ing.productName}“ in ${name}: doppelt mit anderer Einheit – zweiter Eintrag verworfen`);
        continue;
      }
      existing.amount = existing.amount == null || amount == null ? (existing.amount ?? amount) : existing.amount + amount;
      warn(`Zutat „${ing.productName}“ in ${name}: mit gleichem Produkt zusammengeführt`);
    }
    [...merged.values()].forEach((ing, i) => {
      insertIngredient.run(ing.id, d.id, ing.productId, ing.amount, ing.unit, ing.optional ? 1 : 0, i);
      ingredientIds.add(ing.id);
    });
  }

  // Bestandteile/Beilagen
  const insertComponent = db.prepare(`INSERT OR IGNORE INTO dish_components (id, dish_id, component_dish_id, factor, optional, sort)
                                      VALUES (?, ?, ?, ?, ?, ?)`);
  for (const d of old.dishes) {
    if (!byId.has(d.id)) continue;
    (d.subDishes ?? []).forEach((s, i) => {
      if (!byId.has(s.dishId)) return warn(`Beilage von ${d.name} verweist auf unbekanntes Gericht`);
      insertComponent.run(newId(), d.id, s.dishId, s.scalingFactor || s.multiplier || 1, s.optional ? 1 : 0, i);
    });
  }
  for (const extra of EXTRA_COMPONENTS) {
    const dish = db.prepare('SELECT id FROM dishes WHERE name = ?').get(extra.dish);
    const component = db.prepare('SELECT id FROM dishes WHERE name = ?').get(extra.component);
    if (dish && component) insertComponent.run(newId(), dish.id, component.id, extra.factor, extra.optional ? 1 : 0, 99);
  }

  const insertChange = db.prepare(`INSERT INTO dish_changes (dish_id, at, source, summary) VALUES (?, ?, 'migration', ?)`);
  for (const id of byId.values()) insertChange.run(id, now, 'Aus alter Datenbank übernommen');

  report.counts.dishes = byId.size;
  report.counts.ingredients = ingredientIds.size;
  return { byId, ingredientIds };
}

function migrateMeals(dishes) {
  const insertMeal = db.prepare(`INSERT INTO meals (id, date, slot_id, sort, kind, dish_id, servings, text, status, created_at, updated_at)
                                 VALUES (@id, @date, @slot_id, @sort, @kind, @dish_id, @servings, @text, @status, @created_at, @updated_at)`);
  const insertComponent = db.prepare('INSERT OR IGNORE INTO meal_components (meal_id, component_dish_id, factor) VALUES (?, ?, ?)');
  const insertExcluded = db.prepare('INSERT OR IGNORE INTO meal_excluded_ingredients (meal_id, ingredient_id) VALUES (?, ?)');
  const slots = new Set(structure.mealSlots.map(s => s.id));
  const sortBySlot = new Map();
  const kinds = { dish: 0, leftovers: 0, text: 0 };

  for (const m of [...old.meals].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))) {
    if (!slots.has(m.slotId)) { warn(`Mahlzeit ${m.date}: unbekannter Slot ${m.slotId} übersprungen`); continue; }
    const text = (m.dishName ?? '').trim();
    let kind, dishId = null;
    if (m.dishId && dishes.byId.has(m.dishId)) { kind = 'dish'; dishId = m.dishId; }
    else if (/^reste\b/i.test(text)) kind = 'leftovers';
    else kind = 'text';
    kinds[kind]++;

    const slotKey = `${m.date}/${m.slotId}`;
    const sort = sortBySlot.get(slotKey) ?? 0;
    sortBySlot.set(slotKey, sort + 1);

    insertMeal.run({
      id: m.id, date: m.date, slot_id: m.slotId, sort, kind, dish_id: dishId,
      servings: kind === 'dish' ? (m.servings || 2) : null,
      text: kind === 'dish' ? null : (kind === 'leftovers' && /^reste$/i.test(text) ? null : text || null),
      status: m.status === 'prepared' ? 'prepared' : 'planned',
      created_at: m.createdAt ?? m.updatedAt, updated_at: m.updatedAt ?? m.createdAt,
    });
    if (kind !== 'dish') continue;
    for (const s of m.subDishes ?? []) {
      if (dishes.byId.has(s.dishId)) insertComponent.run(m.id, s.dishId, s.scalingFactor || 1);
    }
    for (const ingredientId of m.excludedIngredientIds ?? []) {
      if (dishes.ingredientIds.has(ingredientId)) insertExcluded.run(m.id, ingredientId);
    }
  }
  report.counts.meals = kinds;
}

function migrateFreeItems(products, ids) {
  // Offene, von Hand hinzugefügte Artikel der alten Liste → Merkliste des bevorzugten Ladens
  const items = old.shoppingList?.items ?? [];
  const groupStore = db.prepare(`SELECT g.preferred_store_id FROM products p JOIN product_groups g ON g.id = p.group_id WHERE p.id = ?`);
  const insert = db.prepare(`INSERT INTO free_items (id, store_id, product_id, text, amount, unit, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`);
  let count = 0;
  for (const item of items) {
    if (item.deleted || item.checked) continue;
    const amounts = item.amounts ?? [];
    const manual = amounts.filter(a => a.sourceType === 'manual' && !a.isAdjustment);
    if (manual.length === 0 || amounts.some(a => a.sourceType === 'meal')) continue;
    const productId = products.byName.get(key(item.productName)) ?? null;
    const storeId = (productId && groupStore.get(productId)?.preferred_store_id) ?? ids.stores.get('We');
    const total = manual.reduce((sum, a) => sum + (a.amount ?? 0), 0) || null;
    insert.run(newId(), storeId, productId, item.productName, total, normalizeUnit(manual[0].unit) ?? manual[0].unit, manual[0].addedAt ?? new Date().toISOString());
    count++;
  }
  report.counts.freeItems = count;
}

function printReport() {
  console.log('Übernahme abgeschlossen →', args.out);
  console.log(JSON.stringify(report.counts, null, 2));
  if (report.warnings.length) {
    console.log(`\n${report.warnings.length} Hinweise:`);
    for (const w of report.warnings) console.log(' -', w);
  }
}
