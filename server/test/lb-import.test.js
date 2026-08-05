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

/**
 * El CSV «formato Letterboxd» que exporta WebTools-NG (el que usa Ramón para
 * sacar de Plex lo que no está en el export oficial) trae la nota en `rating10`
 * —de 0 a 10— en vez del `Rating` de 0 a 5 de Letterboxd. Media app espera la
 * escala de estrellas, así que si esa división por dos se cae, todas las notas
 * importadas por esta vía salen al doble y contaminan joyas, discrepancias y el
 * ranking de Visionado. No tenía prueba.
 */
test('el CSV de WebTools trae rating10 (0-10) y se guarda en estrellas (0-5)', () => {
  const csv = [
    'Name,Year,rating10,tmdbID',
    'Amanece que no es poco,1989,9,54123',
    'Sin nota,1990,,54124',
  ].join('\n');
  importLetterboxdCsv(Buffer.from(csv), { filename: 'webtools-export.csv' });

  const fila = db.prepare("SELECT rating FROM lb_entries WHERE title = 'Amanece que no es poco'").get();
  assert.equal(fila.rating, 4.5, 'un 9 sobre 10 son 4,5 estrellas');

  const vacia = db.prepare("SELECT rating FROM lb_entries WHERE title = 'Sin nota'").get();
  assert.equal(vacia.rating, null, 'sin nota se queda sin nota, no en cero');
});

test('la columna Rating de Letterboxd (0-5) se guarda tal cual', () => {
  const csv = ['Name,Year,Rating', 'El espíritu de la colmena,1973,4.5'].join('\n');
  importLetterboxdCsv(Buffer.from(csv), { filename: 'ratings.csv' });
  const fila = db.prepare("SELECT rating FROM lb_entries WHERE title = 'El espíritu de la colmena'").get();
  assert.equal(fila.rating, 4.5, 'la escala de estrellas no se toca');
});

test('un CSV con rating10 se detecta como lista de notas', () => {
  const r = importLetterboxdCsv(Buffer.from('Name,Year,rating10\nOtra,2001,7'), { filename: 'sin-pistas.csv' });
  assert.equal(r.list, 'ratings');
});

/**
 * La caché negativa de MDBList (una fila vacía para lo que MDBList no conoce,
 * para no volver a pedirlo eternamente) no puede colarse en la cobertura que
 * enseña Salud: si contara, diría «423 de 423 con notas» teniendo cero.
 */
test('las filas vacías de la caché negativa no cuentan como «con notas»', async () => {
  const { ratingsCoverage } = await import('../src/mdblist.js');
  db.prepare('DELETE FROM movies').run();
  db.prepare('DELETE FROM mdb_ratings').run();
  db.prepare("INSERT INTO movies (rating_key, title, tmdb_id) VALUES (1, 'Con notas', 111), (2, 'Sin notas', 222)").run();
  // una con nota de verdad y otra que MDBList no conoce
  db.prepare('INSERT INTO mdb_ratings (tmdb_id, score, fetched_at) VALUES (111, 78, ?)').run(Date.now());
  db.prepare('INSERT INTO mdb_ratings (tmdb_id, fetched_at) VALUES (222, ?)').run(Date.now());

  const c = ratingsCoverage();
  assert.equal(c.total, 2);
  assert.equal(c.withRatings, 1, 'solo la que de verdad tiene nota');
});
