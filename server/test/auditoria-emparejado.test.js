import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { directorsMatch, elegirCandidato, peliculaPorDirector, festivalOverrideKey, marcarGanadoras } = await import(
  '../src/festivals.js'
);
const { pickSearchResult, esSerieEnTmdb, tmdbGet } = await import('../src/tmdb.js');
const { needsLatin } = await import('../src/titles.js');
const { normName } = await import('../src/names.js');
const { setSetting } = await import('../src/db.js');
const { DIRECTORS_2026 } = await import('../src/data/directors-2026.js');

/**
 * Auditoría del emparejado: la causa común de todo lo de aquí es una clave
 * normalizada VACÍA —un título o un nombre en otro alfabeto, o «—», «N/A»,
 * «?»— tratada como clave válida. Vacío casa con vacío, y `x.includes('')` es
 * siempre cierto. Regla: sin letras que comparar, no casa.
 */

// --- 1. directorsMatch ------------------------------------------------------

test('directorsMatch: una dirección que no se puede comparar NO verifica', () => {
  for (const w of ['—', 'N/A', 'TBA', '?', 'Андрей Тарковский', '王兵', 'Ozu', '  ']) {
    assert.equal(directorsMatch(w, ['Steven Spielberg']), false, `«${w}» no prueba nada`);
  }
});

test('directorsMatch: sin director en la celda sigue pasando', () => {
  assert.ok(directorsMatch(null, ['Cualquiera']));
  assert.ok(directorsMatch('', ['Cualquiera']));
  assert.ok(directorsMatch(undefined, []));
});

test('directorsMatch: los mononombres cortos se comparan enteros', () => {
  assert.ok(directorsMatch('Sia', ['Sia']));
  assert.ok(directorsMatch('Sia', ['Otra Persona', 'Sia']));
  assert.equal(directorsMatch('Sia', ['Siam Ruiz']), false, 'un corto no vale como prefijo de otro');
  assert.equal(directorsMatch('Ozu', ['Yasujirō Ozu']), false, 'un corto solo casa con el nombre entero');
  // un trozo corto que sobra no estorba a los nombres de verdad de la celda
  assert.ok(directorsMatch('Martin Luther King, Jr.', ['Martin Luther King']));
});

test('directorsMatch: el mismo nombre en el mismo alfabeto sí es prueba', () => {
  assert.ok(directorsMatch('王兵', ['王兵']));
  assert.ok(directorsMatch('Андрей Тарковский', ['Andrei Tarkovsky', 'Андрей Тарковский']));
  assert.equal(directorsMatch('Андрей Тарковский', ['Андрей Звягинцев']), false);
});

test('elegirCandidato: una celda «—» o en cirílico no deja colar la ficha de otra', async () => {
  const fila = { title: 'The Cremator', original_title: 'Spalovač mrtvol', director: '—' };
  const cands = [{ id: 1, title: 'Cremator Nights', original_title: 'Cremator Nights', date: '1972-01-01', votes: 3 }];
  const r = await elegirCandidato(fila, 1972, cands, new Set(), async () => ['Joe Nobody']);
  assert.equal(r.tmdbId, null);

  const fila2 = { title: 'Solaris', original_title: 'Солярис', director: 'Андрей Тарковский' };
  const c2 = [
    { id: 7, title: 'Solaris', original_title: 'Solaris', date: '2002-11-27', votes: 2000 },
    { id: 8, title: 'Solaris Rising', original_title: 'x', date: '1972-03-01', votes: 1 },
  ];
  const r2 = await elegirCandidato(fila2, 1972, c2, new Set(), async (id) => (id === 7 ? ['Steven Soderbergh'] : ['Fulano Mengano']));
  assert.equal(r2.tmdbId, null);
});

