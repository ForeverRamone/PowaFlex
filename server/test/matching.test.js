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

/**
 * EL CANON ESTÁ EN INGLÉS Y LA APP PREGUNTA EN ESPAÑOL.
 *
 * Visto en producción sobre la Beta 1.08: el corrector manual de «The Leopard»
 * devolvía «El hombre leopardo», «The Leopard Lady», «The Leopard Woman» y
 * «The Leopard Son», pero NUNCA «Il gattopardo». TMDB compara la consulta con
 * el título original y con el traducido al idioma que pides, no con el inglés,
 * así que ningún canon escrito en inglés podía encontrar una película italiana.
 *
 * El stub de `fetch` vale aquí porque lo que se comprueba es la PREGUNTA que se
 * hace, no la respuesta de TMDB: que se repita la búsqueda con language=en-US.
 */
test('searchMovieCandidates repregunta en inglés cuando la lista se queda corta', async () => {
  const { searchMovieCandidates } = await import('../src/tmdb.js');
  const { setSetting } = await import('../src/db.js');
  setSetting('tmdb_key', 'clave-de-prueba');

  const idiomas = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    idiomas.push(u.searchParams.get('language'));
    const enIngles = u.searchParams.get('language') === 'en-US';
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: enIngles
          ? [{ id: 1, title: 'The Leopard', original_title: 'Il gattopardo', release_date: '1963-03-27' }]
          : [{ id: 9, title: 'El hombre leopardo', original_title: 'The Leopard Man', release_date: '1943-05-08' }],
      }),
    };
  };
  try {
    const cands = await searchMovieCandidates('The Leopard', 1963);
    assert.ok(idiomas.includes('en-US'), `nunca se preguntó en inglés: ${idiomas.join(', ')}`);
    assert.ok(cands.some((c) => c.original_title === 'Il gattopardo'), 'Il gattopardo no está entre los candidatos');
    // y la vuelta en español sigue haciéndose primero
    assert.equal(idiomas[0], 'es-ES');
  } finally {
    globalThis.fetch = real;
    setSetting('tmdb_key', '');
  }
});

test('searchMovieId prueba en inglés SOLO cuando no ha encontrado nada', async () => {
  // aquí no hay verificación de dirección detrás, así que la vuelta en inglés
  // no puede cambiar un acierto por otra película: solo entra donde hoy se
  // devuelve null
  const { searchMovieId } = await import('../src/tmdb.js');
  const { setSetting } = await import('../src/db.js');
  setSetting('tmdb_key', 'clave-de-prueba');

  const real = globalThis.fetch;
  const idiomasCuandoAcierta = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    idiomasCuandoAcierta.push(u.searchParams.get('language'));
    return {
      ok: true, status: 200,
      json: async () => ({ results: [{ id: 7, title: 'Amanece', original_title: 'Amanece', release_date: '1990-01-01' }] }),
    };
  };
  try {
    assert.equal(await searchMovieId('Amanece', 1990), 7);
    assert.ok(!idiomasCuandoAcierta.includes('en-US'), 'con acierto NO debe repreguntar en inglés');
  } finally {
    globalThis.fetch = real;
    setSetting('tmdb_key', '');
  }
});

/**
 * EL FALLO QUE COSTÓ TRES INTENTOS, reproducido entero.
 *
 * «The Leopard» está en Sight & Sound como 1962 y en TMDB como 1963, y el
 * título es tan genérico que la búsqueda abierta devuelve veinte películas más
 * populares antes que la buena. Con la lista cortada a diez POR POPULARIDAD,
 * «Il gattopardo» se caía por el corte y nadie llegaba a comprobar su
 * dirección: la ficha se quedaba sin cartel para siempre.
 *
 * Aquí se comprueban las tres cosas que hacen falta a la vez: que se pregunte
 * por los años vecinos, que se pregunte en inglés, y que el corte respete el
 * año en vez de la popularidad.
 */
