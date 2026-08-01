import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { genreFlags, isCameoCredit, isNoise, splitNoise } = await import('../src/discover.js');

// synthetic TMDB credits (real genre ids: 99 documentary, 10770 TV movie,
// 18 drama)
const CREDITS = [
  { id: 1, title: 'Largo bueno', genre_ids: [18], runtime: 120, order: 0 },
  { id: 2, title: 'Documental', genre_ids: [99], runtime: 95, order: 1 },
  { id: 3, title: 'Telefilme', genre_ids: [10770], runtime: 88, order: 2 },
  { id: 4, title: 'Corto', genre_ids: [18], runtime: 22, order: 3 },
  { id: 5, title: 'Otro largo', genre_ids: [18, 53], runtime: 101, order: 4 },
  { id: 6, title: 'Cameo', genre_ids: [18], runtime: 110, order: 40, character: 'Self' },
];

// the TMDB runtime pass is what sets isShort (< 40 min)
const asItem = (c, role = 'actor') => ({
  tmdb_id: c.id,
  title: c.title,
  runtime: c.runtime,
  isCameo: role === 'actor' ? isCameoCredit(c) : false,
  ...genreFlags(c.genre_ids),
  isShort: !!c.runtime && c.runtime < 40,
});

test('genreFlags marca documentales y películas de TV', () => {
  assert.equal(genreFlags([99]).isDocumentary, true);
  assert.equal(genreFlags([10770]).isTvMovie, true);
  assert.equal(genreFlags([18, 53]).isDocumentary, false);
  assert.equal(genreFlags().isTvMovie, false);
  assert.deepEqual(genreFlags([18]).genre_ids, [18]);
});

test('isCameoCredit detecta apariciones de relleno', () => {
  assert.equal(isCameoCredit({ order: 40, character: 'Self' }), true);
  assert.equal(isCameoCredit({ order: 0, character: 'Himself' }), true);
  assert.equal(isCameoCredit({ order: 0, character: 'archive footage' }), true);
  assert.equal(isCameoCredit({ order: 20, character: 'Doctor Smith' }), true, 'orden alto = figuración');
  assert.equal(isCameoCredit({ order: 2, character: 'Michael Corleone' }), false);
  assert.equal(isCameoCredit({}), true, 'sin orden se asume figuración');
});

test('cortos, documentales y telefilmes no cuentan como huecos', () => {
  const items = CREDITS.map((c) => asItem(c));
  const noisy = items.filter(isNoise).map((i) => i.title);
  assert.deepEqual(noisy.sort(), ['Cameo', 'Corto', 'Documental', 'Telefilme']);
  assert.deepEqual(items.filter((i) => !isNoise(i)).map((i) => i.title), ['Largo bueno', 'Otro largo']);
});

test('splitNoise llena la cuota con largometrajes y deja el ruido detrás', () => {
  const { features, noise, list } = splitNoise(CREDITS.map((c) => asItem(c)), 2);
  assert.deepEqual(features.map((f) => f.title), ['Largo bueno', 'Otro largo']);
  assert.equal(noise.length, 4);
  // the quota (2) is filled with features; noise trails behind, capped at 2
  assert.deepEqual(list.map((f) => f.title), ['Largo bueno', 'Otro largo', 'Documental', 'Telefilme']);
});

test('para directores no se aplica el filtro de cameos', () => {
  const doc = asItem(CREDITS[1], 'director');
  assert.equal(doc.isCameo, false);
  assert.equal(isNoise(doc), true, 'pero sigue siendo documental');
  const feature = asItem(CREDITS[5], 'director');
  assert.equal(isNoise(feature), false, 'un largo con orden alto no es ruido si dirige');
});
