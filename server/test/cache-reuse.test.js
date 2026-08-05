import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// base de usar y tirar: estos tests escriben en la caché
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-cache-'));

const { cacheWrite, cacheRead } = await import('../src/db.js');
const { movieDetail } = await import('../src/tmdb.js');

/**
 * La ficha con créditos (`movie_cr:`) es un superset ESTRICTO de la ficha sin
 * ellos (`movie:`): mismo runtime, mismos géneros, mismo cartel. Vivían en dos
 * cachés que no se hablaban, así que en cada palmarés se pedía dos veces la
 * misma película —una por movieDirectors y otra por movieSummary— en la misma
 * ráfaga que ya provocaba los 429 de TMDB.
 */
test('quien no necesita créditos aprovecha la ficha con créditos ya cacheada', async () => {
  cacheWrite('movie_cr:603:es-ES', {
    id: 603, title: 'The Matrix', runtime: 136,
    genres: [{ id: 878 }], poster_path: '/x.jpg', credits: { crew: [] },
  });
  // sin red (la clave de TMDB es falsa en pruebas): si saliera a buscarlo, lanzaría
  const det = await movieDetail(603);
  assert.equal(det.title, 'The Matrix');
  assert.equal(det.runtime, 136);
  assert.equal(det.poster_path, '/x.jpg');
});

test('al revés no: quien pide créditos no se conforma con la ficha pelada', async () => {
  cacheWrite('movie:604:es-ES', { id: 604, title: 'Sin créditos', runtime: 100 });
  await assert.rejects(
    () => movieDetail(604, { withCredits: true }),
    /TMDB|clave|key/i,
    'debe salir a por los créditos en vez de devolver la ficha incompleta'
  );
});

test('sin nada cacheado se sale a la red', async () => {
  await assert.rejects(() => movieDetail(999999), /TMDB|clave|key/i);
});

/**
 * El emparejado verificado de festivales es inmutable («este título, de este
 * año, de esta dirección») y caducaba a los 30 días JUNTO a la página que lo
 * usa: al mes expiraba todo a la vez y reconstruir un palmarés repetía cientos
 * de verificaciones en ráfaga. Ahora vive un año.
 */
test('el emparejado de festivales sobrevive de sobra a la caché de la página', () => {
  const DIA = 24 * 3600 * 1000;
  cacheWrite('film_match:v2:prueba:2020:director', { id: 42 });
  // a los 60 días (el doble de lo que vive la página del palmarés) sigue ahí
  assert.ok(cacheRead('film_match:v2:prueba:2020:director', 365 * DIA), 'debería seguir vivo');
});
