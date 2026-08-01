import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { importLetterboxdCsv, rematchLetterboxd } = await import('../src/letterboxd.js');
const { db } = await import('../src/db.js');

const count = (sql, ...args) => db.prepare(sql).get(...args).n;

// regression: UNIQUE (list, title, year, watched_date, uri) never fires when any
// of those columns is NULL (SQLite treats NULLs as distinct), so a watchlist or
// ratings CSV — no watched date, no uri — was re-inserted whole on every import
test('reimportar el mismo CSV no duplica entradas', () => {
  const csv = ['Name,Year', 'The Godfather,1972', 'Amélie,2001', 'Sin año,'].join('\n');

  const first = importLetterboxdCsv(Buffer.from(csv), { filename: 'watchlist.csv' });
  assert.equal(first.imported, 3);
  assert.equal(count('SELECT COUNT(*) n FROM lb_entries'), 3);

  const second = importLetterboxdCsv(Buffer.from(csv), { filename: 'watchlist.csv' });
  assert.equal(second.imported, 0, 'la segunda importación no debe insertar nada');
  assert.equal(count('SELECT COUNT(*) n FROM lb_entries'), 3, 'el contador no se infla');

  // a genuinely new row still gets in
  importLetterboxdCsv(Buffer.from(`${csv}\nStalker,1979`), { filename: 'watchlist.csv' });
  assert.equal(count('SELECT COUNT(*) n FROM lb_entries'), 4);
});

test('la misma película en listas distintas sigue siendo dos entradas', () => {
  importLetterboxdCsv(Buffer.from('Name,Year\nSolaris,1972'), { filename: 'diary.csv' });
  importLetterboxdCsv(Buffer.from('Name,Year,Rating\nSolaris,1972,4.5'), { filename: 'ratings.csv' });
  assert.equal(count("SELECT COUNT(*) n FROM lb_entries WHERE title = 'Solaris'"), 2);
});

test('rematch enlaza por tmdb_id, acepta entradas sin año y limpia las borradas de Plex', () => {
  db.prepare(`INSERT INTO movies (rating_key, title, year, tmdb_id) VALUES (100, 'El padrino', 1972, 238)`).run();
  db.prepare(`INSERT INTO movies (rating_key, title, year) VALUES (101, 'Stalker', 1979)`).run();

  // entrada con tmdb_id pero título en otro idioma: solo enlaza si se usa el id
  db.prepare(
    `INSERT INTO lb_entries (list, title, year, tmdb_id) VALUES ('watched', 'The Godfather Part I', 1972, 238)`
  ).run();
  // entrada sin año (el bucle antiguo la saltaba)
  db.prepare(`INSERT INTO lb_entries (list, title, year) VALUES ('watched', 'Stalker', NULL)`).run();
  // enlace huérfano: la película 999 ya no está en Plex
  db.prepare(
    `INSERT INTO lb_entries (list, title, year, movie_id) VALUES ('watched', 'Peli Borrada', 1990, 999)`
  ).run();

  const res = rematchLetterboxd();

  assert.equal(
    db.prepare(`SELECT movie_id FROM lb_entries WHERE title = 'The Godfather Part I'`).get().movie_id,
    100,
    'debe usar el tmdb_id que ya tenía la entrada'
  );
  assert.equal(
    db.prepare(`SELECT movie_id FROM lb_entries WHERE title = 'Stalker' AND year IS NULL`).get().movie_id,
    101,
    'las entradas sin año también se emparejan'
  );
  assert.equal(
    db.prepare(`SELECT movie_id FROM lb_entries WHERE title = 'Peli Borrada'`).get().movie_id,
    null,
    'el enlace a una película que ya no está en Plex se limpia'
  );
  assert.ok(res.cleared >= 1);
});
