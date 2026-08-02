import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { needsLatin, readableTitle } = await import('../src/titles.js');
const { signatureFilms } = await import('../src/discover.js');
const { normalizeLibraryTitles, normalizePeopleNames, latinizeNames } = await import('../src/tmdb.js');
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

test('los nombres en otro alfabeto salen de also_known_as de TMDB', async () => {
  // la transcripción latina vive en la caché de TMDB, así que no hay red de por medio
  db.prepare(
    `INSERT OR REPLACE INTO tmdb_cache (key, json, fetched_at) VALUES (?, ?, ?)`
  ).run(
    'person:77001:es-ES',
    JSON.stringify({ id: 77001, name: '深田晃司', also_known_as: ['ふかだ こうじ', 'Kôji Fukada', 'Koji Fukada'] }),
    Date.now()
  );
  db.prepare(`INSERT INTO people (id, name, plex_name, tmdb_id) VALUES (7001, '深田晃司', '深田晃司', 77001)`).run();
  db.prepare(`INSERT INTO people (id, name, plex_name, tmdb_id) VALUES (7002, 'Víctor Erice', 'Víctor Erice', 77002)`).run();

  const r = await normalizePeopleNames();
  assert.equal(r.checked, 1, 'solo el japonés entra a revisión');
  assert.equal(r.renamed, 1);

  const fukada = db.prepare('SELECT name, plex_name FROM people WHERE id = 7001').get();
  assert.equal(fukada.name, 'Kôji Fukada', 'se salta la transcripción en kana');
  assert.equal(fukada.plex_name, '深田晃司', 'el nombre de Plex no se pierde');
  assert.equal(db.prepare('SELECT name FROM people WHERE id = 7002').get().name, 'Víctor Erice');
});

test('latinizeNames arregla en el sitio y deja en paz lo latino', async () => {
  const gente = [
    { tmdb_id: 77001, name: '深田晃司', credit: 'Dirige' },
    { tmdb_id: 77002, name: 'Víctor Erice', credit: 'Dirige' },
    { name: 'Sin id', credit: 'Actúa' },
  ];
  await latinizeNames(gente);
  assert.deepEqual(gente.map((g) => g.name), ['Kôji Fukada', 'Víctor Erice', 'Sin id']);
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

test('las insignia solo son largometrajes: fuera cortos, docs, conciertos, TV, coral y cameos', () => {
  const items = [
    { tmdb_id: 1, title: 'Corto premiado', vote: 9.5, votes: 5000, date: '1962-01-01', isShort: true },
    { tmdb_id: 2, title: 'Documental suelto', vote: 9.3, votes: 4000, date: '1990-01-01', isDocumentary: true },
    { tmdb_id: 3, title: 'El concierto', vote: 9.2, votes: 4000, date: '1984-01-01', isMusic: true },
    { tmdb_id: 4, title: 'Telefilme', vote: 9.1, votes: 4000, date: '1995-01-01', isTvMovie: true },
    { tmdb_id: 5, title: 'Película coral', vote: 9.0, votes: 4000, date: '2002-01-01', isCoral: true },
    { tmdb_id: 6, title: 'Cameo', vote: 8.9, votes: 4000, date: '2010-01-01', isCameo: true },
    { tmdb_id: 7, title: 'Su gran largo', vote: 8.2, votes: 9000, date: '1975-01-01' },
    { tmdb_id: 8, title: 'El otro largo', vote: 7.8, votes: 6000, date: '1980-01-01' },
  ];
  assert.deepEqual(signatureFilms(items).map((f) => f.title), ['Su gran largo', 'El otro largo']);
});

test('a un documentalista sí le representan sus documentales', () => {
  const docs = Array.from({ length: 4 }, (_, i) => ({
    tmdb_id: i + 1, title: `Documental ${i + 1}`, vote: 8 + i / 10, votes: 3000, date: `199${i}-01-01`, isDocumentary: true,
  }));
  const items = [...docs, { tmdb_id: 9, title: 'Su única ficción', vote: 7.1, votes: 3000, date: '2005-01-01' }];
  assert.deepEqual(signatureFilms(items).map((f) => f.title), ['Documental 4', 'Documental 3']);
});

test('sin ninguna película con votos de sobra, deciden los votos', () => {
  const items = [
    { tmdb_id: 1, title: 'Poco vista pero buena', vote: 7.9, votes: 40, date: '2001-01-01' },
    { tmdb_id: 2, title: 'Menos vista', vote: 8.6, votes: 9, date: '2004-01-01' },
  ];
  assert.deepEqual(signatureFilms(items).map((f) => f.title), ['Menos vista', 'Poco vista pero buena']);
});