test('el candidato bueno sobrevive al corte aunque TMDB lo entierre', async () => {
  const { searchMovieCandidates } = await import('../src/tmdb.js');
  const { setSetting } = await import('../src/db.js');
  setSetting('tmdb_key', 'clave-de-prueba');

  // veinte señuelos más populares, ninguno del año que buscamos
  const senuelos = Array.from({ length: 20 }, (_, i) => ({
    id: 500 + i,
    title: `The Leopard ${i}`,
    original_title: `The Leopard ${i}`,
    release_date: `${1920 + i * 3}-01-01`,
  }));
  const buena = { id: 1, title: 'The Leopard', original_title: 'Il gattopardo', release_date: '1963-03-27' };

  const años = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const anyo = u.searchParams.get('primary_release_year');
    años.push(anyo);
    // TMDB solo la devuelve al acotar por 1963, que NO es el año del canon
    const results = anyo === '1963' ? [buena] : anyo ? [] : senuelos;
    return { ok: true, status: 200, json: async () => ({ results }) };
  };
  try {
    const cands = await searchMovieCandidates('The Leopard', 1962);
    assert.ok(años.includes('1963'), `no se probó el año vecino: ${años.join(', ')}`);
    const puesto = cands.findIndex((c) => c.original_title === 'Il gattopardo');
    assert.notEqual(puesto, -1, 'Il gattopardo se cayó por el corte');
    assert.equal(puesto, 0, 'y además tiene que ir la primera: es la única del año');
  } finally {
    globalThis.fetch = real;
    setSetting('tmdb_key', '');
  }
});

test('ordenarCandidatos: el año manda sobre la popularidad, y el título clavado desempata', async () => {
  const { ordenarCandidatos } = await import('../src/tmdb.js');
  const lista = [
    { id: 1, title: 'The Leopard Man', original_title: 'The Leopard Man', date: '1943-05-08' },
    { id: 2, title: 'The Leopard Son', original_title: 'The Leopard Son', date: '1996-01-01' },
    { id: 3, title: 'Otra del 63', original_title: 'Otra del 63', date: '1963-06-01' },
    { id: 4, title: 'The Leopard', original_title: 'Il gattopardo', date: '1963-03-27' },
  ];
  const orden = ordenarCandidatos(lista, 'The Leopard', 1962).map((c) => c.id);
  // las dos del 63 delante; entre ellas, la que clava el título
  assert.deepEqual(orden.slice(0, 2), [4, 3]);
  // sin año con el que comparar, el título clavado sigue mandando y el resto
  // conserva el orden de TMDB: no se inventa un criterio que no tenemos
  assert.deepEqual(ordenarCandidatos(lista, 'The Leopard', null).map((c) => c.id), [4, 1, 2, 3]);
});

// Los flecos que la auditoría de la 1.10 dejó diagnosticados y sin arreglar,
// ahora fijados: (a) una fila SIN director no tiene contra qué verificar, así
// que la única prueba que queda —el título clavado— se exige siempre; antes
// se emparejaba con el primer candidato con créditos de la ventana.
test('sin director en la fila, solo el título clavado empareja', async () => {
  const { elegirCandidato } = await import('../src/festivals.js');
  const dirsDe = async () => ['Cualquier Persona'];
  // título distinto: NO vale aunque el candidato tenga créditos y esté en año
  const distinto = await elegirCandidato(
    { title: 'Company', director: null }, 2024,
    [{ id: 51, title: 'The Company Men', original_title: 'The Company Men', date: '2024-05-01' }],
    new Set(), dirsDe
  );
  assert.equal(distinto.tmdbId, null);
  // título clavado: sí
  const clavado = await elegirCandidato(
    { title: 'Company', director: null }, 2024,
    [{ id: 52, title: 'Company', original_title: 'Company', date: '2024-05-01' }],
    new Set(), dirsDe
  );
  assert.equal(clavado.tmdbId, 52);
  // y las fichas sin créditos tampoco entran ya sin clavar el título
  const sinCreditos = await elegirCandidato(
    { title: 'Company', director: null }, 2024,
    [{ id: 53, title: 'Companía y media', original_title: 'Companía y media', date: '2024-05-01' }],
    new Set(), async () => []
  );
  assert.equal(sinCreditos.tmdbId, null);
});

