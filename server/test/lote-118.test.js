import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// base propia: estas pruebas escriben en la caché de TMDB y en el log de reglas
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-lote118-'));

const { db, cacheWrite } = await import('../src/db.js');
const { resolveFilms } = await import('../src/festivals.js');
const { enviosDeFavoritos } = await import('../src/rules.js');
const { invalidarFilmografiasSeguidas, olvidarFilmografia } = await import('../src/tmdb.js');

const LANG = 'es-ES';
const DIA = 24 * 3600 * 1000;

/**
 * La ficha de TMDB, puesta EN LA CACHÉ: así el emparejado no sale a la red y
 * estas pruebas comprueban la lógica de verdad en vez de un doble.
 * `movie_cr:` es el superset con créditos, del que `movieSummary` también tira.
 */
function fichaEnCache(id, { title, date, directors = [] }) {
  cacheWrite(`movie_cr:${id}:${LANG}`, {
    id,
    title,
    original_title: title,
    release_date: date,
    poster_path: `/${id}.jpg`,
    runtime: 110,
    genres: [{ id: 18, name: 'Drama' }],
    credits: { crew: directors.map((name, i) => ({ id: 9000 + i, name, job: 'Director' })) },
  });
}

// --- Festivales: los palmareses empaquetados llegan sin dirección -------------
//
// Sundance, Sitges y el Donatello vienen con el id de TMDB puesto y sin ninguna
// columna de dirección: su rama del emparejado era la única que no le pedía los
// nombres a TMDB, y esas películas salían con cartel, con nota y sin una sola
// persona a la que seguir.
test('una fila con id de TMDB y sin dirección la saca de TMDB', async () => {
  fichaEnCache(473019, { title: 'The Souvenir', date: '2019-05-17', directors: ['Joanna Hogg'] });
  fichaEnCache(619264, { title: 'El hoyo', date: '2019-11-08', directors: ['Galder Gaztelu-Urrutia'] });
  const rows = [
    { year: 2019, title: 'The Souvenir', director: null, tmdb_id: 473019 },
    { year: 2019, title: 'El hoyo', director: null, tmdb_id: 619264 },
  ];
  const { films, errors } = await resolveFilms(rows, (r) => r.year);
  assert.equal(errors, 0);
  assert.equal(films.find((f) => f.tmdb_id === 473019).director, 'Joanna Hogg');
  assert.equal(films.find((f) => f.tmdb_id === 619264).director, 'Galder Gaztelu-Urrutia');
  // y el cartel sigue saliendo del mismo sitio, sin una petición de más
  assert.equal(films[0].poster_path, '/473019.jpg');
});

test('la dirección de la FILA manda sobre la de TMDB', async () => {
  fichaEnCache(575452, { title: 'El traidor', date: '2019-05-23', directors: ['Otro Cualquiera'] });
  const rows = [{ year: 2019, title: 'El traidor', director: 'Marco Bellocchio', tmdb_id: 575452 }];
  const { films } = await resolveFilms(rows, (r) => r.year);
  assert.equal(films[0].director, 'Marco Bellocchio');
});

test('varias personas dirigiendo salen juntas, como en el resto de la página', async () => {
  fichaEnCache(700100, { title: 'A cuatro manos', date: '2020-01-01', directors: ['Joel Coen', 'Ethan Coen'] });
  const rows = [{ year: 2020, title: 'A cuatro manos', director: null, tmdb_id: 700100 }];
  const { films } = await resolveFilms(rows, (r) => r.year);
  assert.equal(films[0].director, 'Joel Coen, Ethan Coen');
});

// --- Dashboard: qué bajó SOLO el pase de favoritos, y por quién ---------------

