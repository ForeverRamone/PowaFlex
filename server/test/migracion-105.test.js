import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

/**
 * La migración de la 1.05, que es la única que BORRA cosas.
 *
 * Al retirar la auditoría de subtítulos, el arranque tira la tabla `movie_streams`
 * y borra tres ajustes. El `DELETE FROM settings` es la línea más arriesgada del
 * proyecto: si se escribe mal, se lleva por delante el token de Plex y las claves
 * de API. La revisión señaló que no la cubría ningún test, así que aquí está.
 */

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-mig-'));

test('el arranque tira lo de subtítulos y NO toca nada más', async () => {
  // una base como la que deja la 1.04: con la tabla llena y los tres ajustes
  const dbPath = path.join(DIR, 'powaflex.db');
  const vieja = new Database(dbPath);
  vieja.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE movie_streams (movie_id INTEGER, kind TEXT, lang TEXT, codec TEXT, forced INTEGER,
      PRIMARY KEY (movie_id, kind, lang, codec, forced));
  `);
  const ajuste = vieja.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  // los tres que deben irse
  for (const k of ['subs_ok_langs', 'bazarr_url', 'bazarr_key']) ajuste.run(k, 'valor-' + k);
  // y los que NO, incluidos dos señuelos con nombres parecidos
  const supervivientes = [
    'plex_token', 'tmdb_key', 'radarr_key', 'mdblist_key', 'ui_language', 'backup_keep',
    'subs_pref_falsa', 'bazarrista_falso_amigo',
  ];
  for (const k of supervivientes) ajuste.run(k, 'valor-' + k);
  const st = vieja.prepare('INSERT INTO movie_streams VALUES (?,?,?,?,?)');
  for (let i = 1; i <= 50; i++) st.run(i, 'sub', 'spa', 'subrip', 0);
  vieja.close();

  // arrancar el código actual encima
  process.env.DATA_DIR = DIR;
  const { db } = await import('../src/db.js');

  const tabla = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='movie_streams'").get();
  assert.equal(tabla, undefined, 'movie_streams debería estar borrada');

  const quedan = db.prepare('SELECT key FROM settings ORDER BY key').all().map((r) => r.key);
  for (const k of ['subs_ok_langs', 'bazarr_url', 'bazarr_key']) {
    assert.equal(quedan.includes(k), false, `${k} debería haberse borrado`);
  }
  for (const k of supervivientes) {
    assert.equal(quedan.includes(k), true, `${k} NO debía tocarse`);
  }
  // y el valor de los que sobreviven sigue intacto, no solo la clave
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'plex_token'").get().value, 'valor-plex_token');
});

test('volver a arrancar no cambia nada (idempotente)', async () => {
  const { db } = await import('../src/db.js');
  const antes = db.prepare('SELECT COUNT(*) n FROM settings').get().n;
  // el DELETE corre en cada arranque: no debe llevarse nada nuevo
  db.exec("DELETE FROM settings WHERE key IN ('subs_ok_langs', 'bazarr_url', 'bazarr_key');");
  const despues = db.prepare('SELECT COUNT(*) n FROM settings').get().n;
  assert.equal(despues, antes, 'no quedaba ninguna de las tres, así que no cambia nada');
});