test('marcarGanadoras: «Music» de Sia se corona, y una celda «—» no corona a nadie', () => {
  const films = [{ title: 'Music', director: 'Sia' }, { title: 'Otra', director: 'Fulano Mengano' }];
  marcarGanadoras(films, [{ title: 'Music', director: 'Sia' }]);
  assert.equal(films.find((f) => f.title === 'Music').winner, true);

  const f2 = [{ title: 'Dreams', director: 'Michel Franco' }];
  marcarGanadoras(f2, [{ title: 'Dreams', director: '—' }]);
  assert.ok(!f2[0].winner);
  const f3 = [{ title: 'Dreams', director: 'Michel Franco' }];
  marcarGanadoras(f3, [{ title: 'Dreams', director: 'Sia' }]);
  assert.ok(!f3[0].winner);
});

// --- 2. peliculaPorDirector -------------------------------------------------

test('peliculaPorDirector: un título sin letras latinas no casa con cualquier película suya', async () => {
  const deps = (crew) => ({
    personasPosibles: async () => [{ id: 99 }],
    creditosDe: async () => ({ crew }),
    tituloIngles: async () => null,
  });
  const r = await peliculaPorDirector(
    { title: '鐵西區', year: 2003, director: 'Wang Bing' },
    deps([
      { id: 501, job: 'Director', title: '夹边沟', original_title: '夹边沟', release_date: '2010-09-01' },
      { id: 502, job: 'Director', title: '和凤鸣', original_title: '和凤鸣', release_date: '2007-05-01' },
    ])
  );
  assert.equal(r, null);
  const r2 = await peliculaPorDirector(
    { title: '?', year: 2015, director: 'Wang Bing' },
    deps([{ id: 601, job: 'Director', title: '!', original_title: '三姊妹', release_date: '2012-01-01' }])
  );
  assert.equal(r2, null);
  // y una ficha suya sin título latino tampoco casa con un título de verdad
  const r3 = await peliculaPorDirector(
    { title: 'West of the Tracks', year: 2003, director: 'Wang Bing' },
    { ...deps([{ id: 701, job: 'Director', title: '铁西区', original_title: '铁西区', release_date: '2003-01-01' }]), tituloIngles: async () => '铁西区' }
  );
  assert.equal(r3, null);
});

test('peliculaPorDirector: el caso bueno sigue funcionando', async () => {
  const r = await peliculaPorDirector(
    { title: 'West of the Tracks', year: 2002, director: 'Wang Bing' },
    {
      personasPosibles: async () => [{ id: 99 }],
      creditosDe: async () => ({ crew: [{ id: 701, job: 'Director', title: '铁西区', original_title: '铁西区', release_date: '2003-01-01' }] }),
      tituloIngles: async () => 'Tie Xi Qu: West of the Tracks',
    }
  );
  assert.equal(r, 701);
});

// --- 3. pickSearchResult ----------------------------------------------------

test('pickSearchResult: sin título que case, no se queda con el primero del año', () => {
  assert.equal(
    pickSearchResult([{ id: 1, title: 'Otra cosa', original_title: 'Otra cosa', release_date: '1999-05-01' }], 'The Matrix', 1999),
    null
  );
  assert.equal(pickSearchResult([{ id: 2, title: 'Matrix Reloaded', release_date: '2003-05-01' }], 'Ψ', null), null);
  assert.equal(pickSearchResult([{ id: 2, title: 'Matrix Reloaded', release_date: '2003-05-01' }], 'Matrix', null), null);
  assert.equal(
    pickSearchResult(
      [
        { id: 3, title: 'Солярис', original_title: 'Солярис', release_date: '1972-01-01' },
        { id: 4, title: 'Тихий Дон', original_title: 'Тихий Дон', release_date: '1972-01-01' },
      ],
      'Тихий Дон',
      1972
    ),
    null,
    'un título que normaliza a vacío no casa con el primero que también normalice a vacío'
  );
});