test('enviosDeFavoritos solo trae las altas del pase de favoritos, con su persona', () => {
  db.prepare(
    `INSERT INTO radarr_rules (id, kind, source, scope, enabled, min_score, allow_unrated, cap, created_at)
     VALUES (1, 'favoritos', 'director', '', 1, 0, 0, 20, 0)`
  ).run();
  db.prepare(
    `INSERT INTO radarr_rules (id, kind, source, scope, enabled, min_score, allow_unrated, cap, created_at)
     VALUES (2, 'festival', 'cannes', 'palmares', 1, 60, 0, 20, 0)`
  ).run();
  const ins = db.prepare(
    'INSERT INTO radarr_rule_log (rule_id, at, tmdb_id, title, score, action, detail, person) VALUES (?,?,?,?,?,?,?,?)'
  );
  const ahora = Date.now();
  ins.run(1, ahora - DIA, 111, 'Con persona', 70, 'added', 'Mis favoritos', 'Marina Serésesky');
  ins.run(1, ahora - 2 * DIA, 112, 'Sin persona (fila vieja)', 60, 'added', 'Mis favoritos', null);
  ins.run(1, ahora - 3 * DIA, null, null, null, 'skipped', 'ya la tienes: 4', null); // resumen: fuera
  ins.run(2, ahora - DIA, 113, 'De una regla de festival', 80, 'added', 'Cannes', null); // otra regla: fuera
  ins.run(1, ahora - 40 * DIA, 114, 'Demasiado vieja', 50, 'added', 'Mis favoritos', 'Alguien'); // fuera de plazo

  const filas = enviosDeFavoritos({ days: 30, limit: 50 });
  assert.deepEqual(filas.map((f) => f.tmdb_id), [111, 112]);
  assert.equal(filas[0].person, 'Marina Serésesky');
  assert.equal(filas[1].person, null); // las anteriores a la columna NO se inventan
  assert.equal(filas[0].role, 'director');
});

test('enviosDeFavoritos dice si la película ya tiene archivo en Radarr', () => {
  db.prepare(
    `INSERT OR REPLACE INTO radarr_movies (tmdb_id, title, year, added, has_file, monitored, synced_at)
     VALUES (111, 'Con persona', 2026, '2026-08-01', 1, 1, 0)`
  ).run();
  const filas = enviosDeFavoritos({ days: 30, limit: 50 });
  assert.equal(filas.find((f) => f.tmdb_id === 111).has_file, 1);
  // la que Radarr no tiene en su copia local no miente diciendo que sí
  assert.equal(filas.find((f) => f.tmdb_id === 112).has_file, null);
});

// --- Filmografías: a tus favoritos se les relee entera cada noche -------------

test('el barrido nocturno tira la filmografía de a quien sigues, y solo de esa gente', () => {
  db.prepare(`INSERT INTO people (id, name, tmdb_id) VALUES (500, 'Seguida Viva', 1007592)`).run();
  db.prepare(`INSERT INTO people (id, name, tmdb_id) VALUES (501, 'Seguido Muerto', 900002)`).run();
  db.prepare(`INSERT INTO people (id, name, tmdb_id) VALUES (502, 'No Seguida', 900003)`).run();
  db.prepare(`UPDATE people SET deathday = '1999-01-01' WHERE id = 501`).run();
  for (const id of [500, 501, 502]) {
    db.prepare('INSERT OR REPLACE INTO tracked_people (person_id, role, added_at) VALUES (?,?,?)').run(id, 'director', 0);
  }
  db.prepare('DELETE FROM tracked_people WHERE person_id = 502').run();
  for (const tm of [1007592, 900002, 900003]) {
    cacheWrite(`person_credits:${tm}:${LANG}`, { id: tm, cast: [], crew: [] });
    cacheWrite(`person:${tm}:${LANG}`, { id: tm });
  }

  const r = invalidarFilmografiasSeguidas();
  const sigueEnCache = (tm) =>
    !!db.prepare('SELECT 1 FROM tmdb_cache WHERE key = ?').get(`person_credits:${tm}:${LANG}`);

  assert.equal(r.seguidos, 1); // solo la viva y seguida
  assert.equal(sigueEnCache(1007592), false); // se relee esta noche
  // la FICHA (foto, biografía, fallecimiento) no la toca: la acaba de refrescar
  // el paso de «estado vital», unos minutos antes en la misma pasada
  assert.equal(!!db.prepare('SELECT 1 FROM tmdb_cache WHERE key = ?').get(`person:1007592:${LANG}`), true);
  assert.equal(sigueEnCache(900002), true); // fallecida: no va a estrenar nada
  assert.equal(sigueEnCache(900003), true); // no la sigues: se queda con sus 7 días
});

test('olvidarFilmografia se lleva créditos y ficha de esa persona, y de nadie más', () => {
  cacheWrite(`person_credits:900010:${LANG}`, { id: 900010 });
  cacheWrite(`person:900010:${LANG}`, { id: 900010 });
  cacheWrite(`person_credits:900011:${LANG}`, { id: 900011 });
  olvidarFilmografia(900010);
  const hay = (k) => !!db.prepare('SELECT 1 FROM tmdb_cache WHERE key = ?').get(k);
  assert.equal(hay(`person_credits:900010:${LANG}`), false);
  assert.equal(hay(`person:900010:${LANG}`), false);
  assert.equal(hay(`person_credits:900011:${LANG}`), true);
  // un id que no vale no borra media caché
  assert.equal(olvidarFilmografia(0), 0);
  assert.equal(hay(`person_credits:900011:${LANG}`), true);
});
