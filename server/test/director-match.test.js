import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-dirmatch-'));
const { db, cacheWrite } = await import('../src/db.js');
const { resolveCatalogDirector } = await import('../src/tmdb.js');
const { DIRECTORS_2026 } = await import('../src/data/directors-2026.js');

/**
 * El homónimo famoso. Buscar «Steve McQueen» en TMDB devuelve primero al actor
 * de Bullitt (1930-1980), que es mucho más popular que el director de *12 años
 * de esclavitud* (1969). La resolución por popularidad le ponía al director la
 * cara del actor —y, peor, seguirle metía al actor en favoritos y en el
 * calendario—. El año de nacimiento del catálogo lo desempata.
 *
 * Las respuestas de TMDB se siembran en la caché para que el test no salga a la
 * red: `person_search_all:` es la búsqueda y `person:{id}:{idioma}` la ficha.
 */
const sembrar = (nombre, resultados, fichas) => {
  cacheWrite(`person_search_all:${nombre.toLowerCase()}`, { results: resultados });
  for (const [id, ficha] of Object.entries(fichas)) cacheWrite(`person:${id}:es-ES`, ficha);
};

test('gana el director, no el homónimo famoso: manda el año de nacimiento', async () => {
  sembrar('steve mcqueen',
    [
      { id: 1, name: 'Steve McQueen', known_for_department: 'Acting', popularity: 40, profile_path: '/actor.jpg' },
      { id: 2, name: 'Steve McQueen', known_for_department: 'Directing', popularity: 3, profile_path: '/director.jpg' },
    ],
    {
      1: { id: 1, birthday: '1930-03-24', deathday: '1980-11-07', profile_path: '/actor.jpg' },
      2: { id: 2, birthday: '1969-10-09', deathday: null, profile_path: '/director.jpg' },
    }
  );
  const r = await resolveCatalogDirector({ name: 'Steve McQueen', age: 57, last: 2024 });
  assert.equal(r.id, 2, 'el de 1969, no el de 1930');
  assert.equal(r.profile_path, '/director.jpg');
});

test('si NADIE cuadra con la fecha, mejor sin foto que con la cara de otro', async () => {
  sembrar('fulano tocayo',
    [{ id: 10, name: 'Fulano Tocayo', known_for_department: 'Acting', popularity: 99, profile_path: '/otro.jpg' }],
    { 10: { id: 10, birthday: '1930-01-01', deathday: null } }
  );
  const r = await resolveCatalogDirector({ name: 'Fulano Tocayo', age: 40 });
  assert.equal(r.id, null);
  assert.equal(r.profile_path, null);
});

test('quien murió antes de su última película no puede ser', async () => {
  sembrar('mengano muerto',
    [{ id: 20, name: 'Mengano Muerto', known_for_department: 'Directing', popularity: 50, profile_path: '/x.jpg' }],
    { 20: { id: 20, birthday: null, deathday: '1999-01-01' } }
  );
  const r = await resolveCatalogDirector({ name: 'Mengano Muerto', last: 2024 });
  assert.equal(r.id, null);
});

test('sin fecha con la que contrastar, vale quien dirige', async () => {
  sembrar('zutano sinfecha',
    [
      { id: 30, name: 'Zutano Sinfecha', known_for_department: 'Acting', popularity: 90, profile_path: '/a.jpg' },
      { id: 31, name: 'Zutano Sinfecha', known_for_department: 'Directing', popularity: 2, profile_path: '/d.jpg' },
    ],
    { 30: { id: 30, birthday: null }, 31: { id: 31, birthday: null } }
  );
  const r = await resolveCatalogDirector({ name: 'Zutano Sinfecha' });
  assert.equal(r.id, 31, 'entre iguales sin fecha, el que dirige');
});

// el catálogo tiene que traer con qué verificar: si un día se regenera sin la
// edad, esta protección se queda sin base y el homónimo vuelve
test('el catálogo conserva el dato que permite la verificación', () => {
  const conEdad = DIRECTORS_2026.filter((d) => d.birth || d.age).length;
  assert.ok(conEdad / DIRECTORS_2026.length > 0.99, `solo ${conEdad} de ${DIRECTORS_2026.length} tienen edad`);
  const mcqueen = DIRECTORS_2026.find((d) => d.name === 'Steve McQueen');
  assert.ok(mcqueen?.age, 'Steve McQueen necesita su edad para no ser el actor');
});

/**
 * Wikidata escribe «Małgorzata Szumowska» y TMDB guarda «Malgorzata Szumowska».
 * La ł polaca (y la ø nórdica, y la ı turca) NO son una letra con acento: NFD
 * las deja intactas y el limpiado posterior las BORRABA, así que los dos
 * nombres dejaban de casar. Efecto en producción: en el catálogo salía como no
 * seguida aunque estuviera en favoritos, y al pulsar la estrella el mensaje
 * decía que no tenía ficha en TMDB. Reportado con Szumowska.
 */
