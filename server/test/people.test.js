import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { applyDetail } = await import('../src/plex.js');
const { db } = await import('../src/db.js');

const addMovie = (key, title) =>
  db.prepare('INSERT OR IGNORE INTO movies (rating_key, title, year) VALUES (?, ?, 2000)').run(key, title);

const peopleNamed = (name) =>
  db.prepare('SELECT id, name, plex_tag_id FROM people WHERE name = ? ORDER BY id').all(name);

const personOf = (movieId, role) =>
  db.prepare('SELECT person_id FROM movie_people WHERE movie_id = ? AND role = ?').get(movieId, role)?.person_id;

// regression: identity came from people.name (UNIQUE), so two different people
// with the same name shared one row and one mixed filmography
test('dos personas distintas con el mismo nombre no se fusionan', () => {
  addMovie(1, 'Película A');
  addMovie(2, 'Película B');
  addMovie(3, 'Película C');
  applyDetail(1, { Director: [{ tag: 'John Smith', tagKey: 'plex:alpha', thumb: '/a.jpg' }] });
  applyDetail(2, { Director: [{ tag: 'John Smith', tagKey: 'plex:beta' }] });
  applyDetail(3, { Director: [{ tag: 'John Smith', tagKey: 'plex:alpha' }] });

  const rows = peopleNamed('John Smith');
  assert.equal(rows.length, 2, 'dos tagKey distintos = dos personas');
  assert.deepEqual(rows.map((r) => r.plex_tag_id), ['plex:alpha', 'plex:beta']);
  assert.equal(personOf(1, 'director'), personOf(3, 'director'), 'mismo tagKey = misma persona');
  assert.notEqual(personOf(1, 'director'), personOf(2, 'director'));
});

test('el mismo tagKey en distintos roles sigue siendo una sola persona', () => {
  addMovie(4, 'El autoestopista');
  applyDetail(4, {
    Director: [{ tag: 'Ida Lupino', tagKey: 'plex:ida' }],
    Role: [{ tag: 'Ida Lupino', tagKey: 'plex:ida', role: 'Ella misma' }],
  });
  assert.equal(peopleNamed('Ida Lupino').length, 1);
  assert.equal(personOf(4, 'director'), personOf(4, 'actor'));
});

test('una fila antigua sin tagKey la adopta el primer tag que llega', () => {
  const legacyId = db.prepare("INSERT INTO people (name) VALUES ('Persona Antigua')").run().lastInsertRowid;
  addMovie(5, 'Película D');
  applyDetail(5, { Director: [{ tag: 'Persona Antigua', tagKey: 'plex:antigua' }] });

  const rows = peopleNamed('Persona Antigua');
  assert.equal(rows.length, 1, 'no se duplica la fila heredada');
  assert.equal(rows[0].id, legacyId);
  assert.equal(rows[0].plex_tag_id, 'plex:antigua');
});

test('sin tagKey (agentes antiguos de Plex) se mantiene el emparejado por nombre', () => {
  addMovie(6, 'Película E');
  addMovie(7, 'Película F');
  applyDetail(6, { Director: [{ tag: 'Sin Clave' }] });
  applyDetail(7, { Director: [{ tag: 'Sin Clave' }] });
  assert.equal(peopleNamed('Sin Clave').length, 1);
});

test('people.name ya no es UNIQUE en el esquema', () => {
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'people'").get().sql;
  assert.ok(!/name\s+TEXT\s+UNIQUE/i.test(sql), sql);
});
