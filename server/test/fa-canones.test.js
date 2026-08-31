import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// base propia: `festivals.js` abre la base al importarse
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-facanones-'));

const { REGISTRY, staticListRows, anuarioKeys } = await import('../src/festivals.js');
const { FA_CANONES } = await import('../src/data/fa-canones-2026.js');

/**
 * Los cinco cánones temáticos de FilmAffinity: que el paquete y el REGISTRY no
 * se separen, y que las filas tengan la forma que espera `staticListRows`.
 *
 * El fallo que esto vigila no revienta nada: un canon cuyo `staticList` apunta
 * a una clave mal escrita se sirve VACÍO —sin error, sin aviso— y en la
 * interfaz se lee como «ese premio no ha premiado a nadie».
 */
const CLAVES = ['faxxi', 'fadocs', 'famudo', 'fanegro', 'fawestern'];

test('los cinco cánones están en el REGISTRY, en el grupo de cánones', () => {
  for (const clave of CLAVES) {
    const f = REGISTRY[clave];
    assert.ok(f, `falta ${clave} en el REGISTRY`);
    assert.equal(f.group, 'canon', `${clave} no está en el grupo de cánones`);
    // un canon no se gana: es un puesto, y por eso van todos como ganadoras
    assert.equal(f.onlyWinners, true, `${clave} debería servirse solo con ganadoras`);
    assert.ok(f.staticSource?.startsWith('https://www.filmaffinity.com/'), `${clave} sin fuente`);
  }
});

test('cada canon del REGISTRY apunta a las filas empaquetadas de SU clave', () => {
  for (const clave of CLAVES) {
    const lista = REGISTRY[clave].staticList;
    assert.ok(Array.isArray(lista) && lista.length > 0, `${clave} se serviría vacío`);
    // la comprobación de verdad: que no apunte al paquete de otro
    assert.equal(lista, FA_CANONES[clave].rows, `${clave} apunta a otras filas`);
  }
});

test('las filas traen puesto, título y año, y los ids que traen son enteros', () => {
  for (const [clave, paquete] of Object.entries(FA_CANONES)) {
    assert.ok(paquete.hasta, `${clave} sin fecha de corte`);
    for (const r of paquete.rows) {
      assert.ok(Number.isInteger(r.rank) && r.rank > 0, `${clave}: puesto inválido`);
      assert.ok(typeof r.title === 'string' && r.title.length, `${clave}: fila sin título`);
      // el id puede faltar —mejor sin ficha que la ficha de otra— pero si está,
      // es un entero
      if (r.tmdb_id != null) assert.ok(Number.isInteger(r.tmdb_id) && r.tmdb_id > 0, `${clave}: id inválido`);
    }
  }
});

/**
 * Los puestos se RENUMERAN al empaquetar, y por eso hay que comprobarlo: al
 * caerse los cortos (58 en documentales, 2 en el mudo) la numeración de origen
 * se queda con huecos, y una lista que salta del 12 al 14 se lee como si
 * faltara una película.
 */
test('los puestos van seguidos desde el 1, sin los huecos de los cortos', () => {
  for (const [clave, paquete] of Object.entries(FA_CANONES)) {
    assert.deepEqual(
      paquete.rows.map((r) => r.rank),
      paquete.rows.map((_, i) => i + 1),
      `${clave}: los puestos no van seguidos`
    );
  }
});

test('ninguna película ocupa dos puestos del mismo canon', () => {
  for (const [clave, paquete] of Object.entries(FA_CANONES)) {
    const ids = paquete.rows.map((r) => r.tmdb_id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `${clave}: hay una película repetida`);
  }
});

test('las filas pasan por staticListRows con la forma que espera la parrilla', () => {
  for (const clave of CLAVES) {
    const filas = staticListRows(REGISTRY[clave]);
    assert.equal(filas.length, FA_CANONES[clave].rows.length);
    const primera = filas[0];
    assert.ok(primera.title, `${clave}: la primera fila llega sin título`);
    assert.ok(Number.isInteger(primera.rank), `${clave}: la primera fila llega sin puesto`);
    // ninguna es una serie: los rankings de series de FilmAffinity no entran aquí
    assert.ok(filas.every((f) => !f.tv), `${clave}: hay filas marcadas como serie`);
  }
});

/**
 * «Lo mejor del año» compara un mismo año entre premios, y un canon no tiene
 * ganadora anual que cortar. `anuarioKeys` ya deja fuera todo lo que lleva
 * `staticList`, pero conviene comprobarlo aquí: si alguno se colara, el anuario
 * se dispararía a resolver mil películas al abrir cualquier año.
 */
test('ningún canon de FilmAffinity entra en «Lo mejor del año»', () => {
  const anuario = new Set(anuarioKeys());
  for (const clave of [...CLAVES, 'fatop1000']) {
    assert.ok(!anuario.has(clave), `${clave} no debería entrar en el anuario`);
  }
});

/**
 * El emparejado es lo caro y lo frágil de todo esto: si una regeneración se
 * dejara la mitad de las fichas por el camino, la parrilla saldría llena de
 * huecos y nada lo diría. El listón es holgado a propósito —FilmAffinity tiene
 * cine que TMDB no ficha— pero un desplome sí se ve.
 */
test('cada canon conserva al menos el 85% de sus fichas de TMDB', () => {
  for (const [clave, paquete] of Object.entries(FA_CANONES)) {
    const conFicha = paquete.rows.filter((r) => r.tmdb_id).length;
    const proporcion = conFicha / paquete.rows.length;
    assert.ok(
      proporcion >= 0.85,
      `${clave}: solo ${conFicha} de ${paquete.rows.length} tienen ficha (${(proporcion * 100).toFixed(0)}%)`
    );
  }
});
