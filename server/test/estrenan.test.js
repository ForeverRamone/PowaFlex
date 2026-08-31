import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// base propia: el módulo abre la base al importarse (avales, biblioteca)
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-estrenan-'));

const { mesesDeLaVentana, obraAnterior, peso, CANALES } = await import('../src/estrenan.js');

// --- la ventana de tres meses -------------------------------------------------

test('la ventana son tres meses seguidos y el primero empieza HOY', () => {
  const meses = mesesDeLaVentana('2026-09-10');
  assert.deepEqual(meses.map((m) => m.clave), ['2026-09', '2026-10', '2026-11']);
  // el mes en curso arranca hoy: lo estrenado la semana pasada no es «quién viene»
  assert.equal(meses[0].desde, '2026-09-10');
  assert.equal(meses[0].hasta, '2026-09-30');
  // los siguientes van enteros, del 1 al último
  assert.equal(meses[1].desde, '2026-10-01');
  assert.equal(meses[1].hasta, '2026-10-31');
  assert.equal(meses[2].hasta, '2026-11-30');
});

/**
 * El caso que motiva la regla: abrir la página el 31 de agosto para que la
 * primera pestaña sea «agosto» —un día, cero estrenos— no informa de nada.
 */
test('a menos de siete días del final, la ventana salta al mes siguiente', () => {
  assert.deepEqual(mesesDeLaVentana('2026-08-31').map((m) => m.clave), ['2026-09', '2026-10', '2026-11']);
  // el límite es siete días exactos contando hoy: el 25 de agosto quedan siete
  assert.deepEqual(mesesDeLaVentana('2026-08-25').map((m) => m.clave), ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(mesesDeLaVentana('2026-08-26').map((m) => m.clave), ['2026-09', '2026-10', '2026-11']);
});

test('la ventana cruza el año sin inventarse un mes 13', () => {
  assert.deepEqual(mesesDeLaVentana('2026-11-15').map((m) => m.clave), ['2026-11', '2026-12', '2027-01']);
  // y febrero de un bisiesto acaba en 29
  assert.equal(mesesDeLaVentana('2028-02-01')[0].hasta, '2028-02-29');
});

test('los dos canales de España son la sala y lo digital', () => {
  assert.equal(CANALES.cine.types, '3|2');
  assert.equal(CANALES.plataforma.types, '4');
});

// --- la obra anterior ---------------------------------------------------------

const credito = (id, title, date, vote, votes, extra = {}) => ({
  id, title, release_date: date, vote_average: vote, vote_count: votes, job: 'Director', ...extra,
});

test('«lo mejor» va por nota ponderada: el corto de doce votos no gana', () => {
  const credits = {
    crew: [
      credito(1, 'El corto de instituto', '2004-01-01', 9.6, 12),
      credito(2, 'La consagrada', '2012-05-01', 8.1, 4200),
      credito(3, 'La correcta', '2018-05-01', 7.4, 1800),
      credito(4, 'La floja', '2020-05-01', 5.9, 900),
    ],
  };
  const { mejores, dirigidas, debut } = obraAnterior(credits, { hoy: '2026-08-31', excluir: new Set() });
  assert.deepEqual(mejores.map((m) => m.title), ['La consagrada', 'La correcta', 'La floja']);
  assert.equal(mejores[0].year, 2012);
  assert.equal(dirigidas, 4);
  assert.equal(debut, 2004);
});

test('no se cuenta lo que aún no ha salido ni el propio estreno de la ventana', () => {
  const credits = {
    crew: [
      credito(10, 'La de ahora', '2026-09-18', 0, 0),
      credito(11, 'La del año que viene', '2027-04-01', 0, 0),
      credito(12, 'La de antes', '2019-01-01', 7.2, 3000),
      // la misma película, firmada también como guionista: no vale por dos
      { ...credito(12, 'La de antes', '2019-01-01', 7.2, 3000), job: 'Screenplay' },
    ],
  };
  const r = obraAnterior(credits, { hoy: '2026-08-31', excluir: new Set([10]) });
  assert.deepEqual(r.mejores.map((m) => m.tmdb_id), [12]);
  // «dirigidas» son las ESTRENADAS: ni la de septiembre ni la de 2027 cuentan
  assert.equal(r.dirigidas, 1);
  assert.equal(r.debut, 2019);
});

test('sin nada estrenado antes, la ficha queda vacía y el debut a null', () => {
  const r = obraAnterior({ crew: [credito(999999901, 'La primera', '2026-10-02', 0, 0)] }, {
    hoy: '2026-08-31',
    excluir: new Set([999999901]),
  });
  assert.deepEqual(r.mejores, []);
  assert.equal(r.dirigidas, 0); // esto es lo que la interfaz lee como «ópera prima»
  assert.equal(r.debut, null);
  assert.deepEqual(r.palmares, []);
});

test('el palmarés sale del paquete que viaja con la app, sin tocar la red', () => {
  // «Parasite» (496243) es Palma de Oro y Óscar en el paquete empaquetado
  const r = obraAnterior({ crew: [credito(496243, 'Parasite', '2019-05-30', 8.5, 18000)] }, {
    hoy: '2026-08-31',
    excluir: new Set(),
  });
  const claves = r.palmares.map((p) => p.key);
  assert.ok(claves.includes('cannes'), `esperaba Cannes, hubo ${claves.join(', ')}`);
  // las ganadas van delante: es lo que se lee primero en la ficha
  assert.equal(r.palmares[0].winner, true);
});

// --- el orden por defecto -----------------------------------------------------

const ficha = (extra = {}) => ({ favorito: false, palmares: [], enTuPlex: 0, popularidad: 0, ...extra });

test('el orden por defecto pone a tus favoritos por delante de todo', () => {
  const tuyo = ficha({ favorito: true });
  const premiado = ficha({ palmares: [{ winner: true }, { winner: true }, { winner: true }], popularidad: 200 });
  assert.ok(peso(tuyo) > peso(premiado));
});

test('entre dos que no sigues, manda haber ganado algo', () => {
  const premiado = ficha({ palmares: [{ winner: true }] });
  const popular = ficha({ popularidad: 200 });
  assert.ok(peso(premiado) > peso(popular));
  // y una selección sin premio pesa, pero menos que una ganada
  assert.ok(peso(ficha({ palmares: [{ winner: false }] })) < peso(premiado));
});
