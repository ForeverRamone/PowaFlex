import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

// Una base de antes de esta versión: mdb_ratings con la Σ de 0 que MDBList
// manda cuando aún no tiene votos suficientes, guardada como si fuera una nota.
// En producción eran 62.954 filas de 133.100, y ninguna se volvía a pedir.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));
process.env.DATA_DIR = dir;

const legacy = new Database(path.join(dir, 'powaflex.db'));
legacy.exec(`
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE mdb_ratings (
  tmdb_id INTEGER PRIMARY KEY, imdb REAL, imdb_votes INTEGER, rt_critic INTEGER, rt_audience INTEGER,
  metacritic INTEGER, letterboxd REAL, lb_votes INTEGER, trakt INTEGER, score INTEGER, json TEXT, fetched_at INTEGER
);
INSERT INTO mdb_ratings (tmdb_id, imdb, score, fetched_at) VALUES (1, 7.4, 0, 1000), (2, 6.0, 50, 1000), (3, NULL, NULL, 1000);
`);
legacy.close();

const { db, getSetting } = await import('../src/db.js');

test('la Σ de 0 heredada pasa a NULL una sola vez, y las notas de verdad se quedan', () => {
  const filas = db.prepare('SELECT tmdb_id, imdb, score FROM mdb_ratings ORDER BY tmdb_id').all();
  assert.deepEqual(filas, [
    { tmdb_id: 1, imdb: 7.4, score: null },
    { tmdb_id: 2, imdb: 6, score: 50 },
    { tmdb_id: 3, imdb: null, score: null },
  ]);
  assert.equal(getSetting('mdb_score_cero_migrado'), '1');
});

test('sin Σ, las reglas la vuelven a pedir; con Σ, no', async () => {
  // `refrescarNotasDeReglas` considera fresca una fila con score o mirada hace
  // poco: la fila 1, migrada a NULL y de hace mucho, tiene que entrar en
  // «pendientes» aunque no haya clave para pedirla
  const { refrescarNotasDeReglas } = await import('../src/mdblist.js');
  const r = await refrescarNotasDeReglas([{ tmdb_id: 1 }, { tmdb_id: 2 }]);
  assert.equal(r.motivo, 'sin_api_key');
});

test('la línea de la pasada enseña lo que MDBList sí sabe cuando no hay Σ', async () => {
  const { notaTexto } = await import('../src/rules.js');
  assert.equal(notaTexto({ mdb: { score: 50, imdb: 6 } }), 'Σ 50');
  assert.equal(notaTexto({ mdb: { score: null, imdb: 6, letterboxd: 3.1 } }), 'sin Σ · IMDb 6.0 · LB 3.1');
  assert.equal(notaTexto({ mdb: { score: null, rt_critic: 89 } }), 'sin Σ · RT 89%');
  assert.equal(notaTexto({}), 'sin nota');
});
