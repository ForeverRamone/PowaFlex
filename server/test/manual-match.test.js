import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-match-'));
const { db } = await import('../src/db.js');
const { resolvePerson } = await import('../src/tmdb.js');

/**
 * El corrector manual es la última palabra: existe justo para los casos que
 * ninguna regla va a acertar (dos personas con el mismo nombre, alguien con la
 * obra repartida en dos fichas de TMDB, una película que Plex identificó con el
 * guid de otra). Si un automatismo puede pisarlo, no sirve de nada.
 */

test('el emparejado manual de una película sobrevive a la sincronización de Plex', () => {
  db.prepare("INSERT INTO movies (rating_key, title, tmdb_id, updated_at) VALUES (900, 'Una peli', 111, 1)").run();
  db.prepare('UPDATE movies SET tmdb_id = 222, tmdb_locked = 1 WHERE rating_key = 900').run();

  // el UPSERT tal cual lo hace plex.js cuando vuelve a ver la película
  const upsert = db.prepare(`
    INSERT INTO movies (rating_key, title, tmdb_id, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(rating_key) DO UPDATE SET
      tmdb_id = CASE WHEN movies.tmdb_locked = 1 THEN movies.tmdb_id ELSE excluded.tmdb_id END`);

  upsert.run(900, 'Una peli', 333, 2);
  assert.equal(db.prepare('SELECT tmdb_id FROM movies WHERE rating_key = 900').get().tmdb_id, 222,
    'Plex no puede pisar lo que fijaste a mano');

  // al quitar el bloqueo, Plex vuelve a mandar
  db.prepare('UPDATE movies SET tmdb_locked = 0 WHERE rating_key = 900').run();
  upsert.run(900, 'Una peli', 333, 3);
  assert.equal(db.prepare('SELECT tmdb_id FROM movies WHERE rating_key = 900').get().tmdb_id, 333);
});

test('a una persona emparejada a mano no se le vuelve a buscar ficha', async () => {
  db.prepare("INSERT INTO people (id, name, tmdb_id, tmdb_verified, tmdb_locked) VALUES (900, 'John Woo', 444, 0, 1)").run();
  // sin clave de TMDB, cualquier intento de re-resolver lanzaría: si esto
  // devuelve la ficha fijada es que ni lo intentó
  const p = await resolvePerson(900);
  assert.equal(p.tmdb_id, 444);
  assert.equal(p.tmdb_locked, 1);
});

test('sin bloqueo, una persona sin verificar sí se reintenta', async () => {
  db.prepare("INSERT INTO people (id, name, tmdb_id, tmdb_verified) VALUES (901, 'Sin bloquear', 555, 0)").run();
  // tiene películas en la biblioteca, así que resolvePerson intenta verificar
  db.prepare("INSERT INTO movies (rating_key, title, tmdb_id) VALUES (901, 'Suya', 777)").run();
  db.prepare("INSERT INTO movie_people (movie_id, person_id, role) VALUES (901, 901, 'director')").run();
  // la clave de TMDB no está puesta: el intento falla y se apunta la fecha
  await resolvePerson(901);
  const p = db.prepare('SELECT tmdb_checked_at FROM people WHERE id = 901').get();
  assert.ok(p.tmdb_checked_at, 'debe quedar constancia del intento');
});
