import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUnit, sumAmounts, formatAmount } from '../src/domain/units.js';

test('Schreibweisen werden auf eine Einheit abgebildet', () => {
  assert.equal(normalizeUnit('Zehen'), 'Zehe');
  assert.equal(normalizeUnit('zehe'), 'Zehe');
  assert.equal(normalizeUnit('Weigs'), 'Zweig');
  assert.equal(normalizeUnit('Scheibs'), 'Scheibe');
  assert.equal(normalizeUnit('Rise'), 'Prise');
  assert.equal(normalizeUnit('Las'), 'Glas');
  assert.equal(normalizeUnit(' kg '), 'kg');
  assert.equal(normalizeUnit('Furlong'), null);
});

test('ohne Einheit zählt als Stück (Bug #2: „8 stück + 10“)', () => {
  assert.equal(normalizeUnit(''), 'Stück');
  assert.equal(normalizeUnit(null), 'Stück');
  assert.deepEqual(sumAmounts([
    { amount: 8, unit: normalizeUnit('stück') },
    { amount: 10, unit: normalizeUnit('') },
  ]), [{ amount: 18, unit: 'Stück' }]);
});

test('Zehe und Zehen werden addiert', () => {
  assert.deepEqual(sumAmounts([
    { amount: 1.5, unit: normalizeUnit('Zehen') },
    { amount: 3, unit: normalizeUnit('Zehe') },
  ]), [{ amount: 4.5, unit: 'Zehe' }]);
});

test('Gewicht wird umgerechnet, fremde Einheiten bleiben getrennt', () => {
  assert.deepEqual(sumAmounts([
    { amount: 500, unit: 'g' },
    { amount: 0.75, unit: 'kg' },
    { amount: 1.5, unit: 'EL' },
  ]), [{ amount: 1250, unit: 'g' }, { amount: 1.5, unit: 'EL' }]);
});

test('„nach Bedarf“ verschwindet, sobald eine Menge da ist', () => {
  assert.deepEqual(sumAmounts([{ amount: null, unit: 'Stück' }]), [{ amount: null, unit: 'Stück' }]);
  assert.deepEqual(sumAmounts([
    { amount: null, unit: 'Stück' },
    { amount: 2, unit: 'Stück' },
  ]), [{ amount: 2, unit: 'Stück' }]);
});

test('Anzeige', () => {
  assert.equal(formatAmount(1250, 'g'), '1,25 kg');
  assert.equal(formatAmount(200, 'g'), '200 g');
  assert.equal(formatAmount(1, 'Zehe'), '1 Zehe');
  assert.equal(formatAmount(3, 'Zehe'), '3 Zehen');
  assert.equal(formatAmount(4, 'Stück'), '4');
  assert.equal(formatAmount(null, 'Stück'), 'nach Bedarf');
  assert.equal(formatAmount(0.1 + 0.2, 'l'), '0,3 l');
});