test('pickSearchResult: un subtítulo de más dentro del año sigue valiendo', () => {
  const res = [
    { id: 9, title: 'Algo distinto', release_date: '2014-01-01' },
    { id: 10, title: 'Birdman o (la inesperada virtud de la ignorancia)', original_title: 'Birdman or (The Unexpected Virtue of Ignorance)', release_date: '2014-10-17' },
  ];
  assert.equal(pickSearchResult(res, 'Birdman', 2014)?.id, 10);
  // el making-of también contiene el título, pero no empieza por él
  assert.equal(pickSearchResult([{ id: 12, title: 'The Making of Birdman', release_date: '2014-01-01' }], 'Birdman', 2014), null);
  // la fila con subtítulo y la ficha sin él
  assert.equal(pickSearchResult([{ id: 13, title: 'Personal Velocity', release_date: '2002-01-01' }], 'Personal Velocity: Three Portraits', 2002)?.id, 13);
  // pero no a media palabra: «Alien» no es «Aliens»
  assert.equal(pickSearchResult([{ id: 11, title: 'Aliens', release_date: '1986-07-18' }], 'Alien', 1986), null);
});

// --- 4. esSerieEnTmdb -------------------------------------------------------

test('esSerieEnTmdb: un título que normaliza a vacío no se da por serie', async () => {
  setSetting('tmdb_key', 'clave-de-prueba');
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ results: [{ id: 1, name: '!!', original_name: 'Солярис', first_air_date: '2000-01-01' }] }),
  });
  try {
    assert.equal(await esSerieEnTmdb('?', 2000), false);
    assert.equal(await esSerieEnTmdb('Тихий Дон', 2000), false);
  } finally {
    globalThis.fetch = real;
    setSetting('tmdb_key', '');
  }
});

// --- 5. Retry-After con tope ------------------------------------------------

test('tmdbGet: un Retry-After de una hora no duerme una hora', async () => {
  setSetting('tmdb_key', 'clave-de-prueba');
  const realFetch = globalThis.fetch;
  const realTimeout = globalThis.setTimeout;
  const esperas = [];
  let n = 0;
  globalThis.fetch = async () => {
    n++;
    if (n === 1) return { ok: false, status: 429, headers: new Headers({ 'retry-after': '3600' }), json: async () => ({}) };
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({ ok: 1 }) };
  };
  globalThis.setTimeout = (fn, ms, ...args) => {
    esperas.push(ms);
    return realTimeout(fn, 0, ...args);
  };
  try {
    assert.deepEqual(await tmdbGet('/prueba/retry-after'), { ok: 1 });
    assert.ok(esperas.length >= 1);
    assert.ok(Math.max(...esperas) <= 60_000, `esperó ${Math.max(...esperas)} ms`);
  } finally {
    globalThis.fetch = realFetch;
    globalThis.setTimeout = realTimeout;
    setSetting('tmdb_key', '');
  }
});

// --- 6. JustWatch -----------------------------------------------------------

test('JustWatch: sin la película pedida no se devuelven las ofertas de otra', async () => {
  const real = globalThis.fetch;
  const nodo = (title, year) => ({
    node: {
      objectType: 'MOVIE',
      content: { title, originalReleaseYear: year },
      offers: [{ presentationType: '_4K', package: { clearName: 'Disney+' } }],
    },
  });
  let edges = [];
  globalThis.fetch = async () => new Response(JSON.stringify({ data: { popularTitles: { edges } } }), { status: 200 });
  const jw = await import('../src/justwatch.js');
  try {
    edges = [nodo('Avatar: The Way of Water', 2022)];
    assert.equal((await jw.availability('Avatar', 1979)).maxQuality, null);
    edges = [nodo('Avatar: The Way of Water', 2022), nodo('Avatar', 1979)];
    assert.equal((await jw.availability('Avatar', 1980)).maxQuality, '4K', 'año ±1 y título igual');
    edges = [nodo('Otra', 2001)];
    assert.equal((await jw.availability('Película sin año', null)).maxQuality, null);
    edges = [nodo('Avatar', 2009)];
    assert.equal((await jw.availability('Avatar', 1990)).maxQuality, null, 'título igual pero otro año');
    edges = [nodo('Ψ', 1998)];
    assert.equal((await jw.availability('π', 1998)).maxQuality, null, 'dos títulos vacíos al normalizar no casan');
  } finally {
    globalThis.fetch = real;
  }
});