// (b) la errata de Wikipedia con una letra doblada de menos: «Angelo azzuro»
// (Orizzonti 2026) es «Angelo Azzurro» en TMDB. El título clavado tolera SOLO
// letras dobladas — los dígitos no se colapsan, que «Apollo 11» no es «Apollo 1».
test('el título clavado tolera letras dobladas de erratas, no dígitos', async () => {
  const { elegirCandidato } = await import('../src/festivals.js');
  const conErrata = await elegirCandidato(
    { title: 'Angelo azzuro', director: 'Fulano Director' }, 2026,
    [{ id: 61, title: 'Angelo Azzurro', original_title: 'Angelo Azzurro', date: '2026-09-01' }],
    new Set(), async () => ['Fulano Director']
  );
  assert.equal(conErrata.tmdbId, 61);
  // un dígito repetido NO se pliega: «Apollo 11» no debe clavar con «Apollo 1»
  const apolo = await elegirCandidato(
    { title: 'Apollo 11', director: null }, 2019,
    [{ id: 62, title: 'Apollo 1', original_title: 'Apollo 1', date: '2019-03-01' }],
    new Set(), async () => ['Alguien']
  );
  assert.equal(apolo.tmdbId, null);
});

// «Three Seasons» (Sundance 1999, fila sin director): en TMDB es «Tres
// estaciones» de título y «Ba mùa» de original — el inglés solo vive en la
// traducción. Para filas sin director, ese título internacional EXACTO vale
// como título clavado; sin él, sigue mandando «mejor sin ficha».
test('sin director, el título internacional exacto también clava', async () => {
  const { elegirCandidato } = await import('../src/festivals.js');
  const candidato = { id: 71, title: 'Tres estaciones', original_title: 'Ba mùa', date: '1999-04-30' };
  const conIngles = await elegirCandidato(
    { title: 'Three Seasons', director: null }, 1999, [candidato],
    new Set(), async () => ['Tony Bui'], async () => 'Three Seasons'
  );
  assert.equal(conIngles.tmdbId, 71);
  // sin la traducción disponible, no hay prueba: sin ficha
  const sinIngles = await elegirCandidato(
    { title: 'Three Seasons', director: null }, 1999, [candidato],
    new Set(), async () => ['Tony Bui']
  );
  assert.equal(sinIngles.tmdbId, null);
  // y un título internacional que NO clava tampoco cuela
  const otro = await elegirCandidato(
    { title: 'Three Seasons', director: null }, 1999, [candidato],
    new Set(), async () => ['Tony Bui'], async () => 'Four Seasons'
  );
  assert.equal(otro.tmdbId, null);
});

// Más hallazgos del revisor adversarial, sobre las tolerancias de título:
test('«Anna» no es «Ana»: el plegado de dobles exige cuerpo', async () => {
  const { elegirCandidato } = await import('../src/festivals.js');
  const r = await elegirCandidato(
    { title: 'Anna', director: null }, 2020,
    [{ id: 81, title: 'Ana', original_title: 'Ana', date: '2020-03-01' }],
    new Set([81]), async () => ['Otra Persona']
  );
  assert.equal(r.tmdbId, null);
});

test('la contención exige un subtítulo de verdad: Halloween II no es Halloween', async () => {
  const { elegirCandidato } = await import('../src/festivals.js');
  const secuela = await elegirCandidato(
    { title: 'Halloween', director: null }, 1981,
    [{ id: 91, title: 'Halloween II', original_title: 'Halloween II', date: '1981-10-30' }],
    new Set(), async () => ['Rick Rosenthal']
  );
  assert.equal(secuela.tmdbId, null);
  // y el subtítulo largo de verdad sigue valiendo
  const subtitulo = await elegirCandidato(
    { title: 'Personal Velocity: Three Portraits', director: null }, 2002,
    [{ id: 92, title: 'Personal Velocity', original_title: 'Personal Velocity', date: '2002-11-01' }],
    new Set(), async () => ['Rebecca Miller']
  );
  assert.equal(subtitulo.tmdbId, 92);
});