test('los nombres con ł, ø o ı casan entre Wikidata y TMDB', async () => {
  const { normName, foldName } = await import('../src/names.js');
  const pares = [
    ['Małgorzata Szumowska', 'Malgorzata Szumowska'],
    ['Paweł Pawlikowski', 'Pawel Pawlikowski'],
    ['Mia Hansen-Løve', 'Mia Hansen-Love'],
    ['İlker Çatak', 'Ilker Catak'],
  ];
  for (const [wikidata, tmdb] of pares) {
    assert.equal(normName(wikidata), normName(tmdb), `${wikidata} debería ser ${tmdb}`);
  }
  // y la letra se convierte, no se borra
  assert.equal(foldName('Małgorzata'), 'Malgorzata');
  assert.equal(normName('Małgorzata'), 'malgorzata');
  // la Ł MAYÚSCULA también: un apellido que empieza por ella («Łoziński»)
  // perdía su inicial y ya no casaba con el «Lozinski» de TMDB
  assert.equal(normName('Łoziński'), 'lozinski');
});

test('plegar letras no confunde a personas distintas', async () => {
  const { normName } = await import('../src/names.js');
  assert.notEqual(normName('Steve McQueen'), normName('Steve McQueeny'));
  assert.notEqual(normName('Jean Renoir'), normName('Jean Rouch'));
});

// los cuatro del catálogo que llevan esas letras: si el dataset se regenera y
// aparecen más, el pliegue tiene que seguir cubriéndolos
test('todo el catálogo se puede comparar con lo que devuelva TMDB', async () => {
  const { normName } = await import('../src/names.js');
  const raras = /[łŁøØđĐıİþÞðÐæÆœŒß]/;
  for (const d of DIRECTORS_2026.filter((x) => raras.test(x.name))) {
    assert.ok(!raras.test(normName(d.name)), `${d.name} sigue con letras sin plegar`);
    assert.ok(normName(d.name).length >= 4, `${d.name} se queda en nada al normalizar`);
  }
});

/**
 * TMDB no tiene fecha de nacimiento de muchísimos cineastas fuera del circuito
 * anglosajón. Exigirla para dar por bueno el emparejado dejaba sin foto a gente
 * que TMDB conoce de sobra y sin ningún homónimo que la dispute: la fecha vale
 * para DESCARTAR a quien la contradice, no como requisito.
 */
test('un director sin fecha en TMDB, y sin nadie que lo dispute, se acepta', async () => {
  sembrar('carla simon',
    [{ id: 500, name: 'Carla Simón', known_for_department: 'Directing', popularity: 5, profile_path: '/carla.jpg' }],
    { 500: { id: 500, birthday: null, deathday: null, profile_path: '/carla.jpg' } }
  );
  const r = await resolveCatalogDirector({ name: 'Carla Simon', age: 40, last: 2025 });
  assert.equal(r.id, 500);
  assert.equal(r.profile_path, '/carla.jpg');
});

test('pero quien SÍ tiene fecha y no cuadra sigue descartado, aunque otro no la tenga', async () => {
  sembrar('tocayo mixto',
    [
      { id: 600, name: 'Tocayo Mixto', known_for_department: 'Acting', popularity: 99, profile_path: '/famoso.jpg' },
      { id: 601, name: 'Tocayo Mixto', known_for_department: 'Directing', popularity: 1, profile_path: '/dir.jpg' },
    ],
    {
      600: { id: 600, birthday: '1930-01-01', profile_path: '/famoso.jpg' },  // contradice
      601: { id: 601, birthday: null, profile_path: '/dir.jpg' },             // no contradice
    }
  );
  const r = await resolveCatalogDirector({ name: 'Tocayo Mixto', age: 50 });
  assert.equal(r.id, 601, 'el famoso queda fuera por fecha; entra el que dirige y no contradice');
});

test('la fecha que cuadra gana a la ausencia de fecha', async () => {
  sembrar('doble candidato',
    [
      { id: 700, name: 'Doble Candidato', known_for_department: 'Directing', popularity: 9, profile_path: '/a.jpg' },
      { id: 701, name: 'Doble Candidato', known_for_department: 'Directing', popularity: 1, profile_path: '/b.jpg' },
    ],
    {
      700: { id: 700, birthday: null, profile_path: '/a.jpg' },
      701: { id: 701, birthday: '1970-05-05', profile_path: '/b.jpg' },
    }
  );
  const r = await resolveCatalogDirector({ name: 'Doble Candidato', age: 56 }); // → 1970
  assert.equal(r.id, 701, 'la prueba fuerte manda sobre la simple ausencia de contradicción');
});

test('si NADIE dirige y nadie cuadra por fecha, no se elige a nadie', async () => {
  sembrar('solo actores',
    [{ id: 800, name: 'Solo Actores', known_for_department: 'Acting', popularity: 50, profile_path: '/x.jpg' }],
    { 800: { id: 800, birthday: null } }
  );
  const r = await resolveCatalogDirector({ name: 'Solo Actores', age: 60 });
  assert.equal(r.id, null);
});
