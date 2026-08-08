import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROLES, ROLE_KEYS, asRole, isRole, isRankable, roleHint, creditsForRole, PRINCIPAL_ROLES,
} from '../src/roles.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Los oficios vivían escritos a mano como `['director','actor']` en doce puntos
 * de index.js: añadir uno significaba acordarse de doce sitios, y olvidarse de
 * uno no rompía nada visible — ese endpoint rechazaba el rol en silencio.
 */

test('la dirección va primera y es principal', () => {
  assert.equal(ROLES[0].key, 'director');
  assert.equal(ROLES[1].key, 'actor');
  // el principio del proyecto: solo esos dos conservan tratamiento propio
  assert.deepEqual(PRINCIPAL_ROLES, ['director', 'actor']);
});

test('asRole acepta los seis oficios y rechaza lo demás', () => {
  for (const k of ROLE_KEYS) assert.equal(asRole(k), k);
  assert.equal(asRole('productor'), null);
  assert.equal(asRole(undefined), null);
  assert.equal(asRole('<script>'), null);
  assert.equal(asRole('nada', 'director'), 'director'); // con respaldo
  assert.equal(isRole('dop'), true);
});

test('solo tienen ranking los oficios que Plex guarda', () => {
  // Plex da director/guionista/actor/productor; fotografía, música y montaje NO,
  // así que pedir su «top de tu biblioteca» no tendría de dónde salir
  assert.equal(isRankable('director'), true);
  assert.equal(isRankable('actor'), true);
  assert.equal(isRankable('writer'), true);
  assert.equal(isRankable('dop'), false);
  assert.equal(isRankable('composer'), false);
  assert.equal(isRankable('editor'), false);
});

test('creditsForRole saca los créditos de cada oficio', () => {
  const credits = {
    cast: [{ id: 1, title: 'De actor' }],
    crew: [
      { id: 2, title: 'Dirigida', job: 'Director', department: 'Directing' },
      { id: 3, title: 'Escrita', job: 'Screenplay', department: 'Writing' },
      { id: 4, title: 'Fotografiada', job: 'Director of Photography', department: 'Camera' },
      { id: 5, title: 'Compuesta', job: 'Original Music Composer', department: 'Sound' },
      { id: 6, title: 'Montada', job: 'Editor', department: 'Editing' },
    ],
  };
  assert.deepEqual(creditsForRole(credits, 'actor').map((c) => c.id), [1]);
  assert.deepEqual(creditsForRole(credits, 'director').map((c) => c.id), [2]);
  assert.deepEqual(creditsForRole(credits, 'writer').map((c) => c.id), [3]);
  assert.deepEqual(creditsForRole(credits, 'dop').map((c) => c.id), [4]);
  assert.deepEqual(creditsForRole(credits, 'composer').map((c) => c.id), [5]);
  assert.deepEqual(creditsForRole(credits, 'editor').map((c) => c.id), [6]);
  assert.deepEqual(creditsForRole(credits, 'inventado'), []);
});

test('si el puesto exacto no aparece, vale el departamento', () => {
  // TMDB no es uniforme: hay fichas con «Cinematography» en vez de «Director of
  // Photography». Sin el respaldo por departamento, esas personas no tendrían obra.
  const credits = { crew: [{ id: 9, job: 'Cinematography', department: 'Camera' }] };
  assert.deepEqual(creditsForRole(credits, 'dop').map((c) => c.id), [9]);
});

test('roleHint da el departamento con el que buscar en TMDB', () => {
  assert.equal(roleHint('director'), 'Directing');
  assert.equal(roleHint('actor'), 'Acting');
  assert.equal(roleHint('composer'), 'Sound');
  assert.equal(roleHint('nada'), null);
});

test('ningún endpoint vuelve a llevar la lista de roles escrita a mano', () => {
  // La primera versión de este test solo miraba la variante de DOS elementos, y
  // por el agujero se coló `['director','actor','writer']` en la filmografía:
  // seguir a alguien como compositor y abrir su ficha enseñaba otra faceta.
  // Ahora se caza CUALQUIER array literal que enumere roles a mano.
  const src = fs.readFileSync(path.join(raiz, 'server/src/index.js'), 'utf8');
  const listas = src.match(/\[\s*'(?:director|actor|writer|dop|composer|editor)'[^\]]*\]/g) || [];
  assert.deepEqual(
    listas,
    [],
    `index.js enumera roles a mano (${listas.join(' ')}): usa asRole()/isRankable() de roles.js`
  );
});

