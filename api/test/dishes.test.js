import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, newId, now } from '../src/db/index.js';
import { saveDish, getDish, getDishChanges, ValidationError } from '../src/repo/dishes.js';
import { dishToFile, fileToDish, parseIngredientLine, formatIngredientLine } from '../src/domain/dishFile.js';

let db;

function addProduct(name, unit = 'Stück') {
  const id = newId();
  db.prepare('INSERT INTO products (id, name, unit, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, name, unit, now(), now());
  return id;
}

beforeEach(() => {
  db = openDatabase(':memory:');
  addProduct('Ghetti', 'g');
  addProduct('Hackleisch', 'g');
  addProduct('Blauch', 'Zehe');
  addProduct('Salz');
  addProduct('Silie', 'Bund');
  addProduct('Toffels', 'g');
});

test('Zutatenzeilen lesen', () => {
  assert.deepEqual(parseIngredientLine('125 g Ghetti'), { productName: 'Ghetti', amount: 125, unit: 'g', optional: false });
  assert.deepEqual(parseIngredientLine('2 Zehen Blauch'), { productName: 'Blauch', amount: 2, unit: 'Zehe', optional: false });
  assert.deepEqual(parseIngredientLine('1,5 kg Toffels'), { productName: 'Toffels', amount: 1.5, unit: 'kg', optional: false });
  assert.deepEqual(parseIngredientLine('1/2 Bund Silie (optional)'), { productName: 'Silie', amount: 0.5, unit: 'Bund', optional: true });
  assert.deepEqual(parseIngredientLine('Salz'), { productName: 'Salz', amount: null, unit: 'Stück', optional: false });
  assert.deepEqual(parseIngredientLine('3 Rotten'), { productName: 'Rotten', amount: 3, unit: 'Stück', optional: false });
  assert.throws(() => parseIngredientLine('(optional)'));
});

test('Zutatenzeilen schreiben und wieder lesen', () => {
  for (const ing of [
    { productName: 'Ghetti', amount: 125, unit: 'g', optional: false },
    { productName: 'Blauch', amount: 1, unit: 'Zehe', optional: false },
    { productName: 'Blauch', amount: 3, unit: 'Zehe', optional: true },
    { productName: 'Salz', amount: null, unit: 'Stück', optional: false },
    { productName: 'Rolle Küchenpapier', amount: 2, unit: 'Stück', optional: false },
  ]) {
    assert.deepEqual(parseIngredientLine(formatIngredientLine(ing)), ing);
  }
  assert.equal(formatIngredientLine({ productName: 'Blauch', amount: 2, unit: 'Zehe', optional: false }), '2 Zehen Blauch');
});

test('Gericht speichern, als Datei ausgeben und unverändert zurücklesen', () => {
  saveDish(db, { name: 'Toffellat', ingredients: [{ productName: 'Toffels', amount: 500, unit: 'g' }] });
  const { dish } = saveDish(db, {
    name: 'Ghetti Nese', categories: ['Dels'], servings: 2, recipe: '1. Kochen.\n2. Essen.',
    ingredients: [
      { productName: 'Ghetti', amount: 125, unit: 'g' },
      { productName: 'Hackleisch', amount: 200, unit: 'g' },
      { productName: 'Salz', amount: null, unit: 'Stück' },
      { productName: 'Silie', amount: 0.5, unit: 'Bund', optional: true },
    ],
    components: [{ dishName: 'Toffellat', factor: 0.5, optional: true }],
    preparations: [{ text: 'Hackleisch auftauen', leadHours: 12 }],
  });

  const file = dishToFile(dish);
  assert.match(file, /- 125 g Ghetti/);
  assert.match(file, /- 1\/2 Bund Silie|- 0,5 Bund Silie/);
  assert.match(file, /- Toffellat × 0,5/);
  assert.match(file, /- Hackleisch auftauen \(12 h vorher\)/);

  const { summary } = saveDish(db, { id: dish.id, ...fileToDish(file) }, { source: 'import' });
  assert.equal(summary, '', 'Rundreise ohne Änderungen');
});

test('Mengenänderung wird protokolliert und Zutat-ID bleibt erhalten', () => {
  const { dish } = saveDish(db, { name: 'Ghetti Nese', ingredients: [{ productName: 'Ghetti', amount: 250, unit: 'g' }] });
  const ingredientId = dish.ingredients[0].id;

  const file = dishToFile(dish).replace('250 g Ghetti', '200 g Ghetti').replace('zutaten:', 'zutaten:\n  - 1 Zehe Blauch');
  const { dish: updated, summary } = saveDish(db, { id: dish.id, ...fileToDish(file) }, { source: 'import' });

  assert.equal(summary, '+ Blauch (1 Zehe); Ghetti: 250 g → 200 g');
  assert.equal(updated.ingredients.find(i => i.productName === 'Ghetti').id, ingredientId);
  assert.deepEqual(getDishChanges(db, dish.id).map(c => c.summary), ['+ Blauch (1 Zehe); Ghetti: 250 g → 200 g', 'Angelegt']);
});

test('Ungültige Gerichte werden mit verständlichen Meldungen abgelehnt', () => {
  assert.throws(
    () => saveDish(db, { name: 'Kaputt', ingredients: [{ productName: 'Gibtsnicht', amount: 1 }, { productName: 'Salz', amount: 1, unit: 'Furlong' }] }),
    err => err instanceof ValidationError
      && err.messages.includes('Zutat 1: Produkt „Gibtsnicht“ unbekannt')
      && err.messages.includes('Zutat „Salz“: Einheit „Furlong“ unbekannt'),
  );
  assert.equal(getDish(db, 'Kaputt'), null, 'nichts halb gespeichert');
});

test('Holen-Gerichte haben keine Zutaten', () => {
  assert.throws(() => saveDish(db, { name: 'Ner', kind: 'takeaway', ingredients: [{ productName: 'Salz' }] }), ValidationError);
  const { dish } = saveDish(db, { name: 'Ner', kind: 'takeaway', takeawayWhere: 'Ecke' });
  assert.match(dishToFile(dish), /art: holen\nstatus: aktiv\nportionen: 2\nwo: Ecke/);
});

test('Vorbereitung in beiden Schreibweisen, auch ohne Anführungszeichen', () => {
  const head = '---\nname: X\nvorbereitungen:\n  - Kichererbsen einweichen (12 h vorher)\n  - 2 h vorher: Teig ruhen lassen\n---\n';
  assert.deepEqual(fileToDish(head).preparations, [
    { text: 'Kichererbsen einweichen', leadHours: 12 },
    { text: 'Teig ruhen lassen', leadHours: 2 },
  ]);
});
