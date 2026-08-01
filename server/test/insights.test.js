import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { insights } = await import('../src/mdblist.js');
const { db } = await import('../src/db.js');

// regression: "consenso que tienes sin ver" only looked at Plex view_count, so
// films watched (and even rated) on Letterboxd showed up as unwatched
test('consensusUnwatched respeta las vistas de Letterboxd, no solo las de Plex', () => {
  const movie = db.prepare('INSERT INTO movies (rating_key, title, year, tmdb_id, view_count) VALUES (?, ?, ?, ?, ?)');
  movie.run(1, 'El padrino', 1972, 238, 0);       // watched on Letterboxd only
  movie.run(2, 'Shoah', 1985, 405, 0);            // genuinely unwatched
  movie.run(3, 'Casablanca', 1942, 289, 2);       // watched in Plex
  const rating = db.prepare('INSERT INTO mdb_ratings (tmdb_id, score) VALUES (?, ?)');
  rating.run(238, 93);
  rating.run(405, 91);
  rating.run(289, 91);
  // a Letterboxd rating entry matched to the library film
  db.prepare(
    `INSERT INTO lb_entries (list, title, year, rating, movie_id) VALUES ('ratings', 'The Godfather', 1972, 5, 1)`
  ).run();

  const titles = insights().consensusUnwatched.map((m) => m.title);
  assert.deepEqual(titles, ['Shoah'], 'solo lo realmente sin ver');
  assert.ok(!titles.includes('El padrino'), 'vista en Letterboxd no puede salir como sin ver');
  assert.ok(!titles.includes('Casablanca'), 'vista en Plex no puede salir como sin ver');
});