test('seguir a alguien guarda EL oficio pedido, no uno colapsado', async () => {
  // Regresión de la 1.04: followFacets hacía `role === 'actor' ? 'actor' :
  // 'director'`, así que seguir a un compositor lo guardaba como director y su
  // ficha quedaba absurda. Lo cazó el agente que montaba la interfaz.
  const os = await import('node:os');
  const fsp = await import('node:fs');
  const pathp = await import('node:path');
  process.env.DATA_DIR = fsp.mkdtempSync(pathp.join(os.tmpdir(), 'powaflex-test-'));
  const { db } = await import('../src/db.js');
  const { followFacets } = await import('../src/tmdb.js');

  const id = db.prepare("INSERT INTO people (name) VALUES ('Compositora de prueba')").run().lastInsertRowid;
  const r = followFacets(id, 'composer');
  assert.equal(r.role, 'composer');
  const guardado = db.prepare('SELECT role FROM tracked_people WHERE person_id = ?').all(id).map((x) => x.role);
  assert.deepEqual(guardado, ['composer']);
  // y la regla automática de facetas NO se dispara para los oficios nuevos
  assert.equal(r.directorAlso, false);
  assert.equal(r.actorAlso, false);

  // un rol inventado cae en dirección en vez de guardar basura
  const id2 = db.prepare("INSERT INTO people (name) VALUES ('Otra')").run().lastInsertRowid;
  assert.equal(followFacets(id2, 'astronauta').role, 'director');
});

test('todas las claves de servicio se tratan como credenciales', async () => {
  // La lista estaba escrita dos veces y bastaba añadir un servicio en una para
  // que la otra lo dejara al descubierto; en la 1.04 pasó con la de Bazarr, que
  // se guardaba en claro y se servía sin enmascarar.
  const { SECRET_SETTING_KEYS } = await import('../src/db.js');
  for (const k of ['plex_token', 'tmdb_key', 'radarr_key', 'mdblist_key']) {
    assert.ok(SECRET_SETTING_KEYS.has(k), `${k} debería tratarse como credencial`);
  }
});

test('ningún sitio del servidor vuelve a colapsar el oficio a dos valores', () => {
  // El patrón `role === 'actor' ? 'actor' : 'director'` sobrevivió al refactor
  // en DOS sitios distintos (followFacets y /api/tracked/bulk) y en ambos daba
  // de alta a la gente en la faceta equivocada, en silencio.
  const sospechoso = /role\s*===\s*'actor'\s*\?\s*'actor'\s*:\s*'director'/;
  for (const f of ['index.js', 'tmdb.js', 'discover.js', 'automation.js']) {
    const src = fs.readFileSync(path.join(raiz, 'server/src', f), 'utf8');
    assert.equal(sospechoso.test(src), false, `${f} colapsa el oficio: usa asRole() de roles.js`);
  }
});

test('creditsForRole no convierte a un técnico de sonido en compositor', () => {
  // El respaldo por departamento entero fabricaba filmografías de gente que
  // nunca ejerció ese oficio, con sus «huecos» y su completismo inventados.
  const credits = {
    crew: [
      { id: 1, job: 'Sound Re-Recording Mixer', department: 'Sound' },
      { id: 2, job: 'Boom Operator', department: 'Sound' },
      { id: 3, job: 'Camera Operator', department: 'Camera' },
      { id: 4, job: 'Assistant Editor', department: 'Editing' },
    ],
  };
  assert.deepEqual(creditsForRole(credits, 'composer'), []);
  assert.deepEqual(creditsForRole(credits, 'dop'), []);
  assert.deepEqual(creditsForRole(credits, 'editor'), []);
  // y quien SÍ lo ejerce sigue apareciendo, con las variantes de puesto de TMDB
  const buenos = { crew: [{ id: 9, job: 'Cinematography', department: 'Camera' }] };
  assert.deepEqual(creditsForRole(buenos, 'dop').map((c) => c.id), [9]);
});

test('el calendario mira TODAS las facetas, no solo dirección e interpretación', () => {
  // Al añadirse fotografía, música y montaje, buildCalendar seguía preguntando
  // `roles.has('director')` / `roles.has('actor')`: a quien seguías por esos
  // oficios NO le salía nunca su próxima película, y encima costaba una
  // consulta a TMDB cada noche para tirar el resultado.
  const src = fs.readFileSync(path.join(raiz, 'server/src/tmdb.js'), 'utf8');
  assert.equal(
    /const wantDirector = p\.roles\.has\('director'\)/.test(src),
    false,
    'buildCalendar ha vuelto a mirar solo dos facetas: usa creditsForRole sobre p.roles'
  );
  assert.ok(
    /for \(const rol of p\.roles\)/.test(src),
    'buildCalendar debería recorrer las facetas seguidas'
  );
});

test('el auto-Radarr solo mira a los favoritos SEGUIDOS COMO DIRECTORES', () => {
  // Su consulta no filtraba por faceta, y su rama de «favoritos sin títulos en
  // biblioteca» es justo la única forma de seguir a un DoP o un montador: el
  // pase nocturno les descargaba las películas que hubieran dirigido alguna vez.
  const src = fs.readFileSync(path.join(raiz, 'server/src/automation.js'), 'utf8');
  assert.ok(
    /t\.role = 'director'/.test(src),
    'la consulta de directores del auto-Radarr debe filtrar por la faceta seguida'
  );
});
