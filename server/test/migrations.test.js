import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

// A DB created by an older PowaFlex, before this session's migrations: people
// still has name UNIQUE and no demographics, lb_entries has no tmdb_id and
// duplicated rows (the NULL-hole in its UNIQUE), tracked_people has no role.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));
process.env.DATA_DIR = dir;
delete process.env.POWAFLEX_SECRET;

const legacy = new Database(path.join(dir, 'powaflex.db'));
legacy.exec(`
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE movies (
  rating_key INTEGER PRIMARY KEY, section_id INTEGER, title TEXT, sort_title TEXT,
  original_title TEXT, year INTEGER, release_date TEXT, added_at INTEGER, updated_at INTEGER,
  last_viewed_at INTEGER, view_count INTEGER DEFAULT 0, user_rating REAL, audience_rating REAL,
  critic_rating REAL, duration_ms INTEGER, content_rating TEXT, studio TEXT, tagline TEXT,
  summary TEXT, tmdb_id INTEGER, imdb_id TEXT, thumb TEXT, art TEXT, resolution TEXT,
  video_codec TEXT, audio_codec TEXT, audio_channels INTEGER, container TEXT, bit_depth INTEGER,
  hdr TEXT, size_bytes INTEGER, bitrate INTEGER, media_count INTEGER DEFAULT 1, edition TEXT,
  file_path TEXT, full_synced INTEGER DEFAULT 0
);
CREATE TABLE people (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, thumb TEXT, tmdb_id INTEGER);
CREATE TABLE movie_people (
  movie_id INTEGER, person_id INTEGER, role TEXT, character TEXT, ord INTEGER,
  PRIMARY KEY (movie_id, person_id, role)
);
CREATE TABLE tracked_people (person_id INTEGER PRIMARY KEY, added_at INTEGER);
CREATE TABLE lb_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, list TEXT, title TEXT, year INTEGER, rating REAL,
  watched_date TEXT, uri TEXT, movie_id INTEGER,
  UNIQUE (list, title, year, watched_date, uri)
);
CREATE TABLE lb_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, name TEXT, url TEXT, source TEXT,
  official INTEGER DEFAULT 0, item_count INTEGER, added_at INTEGER, refreshed_at INTEGER
);

INSERT INTO movies (rating_key, title, year, view_count) VALUES (1, 'Sin perdón', 1992, 1);
INSERT INTO people (id, name, thumb) VALUES (7, 'Clint Eastwood', '/ce.jpg'), (8, 'Anna Karina', NULL);
INSERT INTO movie_people (movie_id, person_id, role, ord) VALUES (1, 7, 'director', 0), (1, 7, 'actor', 0);
INSERT INTO tracked_people (person_id, added_at) VALUES (7, 1700000000000);
-- duplicates the old UNIQUE let through because of the NULLs
INSERT INTO lb_entries (list, title, year, rating, movie_id) VALUES ('watchlist', 'Repetida', 1980, NULL, NULL);
INSERT INTO lb_entries (list, title, year, rating, movie_id) VALUES ('watchlist', 'Repetida', 1980, NULL, 1);
INSERT INTO lb_entries (list, title, year, rating, movie_id) VALUES ('watchlist', 'Repetida', 1980, NULL, NULL);
INSERT INTO lb_entries (list, title, year, rating, movie_id) VALUES ('watchlist', 'Única', NULL, NULL, NULL);
`);
legacy.close();

// booting on that DB must not break
const { db, getSetting, setSetting } = await import('../src/db.js');

const cols = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

test('las migraciones añaden las columnas nuevas sin perder datos', () => {
  for (const c of ['birthday', 'deathday', 'details_fetched_at', 'gender', 'place_of_birth', 'country', 'continent', 'plex_tag_id'])
    assert.ok(cols('people').includes(c), `falta people.${c}`);
  assert.ok(cols('lb_entries').includes('tmdb_id'));
  assert.ok(cols('lb_entries').includes('poster_path'));
  assert.ok(cols('lb_lists').includes('hidden'));
  assert.ok(cols('movies').includes('english_title'));
  assert.ok(cols('tracked_people').includes('role'));

  const p = db.prepare('SELECT id, name, thumb FROM people ORDER BY id').all();
  assert.deepEqual(p, [
    { id: 7, name: 'Clint Eastwood', thumb: '/ce.jpg' },
    { id: 8, name: 'Anna Karina', thumb: null },
  ]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM movie_people').get().n, 2, 'los ids siguen valiendo');
  assert.equal(db.prepare('SELECT role FROM tracked_people WHERE person_id = 7').get().role, 'director');
});

test('la tabla people se reconstruye sin el UNIQUE del nombre', () => {
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'people'").get().sql;
  assert.ok(!/name\s+TEXT\s+UNIQUE/i.test(sql), sql);
  // two homonyms now fit
  db.prepare("INSERT INTO people (name, plex_tag_id) VALUES ('Homónimo', 'k1')").run();
  db.prepare("INSERT INTO people (name, plex_tag_id) VALUES ('Homónimo', 'k2')").run();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM people WHERE name = 'Homónimo'").get().n, 2);
  // but the tag key stays unique
  assert.throws(() => db.prepare("INSERT INTO people (name, plex_tag_id) VALUES ('Otro', 'k1')").run());
  // AUTOINCREMENT must not reuse old ids
  assert.ok(db.prepare("SELECT MIN(id) n FROM people WHERE name = 'Homónimo'").get().n > 8);
});

test('los duplicados heredados de lb_entries se colapsan y el índice los impide', () => {
  const rows = db.prepare("SELECT movie_id FROM lb_entries WHERE title = 'Repetida'").all();
  assert.equal(rows.length, 1, 'de tres copias queda una');
  assert.equal(rows[0].movie_id, 1, 'se conserva la fila con película enlazada');
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_lb_unique'").get());
  const res = db
    .prepare(`INSERT OR IGNORE INTO lb_entries (list, title, year) VALUES ('watchlist', 'Única', NULL)`)
    .run();
  assert.equal(res.changes, 0, 'el índice de expresiones sí ve los NULL');
});

test('sin POWAFLEX_SECRET las credenciales se guardan en claro (compatibilidad)', () => {
  setSetting('plex_token', 'token-en-claro');
  assert.equal(getSetting('plex_token'), 'token-en-claro');
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'plex_token'").get().value, 'token-en-claro');
});
