import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { buildRoleItems, roleStats, classifyGenres } = await import('../src/tmdb.js');

const NO_WATCHED = { keys: new Set(), tmdbIds: new Set(), movieIds: new Set() };

// Regression: Favoritos counted every released credit while the person page
// counted features only, so a director with all 50 features showed "te faltan 2"
// on one screen and "100%" on the other.
test('el completismo de dirección ignora cortos, telefilmes y documentales', () => {
  const credits = {
    crew: [
      { id: 1, job: 'Director', title: 'Largo que tengo', release_date: '1990-01-01', genre_ids: [18], vote_count: 500 },
      { id: 2, job: 'Director', title: 'Otro largo que tengo', release_date: '1995-01-01', genre_ids: [35], vote_count: 400 },
      { id: 3, job: 'Director', title: 'Corto suyo', release_date: '1998-01-01', genre_ids: [18], vote_count: 30 },
      { id: 4, job: 'Director', title: 'Documental suyo', release_date: '2000-01-01', genre_ids: [99], vote_count: 40 },
      { id: 5, job: 'Director', title: 'Telefilme suyo', release_date: '2002-01-01', genre_ids: [10770], vote_count: 20 },
    ],
    cast: [],
  };
  const inLib = new Set([1, 2]); // owns both features, none of the noise
  const items = buildRoleItems(credits, 'director', inLib, { keys: new Set(), tmdbIds: new Set(), movieIds: new Set() });
  // enrichRuntimes would set this from TMDB; set it by hand to stay offline
  items.find((i) => i.tmdb_id === 3).isShort = true;

  const stats = roleStats(items, 'director');
  assert.equal(stats.released, 2, 'solo los dos largometrajes cuentan');
  assert.equal(stats.owned, 2);
  assert.equal(stats.pct, 100, 'filmografía completa aunque falten corto/doc/TV');
  assert.equal(Math.max(0, stats.released - stats.owned), 0, 'no puede decir "te faltan"');
  assert.equal(stats.excludedFromCompletion, 3);
});

test('un documentalista sí cuenta sus documentales', () => {
  const crew = Array.from({ length: 6 }, (_, i) => ({
    id: 100 + i, job: 'Director', title: `Doc ${i}`, release_date: `20${10 + i}-01-01`, genre_ids: [99], vote_count: 100,
  }));
  const items = buildRoleItems({ crew, cast: [] }, 'director', new Set(), NO_WATCHED);
  const stats = roleStats(items, 'director');
  assert.equal(stats.documentarian, true);
  assert.equal(stats.released, 6, 'con >5 documentales dirigidos, cuentan todos');
});

// El umbral bajó de ">5" a ">=4" a petición de Ramón: con 4 documentales ya se
// considera parte de la obra, no un desvío.
test('bastan 4 documentales para ser documentalista', () => {
  const doc = (i) => ({ id: 200 + i, job: 'Director', title: `Doc ${i}`, release_date: `20${10 + i}-01-01`, genre_ids: [99], vote_count: 100 });
  const tres = buildRoleItems({ crew: [doc(0), doc(1), doc(2)], cast: [] }, 'director', new Set(), NO_WATCHED);
  assert.equal(roleStats(tres, 'director').documentarian, false);
  const cuatro = buildRoleItems({ crew: [doc(0), doc(1), doc(2), doc(3)], cast: [] }, 'director', new Set(), NO_WATCHED);
  assert.equal(roleStats(cuatro, 'director').documentarian, true);
});

// «Música» solo debe capturar conciertos (Música + Documental en TMDB): un
// musical lleva el género Música a secas y es una película como cualquier otra.
test('un concierto es «música»; un musical no', () => {
  assert.deepEqual(
    (({ isMusic, isDocumentary }) => ({ isMusic, isDocumentary }))(classifyGenres({}, [10402, 99])),
    { isMusic: true, isDocumentary: false },
    'el concierto sale del cubo de documentales para no inflar el conteo de documentalista'
  );
  const musical = classifyGenres({}, [10402, 10749]);
  assert.equal(musical.isMusic, false);
  assert.equal(musical.isDocumentary, false);
});

test('los conciertos sueltos no cuentan para el completismo, los de un concertista sí', () => {
  const largo = { id: 1, job: 'Director', title: 'Largo', release_date: '1990-01-01', genre_ids: [18], vote_count: 500 };
  const concierto = (i) => ({
    id: 300 + i, job: 'Director', title: `Concierto ${i}`, release_date: `20${10 + i}-01-01`, genre_ids: [10402, 99], vote_count: 80,
  });
  const suelto = buildRoleItems({ crew: [largo, concierto(0), concierto(1)], cast: [] }, 'director', new Set([1]), NO_WATCHED);
  const s1 = roleStats(suelto, 'director');
  assert.equal(s1.released, 1, 'solo el largometraje entra en el cómputo');
  assert.equal(s1.pct, 100);
  assert.equal(s1.concertFilmmaker, false);

  const crew = [largo, ...[0, 1, 2, 3].map(concierto)];
  const s2 = roleStats(buildRoleItems({ crew, cast: [] }, 'director', new Set([1]), NO_WATCHED), 'director');
  assert.equal(s2.concertFilmmaker, true);
  assert.equal(s2.released, 5, 'quien vive del concierto se mide también por ellos');
});

test('el completismo de interpretación cuenta todo lo estrenado', () => {
  const cast = [
    { id: 1, title: 'Peli A', release_date: '1990-01-01', genre_ids: [18], vote_count: 300, order: 0 },
    { id: 2, title: 'Peli B', release_date: '1991-01-01', genre_ids: [99], vote_count: 300, order: 1 },
  ];
  const items = buildRoleItems({ crew: [], cast }, 'actor', new Set([1]), { keys: new Set(), tmdbIds: new Set(), movieIds: new Set() });
  const stats = roleStats(items, 'actor');
  assert.equal(stats.released, 2);
  assert.equal(stats.owned, 1);
  assert.equal(stats.pct, 50);
});
