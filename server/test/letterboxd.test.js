import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { normTitle, parseListCsv, parseRssItems, matchMovie } = await import('../src/letterboxd.js');
const { db } = await import('../src/db.js');

test('normTitle strips diacritics, articles and punctuation', () => {
  assert.equal(normTitle('Amélie'), normTitle('Amelie'));
  assert.equal(normTitle('The Godfather'), 'godfather');
  assert.equal(normTitle('L\'Avventura'), 'avventura');
  assert.equal(normTitle('WALL·E'), 'wall e');
  assert.equal(normTitle('¿Qué he hecho yo para merecer esto?!'), 'que he hecho yo para merecer esto');
});

test('parseListCsv reads the metadata name and items table', () => {
  const csv = [
    'Letterboxd list export v7',
    'Date,Name,Tags,URL,Description',
    '2026-02-15,IMDb Top 250,owned,https://boxd.it/abc,mi descripción',
    '',
    'Position,Name,Year,URL,Description',
    '1,The Godfather,1972,https://boxd.it/x1,',
    '2,"Amélie, la fabuleuse",2001,https://boxd.it/x2,',
  ].join('\n');
  const { meta, items } = parseListCsv(csv);
  assert.equal(meta.name, 'IMDb Top 250');
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { position: 1, title: 'The Godfather', year: 1972, uri: 'https://boxd.it/x1' });
  assert.equal(items[1].title, 'Amélie, la fabuleuse');
  assert.equal(items[1].year, 2001);
});

test('parseRssItems extracts film fields and ignores non-film items', () => {
  const xml = `<rss><channel>
    <item>
      <title>Taxi Driver, 1976 - ★★★★½</title>
      <link>https://letterboxd.com/u/film/taxi-driver/</link>
      <letterboxd:filmTitle>Taxi Driver</letterboxd:filmTitle>
      <letterboxd:filmYear>1976</letterboxd:filmYear>
      <letterboxd:memberRating>4.5</letterboxd:memberRating>
      <letterboxd:watchedDate>2026-06-01</letterboxd:watchedDate>
      <tmdb:movieId>103</tmdb:movieId>
    </item>
    <item>
      <title>A list, not a film</title>
      <link>https://letterboxd.com/u/list/foo/</link>
    </item>
  </channel></rss>`;
  const items = parseRssItems(xml);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    title: 'Taxi Driver', year: 1976, rating: 4.5, watchedDate: '2026-06-01',
    tmdbId: 103, uri: 'https://letterboxd.com/u/film/taxi-driver/',
  });
});

test('matchMovie matches by tmdb id, then normalised title within ±1 year', () => {
  db.prepare(
    `INSERT INTO movies (rating_key, title, original_title, year, tmdb_id) VALUES
     (1, 'El padrino', 'The Godfather', 1972, 238),
     (2, 'Amélie', 'Le fabuleux destin d''Amélie Poulain', 2001, 194)`
  ).run();

  // exact tmdb id wins
  assert.equal(matchMovie({ title: 'whatever', year: 1900, tmdbId: 238 }), 1);
  // original (English) title matches a Spanish library entry
  assert.equal(matchMovie({ title: 'The Godfather', year: 1972 }), 1);
  // one year off still matches
  assert.equal(matchMovie({ title: 'The Godfather', year: 1973 }), 1);
  // accents normalised
  assert.equal(matchMovie({ title: 'Amelie', year: 2001 }), 2);
  // no match returns null
  assert.equal(matchMovie({ title: 'Nonexistent Film', year: 2020 }), null);
});
