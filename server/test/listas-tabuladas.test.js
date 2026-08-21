import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-listas-'));

const { parseListaTabulada, REGISTRY, empaquetables, anuarioKeys } = await import('../src/festivals.js');

const tabla = (cabeceras, filas) =>
  `<table><tr>${cabeceras.map((h) => `<th>${h}</th>`).join('')}</tr>` +
  filas.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') +
  '</table>';

// --- el parser de listas que NO van por año de premio -------------------------

test('lee una lista por puesto (el molde del AFI)', () => {
  const html = tabla(
    ['Film', 'Release year', 'Director', '1998 Rank', '2007 Rank'],
    [
      ['Casablanca', '1942', 'Michael Curtiz', '2', '3'],
      ['Citizen Kane', '1941', 'Orson Welles', '1', '1'],
      ['The Godfather', '1972', 'Francis Ford Coppola', '3', '2'],
    ]
  );
  const rows = parseListaTabulada(html, {
    titulo: /^film$/,
    año: /release year/,
    direccion: /^director/,
    puesto: /2007 rank/,
  });
  // ordenadas por puesto, no por el orden de la tabla
  assert.deepEqual(rows.map((r) => r.title), ['Citizen Kane', 'The Godfather', 'Casablanca']);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
  assert.equal(rows[0].year, 1941);
  assert.equal(rows[0].director, 'Orson Welles');
});

test('el filtro por columna deja fuera lo que no toca', () => {
  const html = tabla(
    ['Film title', 'Film type', 'Year of release', 'Year of induction'],
    [
      ['Una película', 'Narrative feature', '1957', '2012'],
      ['Un documental', 'Documentary', '1997', '2017'],
      ['Un corto', 'Short subject', '1913', '2001'],
      ['Un noticiario', 'Newsreel', '1940', '1995'],
      ['Un corto documental', 'Documentary/short subject', '1930', '1998'],
    ]
  );
  const rows = parseListaTabulada(html, {
    titulo: /film title/,
    año: /year of release/,
    orden: /year of induction/,
    filtro: { columna: /film type/, vale: /feature|documentary/i, no: /short subject/i },
  });
  assert.deepEqual(rows.map((r) => r.title), ['Un documental', 'Una película']);
  // sin puesto, manda la columna de orden: lo último admitido, primero
  assert.deepEqual(rows.map((r) => r.orden), [2017, 2012]);
});

test('el asterisco final es una llamada a la leyenda, no parte del título', () => {
  const html = tabla(
    ['Spine', 'Film', 'Film Release Year', 'Director'],
    [
      ['1', 'Grand Illusion', '1937', 'Jean Renoir'],
      ['2', 'King Kong*', '1933', 'Merian Cooper'],
      ['3', 'M*A*S*H', '1970', 'Robert Altman'],
    ]
  );
  const rows = parseListaTabulada(html, {
    puesto: /^spine/,
    titulo: /^film$/,
    año: /release year/,
    direccion: /^director/,
  });
  assert.equal(rows[1].title, 'King Kong');
  // el asterisco de DENTRO se queda: es el título de verdad
  assert.equal(rows[2].title, 'M*A*S*H');
});

test('una tabla que no tiene las columnas pedidas se ignora entera', () => {
  // dos filas de datos como mínimo: una tabla de una sola fila es la ficha
  // lateral del artículo, no una lista, y colarla llenaba los cánones de ruido
  const html =
    tabla(['Año', 'Cosa'], [['2020', 'nada'], ['2021', 'tampoco']]) +
    tabla(['Film', 'Release year'], [['La buena', '1999'], ['La otra buena', '2003']]);
  const rows = parseListaTabulada(html, { titulo: /^film$/, año: /release year/ });
  assert.deepEqual(rows.map((r) => r.title), ['La buena', 'La otra buena']);
});

test('una fila sin año o sin título no entra', () => {
  const html = tabla(
    ['Film', 'Release year'],
    [['Sin año', ''], ['', '1999'], ['Con las dos', '2001']]
  );
  const rows = parseListaTabulada(html, { titulo: /^film$/, año: /release year/ });
  assert.deepEqual(rows.map((r) => r.title), ['Con las dos']);
});

// --- las tres entradas nuevas están bien declaradas ---------------------------

test('los catálogos tabulados declaran sus columnas y se leen como listas', () => {
  for (const key of ['criterion', 'afi100', 'nfr']) {
    const f = REGISTRY[key];
    assert.ok(f, `falta la entrada ${key}`);
    assert.equal(f.awardParse, 'lista');
    assert.ok(f.awardPage, `${key} necesita artículo de Wikipedia`);
    assert.ok(f.listaColumnas?.titulo && f.listaColumnas?.año, `${key} necesita título y año`);
    assert.equal(f.group, 'canon');
    assert.equal(f.onlyWinners, true); // no tienen «edición por año»
  }
});

// --- las dos listas de claves NO son la misma ---------------------------------
//
// Reutilizar `anuarioKeys()` en el generador del paquete dejaba fuera justo lo
// que se acababa de añadir, porque va marcado `fueraDelAnuario`.
test('lo empaquetable incluye lo que «Lo mejor del año» deja fuera', () => {
  const emp = new Set(empaquetables());
  const anu = new Set(anuarioKeys());
  assert.ok(emp.size > anu.size, 'empaquetables tiene que ser el conjunto más grande');
  for (const k of anu) assert.ok(emp.has(k) || REGISTRY[k].staticAward, `${k} está en el anuario y no se puede empaquetar`);
  // y las listas ordenadas NO se empaquetan: no tienen año de premio que cortar
  for (const k of ['criterion', 'afi100', 'nfr']) assert.equal(emp.has(k), false);
});

test('«Lo mejor del año» no crece con las entradas nuevas', () => {
  // el encargo era explícito: nada de lo añadido puede entrar en esa vista,
  // que consulta TODOS sus palmareses al abrir un año sin cachear
  const anu = anuarioKeys();
  assert.equal(anu.length, 32, `el anuario tiene ${anu.length} fuentes y tenía que quedarse en 32`);
  for (const k of anu) assert.ok(!REGISTRY[k].fueraDelAnuario);
});
