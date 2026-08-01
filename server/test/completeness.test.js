import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { buildRoleItems, roleStats } = await import('../src/tmdb.js');

// Regression: Favoritos counted every released credit while the person page
// counted features only, so a director with all 50 features showed "te faltan 2"
// on one screen and "100%" on the other.
test('el completismo de dirección ignora cortos, telefilmes y documentales', () => {
  const credits = {
    crew: [
      { id: 1, job: 'Director', title: 'Largo que tengo', release_date: '1990-01-01', genre_ids: [18], vote_count: 500 },
      { id: 2, job: 'Director', title: 'Otro largo que tengo', release_date: '1995-01-01', genre_ids: [35], vote_count: 400 },
      { id: 3, job: 'Director', title: 'Corto suyo', release_date: '1998-01-01', genre_ids: [18], vote_count: 30 },
      { id: 4, job: 'Director', title: 'Documental suyo', release_date: '2000-01-01', genre_ids: [99], vote_count: 40 },
      { id: 5, job: 'Director', title: 'Telefilme suyo', release_date: '2002-01-01', genre_ids: [10770], vote_count: 20 },
    ],
    cast: [],
  };
  const inLib = new Set([1, 2]); // owns both features, none of the noise
  const items = buildRoleItems(credits, 'director', inLib, { keys: new Set(), tmdbIds: new Set(), movieIds: new Set() });
  // enrichRuntimes would set this from TMDB; set it by hand to stay offline
  items.find((i) => i.tmdb_id === 3).isShort = true;

  const stats = roleStats(items, 'director');
  assert.equal(stats.released, 2, 'solo los dos largometrajes cuentan');
  assert.equal(stats.owned, 2);
  assert.equal(stats.pct, 100, 'filmografía completa aunque falten corto/doc/TV');
  assert.equal(Math.max(0, stats.released - stats.owned), 0, 'no puede decir "te faltan"');
  assert.equal(stats.excludedFromCompletion, 3);
});

test('un documentalista sí cuenta sus documentales', () => {
  const crew = Array.from({ length: 6 }, (_, i) => ({
    id: 100 + i, job: 'Director', title: `Doc ${i}`, release_date: `20${10 + i}-01-01`, genre_ids: [99], vote_count: 100,
  }));
  const items = buildRoleItems({ crew, cast: [] }, 'director', new Set(), { keys: new Set(), tmdbIds: new Set(), movieIds: new Set() });
  const stats = roleStats(items, 'director');
  assert.equal(stats.documentarian, true);
  assert.equal(stats.released, 6, 'con >5 documentales dirigidos, cuentan todos');
});

test('el completismo de interpretación cuenta todo lo estrenado', () => {
  const cast = [
    { id: 1, title: 'Peli A', release_date: '1990-01-01', genre_ids: [18], vote_count: 300, order: 0 },
    { id: 2, title: 'Peli B', release_date: '1991-01-01', genre_ids: [99], vote_count: 300, order: 1 },
  ];
  const items = buildRoleItems({ crew: [], cast }, 'actor', new Set([1]), { keys: new Set(), tmdbIds: new Set(), movieIds: new Set() });
  const stats = roleStats(items, 'actor');
  assert.equal(stats.released, 2);
  assert.equal(stats.owned, 1);
  assert.equal(stats.pct, 50);
});
