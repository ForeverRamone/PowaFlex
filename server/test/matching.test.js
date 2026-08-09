import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { matchMovie } = await import('../src/letterboxd.js');
const { pickSearchResult } = await import('../src/tmdb.js');
const { db } = await import('../src/db.js');

test('matchMovie encuentra por el título inglés de TMDB (english_title)', () => {
  db.prepare(
    `INSERT INTO movies (rating_key, title, original_title, english_title, year, tmdb_id)
     VALUES (1, 'Parásitos', '기생충', 'Parasite', 2019, 496243)`
  ).run();
  db.prepare(
    `INSERT INTO movies (rating_key, title, original_title, english_title, year)
     VALUES (2, 'Masacre: ven y mira', 'Иди и смотри', 'Come and See', 1985)`
  ).run();

  // English (Letterboxd list) title now matches a third-language film
  assert.equal(matchMovie({ title: 'Parasite', year: 2019 }), 1);
  assert.equal(matchMovie({ title: 'Come and See', year: 1985 }), 2);
  // Spanish and TMDB-id paths keep working
  assert.equal(matchMovie({ title: 'Parásitos', year: 2019 }), 1);
  assert.equal(matchMovie({ title: 'cualquier cosa', year: 1990, tmdbId: 496243 }), 1);
  // original title with only non-latin chars must not create a wildcard entry
  assert.equal(matchMovie({ title: 'otra película', year: 2019 }), null);
});

test('pickSearchResult prefiere el match exacto de título dentro del año', () => {
  const results = [
    { id: 10, title: 'Mirror Mirror', original_title: 'Mirror Mirror', release_date: '2012-03-30' },
    { id: 11, title: 'The Mirror', original_title: 'Зеркало', release_date: '1975-03-07' },
  ];
  assert.equal(pickSearchResult(results, 'Mirror', 1975)?.id, 11);
  assert.equal(pickSearchResult(results, 'Mirror Mirror', 2012)?.id, 10);
  // con año y ningún candidato cercano, mejor null que una película equivocada
  assert.equal(pickSearchResult(results, 'Mirror', 2050), null);
  // sin año: match exacto de título antes que el orden de TMDB
  assert.equal(pickSearchResult(results, 'The Mirror')?.id, 11);
  assert.equal(pickSearchResult([], 'X'), null);
});

/**
 * Los cánones y los palmareses fechan por PRODUCCIÓN o por estreno en festival;
 * TMDB, por estreno comercial. «Beau travail» es 1998 para Sight & Sound y 2000
 * para TMDB, y «Partie de campagne» se rodó en 1936 y se estrenó en 1946. Con
 * la ventana de ±1 año esos candidatos ni se miraban: la película se quedaba
 * sin ficha aunque el corrector manual la encontrase a la primera.
 */
test('un clásico fechado dos años antes empareja si el título y la dirección cuadran', async () => {
  const { elegirCandidato } = await import('../src/festivals.js');
  const candidatos = [
    { id: 11, title: 'Buen trabajo', original_title: 'Beau Travail', date: '2000-02-16' },
  ];
  const dirsDe = async (id) => (id === 11 ? ['Claire Denis'] : []);
  const r = await elegirCandidato(
    { title: 'Beau travail', director: 'Claire Denis' }, 1998, candidatos, new Set(), dirsDe
  );
  assert.equal(r.tmdbId, 11);
});

test('…pero fuera de la ventana se exigen LAS DOS pruebas, no una', async () => {
  const { elegirCandidato } = await import('../src/festivals.js');
  const dirsDe = async () => ['Otro Director'];
  // título clavado pero dirección que NO cuadra: sigue sin ficha
  const soloTitulo = await elegirCandidato(
    { title: 'Beau travail', director: 'Claire Denis' }, 1998,
    [{ id: 22, title: 'Beau travail', original_title: 'Beau travail', date: '2010-01-01' }],
    new Set(), dirsDe
  );
  assert.equal(soloTitulo.tmdbId, null);

  // dirección que cuadra pero título distinto: tampoco
  const soloDirector = await elegirCandidato(
    { title: 'Beau travail', director: 'Claire Denis' }, 1998,
    [{ id: 33, title: 'Otra cosa', original_title: 'Something Else', date: '2010-01-01' }],
    new Set(), async () => ['Claire Denis']
  );
  assert.equal(soloDirector.tmdbId, null);
});

test('un fallo de red en la segunda vuelta NO deja emparejar a ciegas', async () => {
  const { elegirCandidato } = await import('../src/festivals.js');
  const r = await elegirCandidato(
    { title: 'Beau travail', director: 'Claire Denis' }, 1998,
    [{ id: 44, title: 'Beau travail', original_title: 'Beau travail', date: '2010-01-01' }],
    new Set(), async () => null
  );
  assert.equal(r.tmdbId, null);
  assert.equal(r.fallosRed, true);
});
