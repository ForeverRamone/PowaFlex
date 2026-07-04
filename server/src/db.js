import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

CREATE TABLE IF NOT EXISTS mdb_ratings (
  tmdb_id INTEGER PRIMARY KEY,
  imdb REAL,
  imdb_votes INTEGER,
  rt_critic INTEGER,
  rt_audience INTEGER,
  metacritic INTEGER,
  letterboxd REAL,
  trakt INTEGER,
  score INTEGER,          -- mdblist combined score 0-100
  json TEXT,
  fetched_at INTEGER
);

CREATE TABLE IF NOT EXISTS mdb_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mdb_id INTEGER UNIQUE,
  name TEXT,
  slug TEXT,
  user_name TEXT,
  url TEXT,
  item_count INTEGER,
  added_at INTEGER,
  refreshed_at INTEGER
);

CREATE TABLE IF NOT EXISTS mdb_list_items (
  list_id INTEGER,
  tmdb_id INTEGER,
  rank INTEGER,
  title TEXT,
  year INTEGER,
  imdb_id TEXT,
  PRIMARY KEY (list_id, tmdb_id)
);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER,
  finished_at INTEGER,
  status TEXT,
  detail TEXT
);

-- Letterboxd challenge lists (from the export zip or a pasted list URL).
CREATE TABLE IF NOT EXISTS lb_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE,
  name TEXT,
  url TEXT,
  source TEXT,            -- export | url
  official INTEGER DEFAULT 0,
  item_count INTEGER,
  added_at INTEGER,
  refreshed_at INTEGER
);
CREATE TABLE IF NOT EXISTS lb_list_items (
  list_id INTEGER,
  position INTEGER,
  title TEXT,
  year INTEGER,
  uri TEXT,
  tmdb_id INTEGER,
  movie_id INTEGER,
  PRIMARY KEY (list_id, title, year)
);
CREATE INDEX IF NOT EXISTS idx_lbli_list ON lb_list_items(list_id);

-- Snapshot of what Radarr already has, so the UI can show the green "en Radarr"
-- box without hammering Radarr on every page.
CREATE TABLE IF NOT EXISTS radarr_movies (
  tmdb_id INTEGER PRIMARY KEY,
  title TEXT,
  year INTEGER,
  added TEXT,
  has_file INTEGER,
  monitored INTEGER,
  synced_at INTEGER
);

-- TMDB collection (saga) membership per library movie, filled by a background scan.
CREATE TABLE IF NOT EXISTS movie_saga (
  movie_id INTEGER PRIMARY KEY,   -- library rating_key
  tmdb_id INTEGER,
  collection_id INTEGER,          -- NULL = scanned, belongs to no collection
  collection_name TEXT,
  scanned_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_saga_coll ON movie_saga(collection_id);
`);

// --- lightweight migrations (add columns to pre-existing tables) --------------

function ensureColumn(table, column, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${decl}`);
  }
}

// life status for people, cached so we can drop the dead from monitoring/favorites
ensureColumn('people', 'birthday', 'birthday TEXT');
ensureColumn('people', 'deathday', 'deathday TEXT');
ensureColumn('people', 'details_fetched_at', 'details_fetched_at INTEGER');

// --- settings helpers -------------------------------------------------------

const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

// Optional encryption-at-rest for credentials. When POWAFLEX_SECRET is set,
// these keys are stored as AES-256-GCM blobs; without it they stay plaintext
// (backward compatible) and we warn once. Reads are transparent either way.
const SECRET_SETTING_KEYS = new Set(['plex_token', 'tmdb_key', 'radarr_key']);
const secretKey = process.env.POWAFLEX_SECRET
  ? crypto.createHash('sha256').update(process.env.POWAFLEX_SECRET).digest()
  : null;
let warnedPlaintext = false;

function encryptValue(v) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey, iv);
  const ct = Buffer.concat([cipher.update(String(v), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

function decryptValue(v) {
  if (typeof v !== 'string' || !v.startsWith('enc:v1:') || !secretKey) return v;
  try {
    const [, , ivB, tagB, ctB] = v.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey, Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return v;
  }
}

export function getSetting(key, fallback = null) {
  const row = getStmt.get(key);
  return row ? decryptValue(row.value) : fallback;
}

export function setSetting(key, value) {
  if (value == null) return setStmt.run(key, null);
  let stored = String(value);
  if (SECRET_SETTING_KEYS.has(key) && stored && !stored.startsWith('enc:v1:')) {
    if (secretKey) stored = encryptValue(stored);
    else if (!warnedPlaintext) {
      warnedPlaintext = true;
      console.warn('[PowaFlex] Credenciales guardadas en claro. Define POWAFLEX_SECRET para cifrarlas en disco.');
    }
  }
  return setStmt.run(key, stored);
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
