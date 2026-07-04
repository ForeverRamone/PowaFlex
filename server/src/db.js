import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'img'), { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'powaflex.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS movies (
  rating_key INTEGER PRIMARY KEY,
  section_id INTEGER,
  title TEXT,
  sort_title TEXT,
  original_title TEXT,
  year INTEGER,
  release_date TEXT,
  added_at INTEGER,
  updated_at INTEGER,
  last_viewed_at INTEGER,
  view_count INTEGER DEFAULT 0,
  user_rating REAL,
  audience_rating REAL,
  critic_rating REAL,
  duration_ms INTEGER,
  content_rating TEXT,
  studio TEXT,
  tagline TEXT,
  summary TEXT,
  tmdb_id INTEGER,
  imdb_id TEXT,
  thumb TEXT,
  art TEXT,
  resolution TEXT,
  video_codec TEXT,
  audio_codec TEXT,
  audio_channels INTEGER,
  container TEXT,
  bit_depth INTEGER,
  hdr TEXT,
  size_bytes INTEGER,
  bitrate INTEGER,
  media_count INTEGER DEFAULT 1,
  edition TEXT,
  file_path TEXT,
  full_synced INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_movies_tmdb ON movies(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_movies_year ON movies(year);
CREATE INDEX IF NOT EXISTS idx_movies_added ON movies(added_at);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  thumb TEXT,
  tmdb_id INTEGER
);

CREATE TABLE IF NOT EXISTS movie_people (
  movie_id INTEGER,
  person_id INTEGER,
  role TEXT,             -- director | writer | actor | producer
  character TEXT,
  ord INTEGER,
  PRIMARY KEY (movie_id, person_id, role)
);
CREATE INDEX IF NOT EXISTS idx_mp_person ON movie_people(person_id, role);
CREATE INDEX IF NOT EXISTS idx_mp_movie ON movie_people(movie_id);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT,             -- genre | country | collection | label | studio
  name TEXT,
  UNIQUE (type, name)
);

CREATE TABLE IF NOT EXISTS movie_tags (
  movie_id INTEGER,
  tag_id INTEGER,
  PRIMARY KEY (movie_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_mt_tag ON movie_tags(tag_id);

CREATE TABLE IF NOT EXISTS tmdb_cache (
  key TEXT PRIMARY KEY,
  json TEXT,
  fetched_at INTEGER
);

CREATE TABLE IF NOT EXISTS tracked_people (
  person_id INTEGER PRIMARY KEY,
  added_at INTEGER
);

CREATE TABLE IF NOT EXISTS lb_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list TEXT,             -- diary | ratings | watched | watchlist
  title TEXT,
  year INTEGER,
  rating REAL,           -- 0.5 - 5.0
  watched_date TEXT,
  uri TEXT,
  movie_id INTEGER,      -- matched library movie (nullable)
  UNIQUE (list, title, year, watched_date, uri)
);
CREATE INDEX IF NOT EXISTS idx_lb_list ON lb_entries(list);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER,
  finished_at INTEGER,
  status TEXT,
  detail TEXT
);
`);

// --- settings helpers -------------------------------------------------------

const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

export function getSetting(key, fallback = null) {
  const row = getStmt.get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  setStmt.run(key, value == null ? null : String(value));
}

export function getAllSettings() {
  const out = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value;
  return out;
}

// --- tmdb cache helpers -----------------------------------------------------

const cacheGet = db.prepare('SELECT json, fetched_at FROM tmdb_cache WHERE key = ?');
const cacheSet = db.prepare(
  'INSERT INTO tmdb_cache (key, json, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at'
);

export function cacheRead(key, maxAgeMs) {
  const row = cacheGet.get(key);
  if (!row) return null;
  if (maxAgeMs != null && Date.now() - row.fetched_at > maxAgeMs) return null;
  try {
    return JSON.parse(row.json);
  } catch {
    return null;
  }
}

export function cacheWrite(key, value) {
  cacheSet.run(key, JSON.stringify(value), Date.now());
}
