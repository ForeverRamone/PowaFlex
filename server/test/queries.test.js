import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { listMovies } = await import('../src/queries.js');
const { db } = await import('../src/db.js');

// regression: search args used to be bound before JOIN args while the SQL put
// the JOINs first, so search+genre (or person/country/collection) returned 0
test('listMovies liga bien los parámetros al combinar búsqueda con filtros', () => {
  db.prepare(`INSERT INTO movies (rating_key, title, year, view_count) VALUES (10, 'Alien', 1979, 0)`).run();
  db.prepare(`INSERT INTO movies (rating_key, title, year, view_count) VALUES (11, 'Aliens', 1986, 0)`).run();
  db.prepare(`INSERT INTO movies (rating_key, title, year, view_count) VALUES (12, 'Amadeus', 1984, 0)`).run();
  db.prepare(`INSERT INTO tags (id, type, name) VALUES (1, 'genre', 'Terror')`).run();
  db.prepare(`INSERT INTO movie_tags (movie_id, tag_id) VALUES (10, 1)`).run();
  db.prepare(`INSERT INTO people (id, name) VALUES (5, 'Ridley Scott')`).run();
  db.prepare(`INSERT INTO movie_people (movie_id, person_id, role, ord) VALUES (10, 5, 'director', 0)`).run();

  // search + genre
  const byGenre = listMovies({ search: 'Alien', genres: ['Terror'] });
  assert.equal(byGenre.total, 1);
  assert.equal(byGenre.movies[0].rating_key, 10);

  // search dentro de la filmografía de una persona
  const byPerson = listMovies({ search: 'Alien', personId: 5, personRole: 'director' });
  assert.equal(byPerson.total, 1);
  assert.equal(byPerson.movies[0].rating_key, 10);

  // sin filtros extra sigue funcionando
  assert.equal(listMovies({ search: 'Alien' }).total, 2);
});
