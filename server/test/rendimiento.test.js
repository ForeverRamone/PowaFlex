import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// aislar la base que toca este proceso de prueba
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { podarDatosDeTrabajo } = await import('../src/discover.js');
const { mapPool, cedeElHilo } = await import('../src/pool.js');
const { imdbInfo } = await import('../src/imdb.js');
const { db, getSetting } = await import('../src/db.js');

// una película tal y como la deja enrichRuntimes: lo que se pinta y, pegado,
// lo que el servidor usó para decidir
const PELICULA = () => ({
  tmdb_id: 68, title: 'Brazil', original_title: 'Brazil', date: '1985-02-20',
  released: true, owned: false, watched: false, poster_path: '/b.jpg',
  vote: 7.7, votes: 6200,
  isCameo: false, isShort: false, isCoral: false, isMusic: false,
  isDocumentary: false, isTvMovie: false,
  mdb: { score: 82, imdb: 7.9 },
  // datos de trabajo
  original_language: 'en', countries: ['GB'], imdb_id: 'tt0088846',
  runtime: 132, genre_ids: [18, 878], character: null, job: 'Director',
  popularity: 24.5, directorCount: 1,
});

test('la parrilla no manda los datos de trabajo del servidor', () => {
  const [f] = podarDatosDeTrabajo([PELICULA()]);
  for (const campo of [
    'original_language', 'countries', 'imdb_id', 'runtime', 'genre_ids',
    'character', 'job', 'popularity', 'directorCount',
  ]) {
    assert.ok(!(campo in f), `${campo} sigue viajando al navegador`);
  }
});

test('poda lo de trabajo pero NO lo que pinta la tarjeta', () => {
  const [f] = podarDatosDeTrabajo([PELICULA()]);
  // lo que leen TmdbCard, los filtros de tipo, el listón Σ y las ordenaciones
  for (const campo of [
    'tmdb_id', 'title', 'date', 'poster_path', 'watched', 'owned', 'votes',
    'isShort', 'isDocumentary', 'isMusic', 'isTvMovie', 'isCoral', 'isCameo',
  ]) {
    assert.ok(campo in f, `falta ${campo}, que la tarjeta sí usa`);
  }
  assert.equal(f.mdb.score, 82, 'la nota Σ es la que ordena las parrillas');
  // la duración se va, pero su conclusión se queda: sin isShort, los cortos
  // dejarían de poder filtrarse en el navegador
  assert.equal(f.isShort, false);
  assert.equal(podarDatosDeTrabajo(undefined), undefined, 'sin lista no revienta');
});

test('un recorrido largo con todo cacheado NO deja al servidor mudo', async () => {
  // El fallo real: estos bucles son async, pero si nada espera de verdad, Node
  // vacía la cola de microtareas ENTERA antes de volver a mirar los sockets, y
  // la aplicación se congela mientras Descubrir se reconstruye (medido: 11,6 s
  // para un /api/version durante una reconstrucción de 12 s).
  //
  // La prueba: una petición que llegara al empezar —aquí, una macrotarea— tiene
  // que atenderse ANTES de que el recorrido termine, no después.
  let terminado = false;
  let atendidaConElBucleEnMarcha = null;
  const recorrido = mapPool(Array.from({ length: 400 }, (_, i) => i), 5, async (n) => n * 2)
    .then(() => { terminado = true; });
  setImmediate(() => { atendidaConElBucleEnMarcha = !terminado; });
  await recorrido;
  assert.equal(atendidaConElBucleEnMarcha, true, 'el recorrido no soltó el hilo hasta acabar');
});

test('cedeElHilo devuelve el turno de verdad', async () => {
  let despues = false;
  setImmediate(() => { despues = true; });
  await cedeElHilo();
  assert.equal(despues, true);
});

test('el recuento de notas de IMDb se cuenta una vez y se apunta', () => {
  db.prepare("INSERT OR REPLACE INTO imdb_ratings (tconst, rating, votes) VALUES ('tt1', 8.1, 900)").run();
  db.prepare("INSERT OR REPLACE INTO imdb_ratings (tconst, rating, votes) VALUES ('tt2', 6.4, 120)").run();
  assert.equal(getSetting('imdb_ratings_rows'), null, 'aún no se ha preguntado');
  assert.equal(imdbInfo().rows, 2);
  assert.equal(getSetting('imdb_ratings_rows'), '2', 'queda apuntado para no recorrer 1,7 millones de filas en cada Ajustes');
  // desde aquí sale de lo apuntado: solo la importación vuelve a contar
  db.prepare("INSERT OR REPLACE INTO imdb_ratings (tconst, rating, votes) VALUES ('tt3', 5.0, 10)").run();
  assert.equal(imdbInfo().rows, 2);
});
