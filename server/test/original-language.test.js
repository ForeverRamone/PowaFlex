import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { db, setSetting } = await import('../src/db.js');
const { backfillOriginalLanguages } = await import('../src/tmdb.js');

/**
 * El idioma original de la biblioteca.
 *
 * En la 1.04 la columna se creó, la auditoría de subtítulos la leía… y NADIE la
 * escribía: el criterio «VO» acusaba al 100 % de la colección y la auditoría de
 * doblaje no podía detectar nada nunca. Lo cazaron dos revisores a la vez, y el
 * primer arreglo TAMPOCO persistía. De ahí este test.
 */
test('el relleno guarda el idioma original en la tabla movies', async () => {
  setSetting('tmdb_key', 'falsa'); // no se llega a usar: el detalle está cacheado
  db.prepare("INSERT INTO movies (rating_key, title, tmdb_id, full_synced) VALUES (1, 'Japonesa', 550, 1)").run();
  db.prepare("INSERT INTO movies (rating_key, title, tmdb_id, full_synced) VALUES (2, 'Francesa', 551, 1)").run();
  // sin id de TMDB no hay nada que resolver: no debe contarse como pendiente
  db.prepare("INSERT INTO movies (rating_key, title, full_synced) VALUES (3, 'Sin ficha', 1)").run();

  const cache = db.prepare('INSERT INTO tmdb_cache (key, json, fetched_at) VALUES (?, ?, ?)');
  // la clave lleva el idioma de los datos: sembrarla sin él fue el fallo de la
  // primera comprobación, y por poco da el arreglo por bueno estando roto
  cache.run('movie:550:es-ES', JSON.stringify({ id: 550, original_language: 'ja', genres: [] }), Date.now());
  cache.run('movie:551:es-ES', JSON.stringify({ id: 551, original_language: 'fr', genres: [] }), Date.now());

  const r = await backfillOriginalLanguages({ budget: 10 });
  assert.equal(r.done, 2);
  assert.equal(r.pending, 0);

  const filas = db.prepare('SELECT rating_key, original_language FROM movies ORDER BY rating_key').all();
  assert.equal(filas[0].original_language, 'ja');
  assert.equal(filas[1].original_language, 'fr');
  assert.equal(filas[2].original_language, null);
});

test('lo ya resuelto no se vuelve a pedir', async () => {
  const r = await backfillOriginalLanguages({ budget: 10 });
  assert.equal(r.done, 0, 'no debería tocar las que ya tienen idioma');
  assert.equal(r.pending, 0);
});
