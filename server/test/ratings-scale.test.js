import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { db } = await import('../src/db.js');
const { letterboxdSummary } = await import('../src/letterboxd.js');
const { insights } = await import('../src/mdblist.js');

// Regression: mdb_ratings.letterboxd already arrives on a 0–10 scale from
// MDBList (4.2 stars → 8.4). Doubling it again produced "comunidad 16.8/10"
// everywhere the community rating was shown.
test('la nota de la comunidad de Letterboxd no se reescala', () => {
  db.prepare(
    `INSERT INTO movies (rating_key, title, year, tmdb_id, view_count) VALUES (1, 'Sunset Boulevard', 1950, 999, 1)`
  ).run();
  db.prepare(
    `INSERT INTO mdb_ratings (tmdb_id, letterboxd, score, fetched_at) VALUES (999, 8.4, 91, 0)`
  ).run();
  db.prepare(
    `INSERT INTO lb_entries (list, title, year, rating, watched_date, uri, movie_id)
     VALUES ('ratings', 'Sunset Boulevard', 1950, 4.5, '2026-01-01', 'u/1', 1)`
  ).run();

  const { ratingCompare } = letterboxdSummary();
  const row = ratingCompare.find((r) => r.rating_key === 1);
  assert.equal(row.community, 8.4, 'tal cual llega de MDBList, sin ×2');
  assert.equal(row.lb, 9, 'la tuya sí se dobla: 4,5 estrellas sobre 5 son 9 sobre 10');
  assert.ok(row.community <= 10 && row.lb <= 10, 'ninguna nota puede pasar de 10');
});

test('la discrepancia con la comunidad compara dos escalas 0–10', () => {
  // 2 estrellas (=4/10) frente a un 9,0 de la comunidad: |4 − 9| = 5 ≥ 3
  db.prepare(
    `INSERT INTO movies (rating_key, title, year, tmdb_id, view_count) VALUES (2, 'Otra peli', 2000, 998, 1)`
  ).run();
  db.prepare(`INSERT INTO mdb_ratings (tmdb_id, letterboxd, score, fetched_at) VALUES (998, 9.0, 88, 0)`).run();
  db.prepare(
    `INSERT INTO lb_entries (list, title, year, rating, watched_date, uri, movie_id)
     VALUES ('ratings', 'Otra peli', 2000, 2, '2026-01-02', 'u/2', 2)`
  ).run();

  const { letterboxdDivergence } = insights();
  const row = letterboxdDivergence.find((r) => r.rating_key === 2);
  assert.ok(row, 'una diferencia de 5 puntos tiene que salir en la lista');
  assert.equal(row.my_rating, 4);
  assert.equal(row.letterboxd, 9);

  // …y la que casa con la comunidad NO sale (antes el ×2 la colaba siempre)
  assert.equal(letterboxdDivergence.some((r) => r.rating_key === 1), false);
});
