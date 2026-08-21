import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-avales-'));

const { db, cacheWrite, setSetting } = await import('../src/db.js');
const { REGISTRY, festivalOverrideKey, CLAVE_MATCH } = await import('../src/festivals.js');
const { cachePrefix } = await import('../src/cache-versions.js');
const { avalesDe, conteoAvales, avalesDeFilmografia, indiceAvales, fuentesFrias } = await import('../src/avales.js');

// El paquete que viaja con la app es el suelo del índice: sin tocar nada, una
// película premiada tiene que traer sus avales en cualquier instalación.
test('el paquete de palmareses da avales sin red y sin haber abierto nada', () => {
  const parasitos = avalesDe(496243);
  assert.ok(parasitos.total >= 6, `esperaba varios avales, hubo ${parasitos.total}`);
  const claves = parasitos.lista.map((a) => a.key);
  assert.ok(claves.includes('cannes'), 'falta la Palma de Oro');
  assert.ok(claves.includes('oscar'), 'falta el Óscar');
  assert.equal(parasitos.lista.find((a) => a.key === 'cannes').winner, true);
  // el año del paquete llega hasta donde llega, y se dice para poder avisar
  assert.ok(Number.isFinite(parasitos.hasta));
});

test('una película sin ningún aval devuelve la misma forma, no un hueco', () => {
  const nada = avalesDe(999999999);
  assert.deepEqual({ total: nada.total, ganados: nada.ganados, canones: nada.canones }, { total: 0, ganados: 0, canones: 0 });
  assert.deepEqual(nada.lista, []);
});

test('estar en un canon no cuenta como premio ganado', () => {
  // Cahiers va en el grupo «canon»: su puesto no es un trofeo
  const conCanon = avalesDe(37799); // The Social Network, en el top 10 de Cahiers
  const cahiers = conCanon.lista.find((a) => a.key === 'cahiers');
  if (cahiers) {
    assert.equal(cahiers.winner, false, 'un puesto en Cahiers no es una victoria');
    assert.ok(conCanon.canones >= 1);
  }
});

test('los avales van ordenados: festivales, premios, crítica y al final los cánones', () => {
  const a = avalesDe(496243);
  const grupos = a.lista.map((x) => x.group);
  const canonPrimero = grupos.indexOf('canon');
  if (canonPrimero >= 0) {
    assert.ok(
      grupos.slice(canonPrimero).every((g) => g === 'canon'),
      'una vez empiezan los cánones no puede volver a haber premios'
    );
  }
});

test('conteoAvales solo devuelve las que tienen alguno', () => {
  const r = conteoAvales([496243, 999999999]);
  assert.ok(r[496243].total > 0);
  assert.equal(r[999999999], undefined); // no se manda un cero por cada película de la parrilla
});

// --- lo que aporta la caché: los premios ya consultados suman avales ----------

test('las filas cacheadas de un premio suman avales, resolviendo por film_match', () => {
  const f = REGISTRY.locarno || REGISTRY.cannes;
  const fila = { year: 1999, title: 'Una Inventada Del Test', director: 'Fulano De Tal' };
  const clave = festivalOverrideKey(fila.title, fila.year, fila.director);
  cacheWrite(`${CLAVE_MATCH}${clave}`, { id: 88800011 });
  cacheWrite(
    `${cachePrefix('festival')}:awardrows:ganadoras:${f.awardLang || 'en'}:${f.awardPage}`,
    { rows: [fila] }
  );
  indiceAvales({ refresh: true });
  const a = avalesDe(88800011);
  assert.equal(a.total, 1);
  assert.equal(a.lista[0].year, 1999);
});

test('una corrección manual a «ninguna» se lleva el aval por delante', () => {
  const fila = { year: 1998, title: 'Otra Del Test', director: 'Mengano De Cual' };
  const clave = festivalOverrideKey(fila.title, fila.year, fila.director);
  cacheWrite(`${CLAVE_MATCH}${clave}`, { id: 88800022 });
  const f = REGISTRY.karlovyvary || REGISTRY.venecia;
  cacheWrite(
    `${cachePrefix('festival')}:awardrows:ganadoras:${f.awardLang || 'en'}:${f.awardPage}`,
    { rows: [fila] }
  );
  indiceAvales({ refresh: true });
  assert.equal(avalesDe(88800022).total, 1);

  db.prepare('INSERT OR REPLACE INTO match_overrides (key, tmdb_id) VALUES (?, NULL)').run(clave);
  indiceAvales({ refresh: true });
  assert.equal(avalesDe(88800022).total, 0, 'lo que el usuario desempareja no puede seguir avalando');
});

// --- la versión por persona ---------------------------------------------------

test('avalesDeFilmografia cuenta cuántas avaladas hay y cuántas son tuyas', () => {
  const r = avalesDeFilmografia([
    { tmdb_id: 496243, owned: true }, // premiada y en tu Plex
    { tmdb_id: 423, owned: false }, // premiada y te falta
    { tmdb_id: 999999999, owned: true }, // sin aval: no cuenta en ninguna de las dos
  ]);
  assert.equal(r.conAval, 2);
  assert.equal(r.tuyasConAval, 1);
  assert.ok(r.fuentes.length > 0);
  // las fuentes vienen ordenadas por cuántas películas suyas avalan
  assert.ok(r.fuentes[0].n >= r.fuentes[r.fuentes.length - 1].n);
});

// --- el encendido automático del índice ---------------------------------------
//
// Las fuentes que no vienen empaquetadas (las entradas nuevas, los catálogos,
// los cánones fijos) solo aportan cuando sus filas están emparejadas, y eso
// pasa al abrir su palmarés. El pase nocturno las abre a plazos; aquí se
// comprueba a QUIÉN elige y a quién deja de elegir.

test('están frías las fuentes que no aportan nada al índice', () => {
  const frias = new Set(fuentesFrias());
  // Cannes viene empaquetado: aporta desde el primer arranque
  assert.equal(frias.has('cannes'), false);
  // las entradas nuevas no están en el paquete: hay que encenderlas
  assert.ok(frias.has('bluedragon'), 'Blue Dragon debería estar fría');
  assert.ok(frias.has('criterion'), 'Criterion debería estar fría');
  // …y las que las pruebas de arriba han encendido a mano ya no lo están
  assert.equal(frias.has('locarno'), false, 'Locarno aporta desde que tiene filas cacheadas');
});

test('los catálogos gordos van al final de la cola', () => {
  const frias = fuentesFrias();
  assert.ok(
    frias.indexOf('criterion') > frias.indexOf('bluedragon'),
    'Criterion (1.176 películas) no puede comerse la primera noche'
  );
});

test('una fuente intentada hace poco no se reintenta cada noche', () => {
  assert.ok(fuentesFrias().includes('goldenhorse'));
  setSetting('avales_intentos', JSON.stringify({ goldenhorse: Date.now() }));
  assert.equal(fuentesFrias().includes('goldenhorse'), false, 'recién intentada: se deja descansar');
  // pero a la semana se vuelve a probar, por si lo han arreglado en Wikipedia
  setSetting('avales_intentos', JSON.stringify({ goldenhorse: Date.now() - 8 * 24 * 3600 * 1000 }));
  assert.ok(fuentesFrias().includes('goldenhorse'), 'pasada la semana vuelve a la cola');
  setSetting('avales_intentos', '{}');
});