// --- 7. Radarr --------------------------------------------------------------

test('radarrSearchAgain: si Radarr devuelve otras películas, no busca la primera', async () => {
  setSetting('radarr_url', 'http://radarr');
  setSetting('radarr_key', 'k');
  const real = globalThis.fetch;
  const llamadas = [];
  let biblioteca = [];
  globalThis.fetch = async (url, opt = {}) => {
    llamadas.push(`${opt.method || 'GET'} ${url} ${opt.body || ''}`);
    if (String(url).includes('/movie?tmdbId=')) return new Response(JSON.stringify(biblioteca), { status: 200 });
    return new Response('{}', { status: 201 });
  };
  const { radarrSearchAgain } = await import('../src/radarr.js');
  try {
    biblioteca = [{ id: 1, tmdbId: 11, title: 'Star Wars' }];
    await assert.rejects(() => radarrSearchAgain(603), /Radarr/);
    assert.ok(!llamadas.some((l) => l.startsWith('POST')), 'no se lanza ninguna búsqueda');
    biblioteca = [{ id: 1, tmdbId: 11, title: 'Star Wars' }, { id: 2, tmdbId: 603, title: 'The Matrix' }];
    assert.deepEqual(await radarrSearchAgain(603), { ok: true, title: 'The Matrix' });
    assert.ok(llamadas.some((l) => l.startsWith('POST') && l.includes('"movieIds":[2]')));
  } finally {
    globalThis.fetch = real;
    setSetting('radarr_url', '');
    setSetting('radarr_key', '');
  }
});

// --- 8. needsLatin ----------------------------------------------------------

test('needsLatin cubre todos los alfabetos, no solo los de la lista', () => {
  for (const t of ['ខ្មែរ', 'မြန်မာ', 'አማርኛ', 'ລາວ', 'བོད་', 'ᠮᠣᠩᠭᠣᠯ', 'ދިވެހި', '𠀋𠂉', 'ｶﾀｶﾅ']) {
    assert.equal(needsLatin(t), true, `${t} hay que cambiarlo`);
  }
  for (const t of ['Amélie', 'Kærlighed', '8½', 'Mother!', '«Tiempo» — 2001…', 'Ça’ira', 'Æon Flux', 'Œdipe', 'İstanbul', '2001: A Space Odyssey ★']) {
    assert.equal(needsLatin(t), false, `${t} es latino`);
  }
});

// --- 9. festivalOverrideKey -------------------------------------------------

test('festivalOverrideKey: dos títulos sin letras latinas no comparten clave', () => {
  assert.notEqual(festivalOverrideKey('π', 1998, '—'), festivalOverrideKey('Ψ', 1998, '—'));
  assert.notEqual(festivalOverrideKey('π', 1998, ''), festivalOverrideKey('$', 1998, ''));
  // las claves ya guardadas de títulos latinos no cambian
  assert.equal(festivalOverrideKey('West of the Tracks', 2003, '王兵'), 'westofthetracks:2003:');
  assert.equal(festivalOverrideKey('Amélie', 2001, 'Jean-Pierre Jeunet'), 'amelie:2001:jeanpierrejeunet');
  // el mismo título en NFD y en NFC es la misma clave
  assert.equal(festivalOverrideKey('Ψυχή'.normalize('NFD'), 1998, ''), festivalOverrideKey('Ψυχή', 1998, ''));
});

// --- 10. Catálogo de directores --------------------------------------------

test('el catálogo de directores no tiene nombres que normalicen a vacío ni colisiones', () => {
  const vistos = new Map();
  for (const d of DIRECTORS_2026) {
    const k = normName(d.name);
    assert.ok(k, `«${d.name}» no tiene letras comparables`);
    assert.ok(!vistos.has(k), `«${d.name}» y «${vistos.get(k)}» comparten clave`);
    vistos.set(k, d.name);
  }
});
