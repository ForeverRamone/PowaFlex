import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { matchMovie } = await import('../src/letterboxd.js');
const { pickSearchResult } = await import('../src/tmdb.js');
const { db } = await import('../src/db.js');

test('matchMovie encuentra por el título inglés de TMDB (english_title)', () => {
  db.prepare(
    `INSERT INTO movies (rating_key, title, original_title, english_title, year, tmdb_id)
     VALUES (1, 'Parásitos', '기생충', 'Parasite', 2019, 496243)`
  ).run();
  db.prepare(
    `INSERT INTO movies (rating_key, title, original_title, english_title, year)
     VALUES (2, 'Masacre: ven y mira', 'Иди и смотри', 'Come and See', 1985)`
  ).run();

  // English (Letterboxd list) title now matches a third-language film
  assert.equal(matchMovie({ title: 'Parasite', year: 2019 }), 1);
  assert.equal(matchMovie({ title: 'Come and See', year: 1985 }), 2);
  // Spanish and TMDB-id paths keep working
  assert.equal(matchMovie({ title: 'Parásitos', year: 2019 }), 1);
  assert.equal(matchMovie({ title: 'cualquier cosa', year: 1990, tmdbId: 496243 }), 1);
  // original title with only non-latin chars must not create a wildcard entry
  assert.equal(matchMovie({ title: 'otra película', year: 2019 }), null);
});

test('pickSearchResult prefiere el match exacto de título dentro del año', () => {
  const results = [
    { id: 10, title: 'Mirror Mirror', original_title: 'Mirror Mirror', release_date: '2012-03-30' },
    { id: 11, title: 'The Mirror', original_title: 'Зеркало', release_date: '1975-03-07' },
  ];
  assert.equal(pickSearchResult(results, 'Mirror', 1975)?.id, 11);
  assert.equal(pickSearchResult(results, 'Mirror Mirror', 2012)?.id, 10);
  // con año y ningún candidato cercano, mejor null que una película equivocada
  assert.equal(pickSearchResult(results, 'Mirror', 2050), null);
  // sin año: match exacto de título antes que el orden de TMDB
  assert.equal(pickSearchResult(results, 'The Mirror')?.id, 11);
  assert.equal(pickSearchResult([], 'X'), null);
});
