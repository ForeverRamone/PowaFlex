import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { db } = await import('../src/db.js');
const { resolvePerson } = await import('../src/tmdb.js');

const cache = (key, json) =>
  db.prepare('INSERT OR REPLACE INTO tmdb_cache (key, json, fetched_at) VALUES (?, ?, ?)')
    .run(key, JSON.stringify(json), Date.now());

const credits = (id, movieIds, job = 'Director') =>
  cache(`person_credits:${id}:es-ES`, { crew: movieIds.map((m) => ({ id: m, job })), cast: [] });

function seedLibrary(ratingKeys) {
  for (const [rk, tmdb] of ratingKeys) {
    db.prepare('INSERT OR REPLACE INTO movies (rating_key, title, tmdb_id) VALUES (?, ?, ?)').run(rk, `Peli ${tmdb}`, tmdb);
  }
}

test('gana el candidato cuya filmografía coincide con tus películas, no el más popular', async () => {
  // tienes tres películas del Alberto Rodríguez director español
  seedLibrary([[10, 501], [11, 502], [12, 503]]);
  db.prepare("INSERT INTO people (id, name) VALUES (100, 'Alberto Rodríguez')").run();
  for (const rk of [10, 11, 12]) {
    db.prepare("INSERT INTO movie_people (movie_id, person_id, role, ord) VALUES (?, 100, 'director', 0)").run(rk);
  }

  // TMDB devuelve primero a un homónimo (el de animación) y luego al bueno
  cache('person_search_all:alberto rodríguez', { results: [{ id: 9001 }, { id: 9002 }] });
  credits(9001, [77777, 88888]); // «Ozzy» y compañía: nada tuyo
  credits(9002, [501, 502, 503]);

  const p = await resolvePerson(100);
  assert.equal(p.tmdb_id, 9002, 'se queda con el que sí dirigió tus películas');
  assert.equal(p.tmdb_verified, 1);
});

test('un emparejado anterior equivocado se corrige solo', async () => {
  seedLibrary([[20, 601], [21, 602]]);
  // la fila ya venía apuntando al homónimo, sin verificar
  db.prepare("INSERT INTO people (id, name, tmdb_id) VALUES (200, 'Richard Brooks', 9101)").run();
  for (const rk of [20, 21]) {
    db.prepare("INSERT INTO movie_people (movie_id, person_id, role, ord) VALUES (?, 200, 'director', 0)").run(rk);
  }
  cache('person_search_all:richard brooks', { results: [{ id: 9101 }, { id: 9102 }] });
  credits(9101, [70001]); // el actor homónimo
  credits(9102, [601, 602]); // el director

  const p = await resolvePerson(200);
  assert.equal(p.tmdb_id, 9102);
  assert.equal(p.tmdb_verified, 1);
});

test('sin ninguna coincidencia no se da por bueno: se reintentará', async () => {
  seedLibrary([[30, 701]]);
  db.prepare("INSERT INTO people (id, name) VALUES (300, 'Nombre Rarísimo')").run();
  db.prepare("INSERT INTO movie_people (movie_id, person_id, role, ord) VALUES (30, 300, 'director', 0)").run();
  cache('person_search_all:nombre rarísimo', { results: [{ id: 9201 }] });
  credits(9201, [90909]);

  const p = await resolvePerson(300);
  assert.equal(p.tmdb_verified, 0, 'queda sin verificar para volver a intentarlo');
});

test('un favorito sin películas tuyas se deja como está (no hay con qué contrastar)', async () => {
  db.prepare("INSERT INTO people (id, name, tmdb_id) VALUES (400, 'Alguien De TMDB', 9301)").run();
  const p = await resolvePerson(400);
  assert.equal(p.tmdb_id, 9301, 'no se toca el id que vino de TMDB');
});

test('una vez verificado no se vuelve a consultar', async () => {
  db.prepare("INSERT INTO people (id, name, tmdb_id, tmdb_verified) VALUES (500, 'Ya Verificado', 9401, 1)").run();
  const p = await resolvePerson(500);
  assert.equal(p.tmdb_id, 9401);
});
