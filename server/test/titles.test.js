import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { needsLatin, readableTitle } = await import('../src/titles.js');
const { signatureFilms } = await import('../src/discover.js');
const { normalizeLibraryTitles } = await import('../src/tmdb.js');
const { db } = await import('../src/db.js');

test('solo se traduce lo que no está en alfabeto latino', () => {
  for (const t of ['Amélie', 'El espíritu de la colmena', 'Kærlighed', '8½', 'Mother!', 'La Dolce Vita']) {
    assert.equal(needsLatin(t), false, `${t} es latino y no se toca`);
  }
  for (const t of ['志愿军：雄兵出击', '千と千尋の神隠し', '기생충', 'Смерть в Венеции', 'العاشق', 'ไทย']) {
    assert.equal(needsLatin(t), true, `${t} hay que cambiarlo`);
  }
});

test('readableTitle se queda con el primer recambio legible', () => {
  assert.equal(readableTitle('志愿军：雄兵出击', 'The Volunteers: To the War'), 'The Volunteers: To the War');
  assert.equal(readableTitle('Amélie', 'Amelie'), 'Amélie', 'lo latino no se sustituye nunca');
  assert.equal(readableTitle('기생충', '', null), '기생충', 'sin recambio, se deja lo que había');
  assert.equal(readableTitle('기생충', '寄生虫', 'Parasite'), 'Parasite', 'se salta los recambios ilegibles');
});

test('normalizeLibraryTitles usa el título inglés y conserva el de Plex', async () => {
  db.prepare(
    `INSERT INTO movies (rating_key, title, plex_title, year, tmdb_id, english_title)
     VALUES (1, '志愿军：雄兵出击', '志愿军：雄兵出击', 2023, 900001, 'The Volunteers: To the War')`
  ).run();
  db.prepare(
    `INSERT INTO movies (rating_key, title, plex_title, year, tmdb_id, english_title)
     VALUES (2, 'El espíritu de la colmena', 'El espíritu de la colmena', 1973, 900002, 'The Spirit of the Beehive')`
  ).run();

  const r = await normalizeLibraryTitles();
  assert.equal(r.checked, 1, 'solo la china entra a revisión');
  assert.equal(r.renamed, 1);

  const china = db.prepare('SELECT title, plex_title FROM movies WHERE rating_key = 1').get();
  assert.equal(china.title, 'The Volunteers: To the War');
  assert.equal(china.plex_title, '志愿军：雄兵出击', 'lo que dice Plex no se pierde');

  const espanola = db.prepare('SELECT title FROM movies WHERE rating_key = 2').get();
  assert.equal(espanola.title, 'El espíritu de la colmena', 'una española se queda como está');
});

test('las películas insignia son las mejor valoradas con votos de sobra', () => {
  const items = [
    { tmdb_id: 1, title: 'Obra maestra', vote: 8.4, votes: 12000, date: '1975-01-01' },
    { tmdb_id: 2, title: 'La otra buena', vote: 8.1, votes: 5000, date: '1980-01-01' },
    { tmdb_id: 3, title: 'Corto de juventud', vote: 9.8, votes: 11, date: '1968-01-01' },
    { tmdb_id: 4, title: 'Del montón', vote: 6.2, votes: 900, date: '1990-01-01' },
    { tmdb_id: 5, title: 'Sin estrenar', vote: 9.9, votes: 4000, released: false },
  ];
  const firma = signatureFilms(items);
  assert.deepEqual(firma.map((f) => f.title), ['Obra maestra', 'La otra buena']);
  assert.equal(firma[0].year, 1975);
});

test('sin ninguna película con votos de sobra, deciden los votos', () => {
  const items = [
    { tmdb_id: 1, title: 'Poco vista pero buena', vote: 7.9, votes: 40, date: '2001-01-01' },
    { tmdb_id: 2, title: 'Menos vista', vote: 8.6, votes: 9, date: '2004-01-01' },
  ];
  assert.deepEqual(signatureFilms(items).map((f) => f.title), ['Menos vista', 'Poco vista pero buena']);
});
