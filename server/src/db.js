import Database from 'better-sqlite3';
import fs from 'node:fs';
import { staleCacheSql } from './cache-versions.js';
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

-- name is deliberately NOT unique: two different people share a name more often
-- than you'd think, and merging them mixes their filmographies. Identity comes
-- from plex_tag_id (Plex's stable per-person tag key) when Plex provides it.
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
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
  person_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'director',
  added_at INTEGER,
  PRIMARY KEY (person_id, role)
);

-- Historial del pase nocturno / «Actualizar todo». Se escribe DESPUÉS de cada
-- paso, no al final: un crash a las 03:10 deja rastro del paso exacto en que
-- murió (antes el estado vivía solo en memoria y un reinicio lo borraba todo).
CREATE TABLE IF NOT EXISTS refresh_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  trigger_kind TEXT,
  finished_at INTEGER,
  steps TEXT
);

-- Correcciones manuales de emparejado en Festivales/premios/cánones: la clave
-- es título+año+director normalizados y manda sobre la resolución automática.
CREATE TABLE IF NOT EXISTS match_overrides (
  key TEXT PRIMARY KEY,
  tmdb_id INTEGER,
  set_at INTEGER
);

-- Novedades: cosas que el pase nocturno detecta y merecen contarse (una
-- edición de festival publicada, una pedida que pasa a digital…). El UNIQUE
-- (type, ref) es la deduplicación: cada hecho se cuenta UNA vez.
CREATE TABLE IF NOT EXISTS app_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  ref TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  url TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (type, ref)
);

-- Historial de capturas: cada vez que una monitorizada de Radarr pasa de «sin
-- archivo» a «con archivo». El snapshot radarr_movies se pisa en cada sync;
-- esto es lo único que recuerda QUÉ llegó y cuándo.
CREATE TABLE IF NOT EXISTS radarr_captures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER NOT NULL,
  title TEXT,
  year INTEGER,
  quality TEXT,
  captured_at INTEGER NOT NULL
);

-- People the user explicitly removed from favorites with the "✕". Bulk/automatic
-- add operations (top-N, packs) skip these; a manual single add clears the block.
CREATE TABLE IF NOT EXISTS unfollowed_people (
  person_id INTEGER PRIMARY KEY,
  at INTEGER
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

-- Per-franchise completeness (released/owned/missing), so the Sagas list can show
-- what you're missing without opening each one. Filled from TMDB collection data.
CREATE TABLE IF NOT EXISTS saga_stats (
  collection_id INTEGER PRIMARY KEY,
  released INTEGER,
  owned INTEGER,
  missing INTEGER,
  upcoming INTEGER,
  missing_titles TEXT,
  fetched_at INTEGER
);
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
// demographics for the people filters (gender/continent/country)
ensureColumn('people', 'gender', 'gender INTEGER');          // TMDB: 1=female 2=male 3=non-binary
ensureColumn('people', 'place_of_birth', 'place_of_birth TEXT');
ensureColumn('people', 'country', 'country TEXT');
ensureColumn('people', 'continent', 'continent TEXT');

// --- people identity: Plex tag key instead of the name -----------------------
// Every Director/Writer/Role tag in a Plex metadata response carries a tagKey
// that identifies the *person* (same key across roles), so homonyms stop
// collapsing into one row. The old schema had name UNIQUE, which made two
// distinct people with the same name impossible, so the table is rebuilt
// without it (SQLite cannot drop a constraint in place).
ensureColumn('people', 'plex_tag_id', 'plex_tag_id TEXT');
// El nombre tal cual lo da Plex, antes de normalizarlo a alfabeto latino
// (`深田晃司` → `Kôji Fukada`): `name` es el que se muestra y este el suyo.
ensureColumn('people', 'plex_name', 'plex_name TEXT');
// 1 cuando el emparejado con TMDB está probado contra tus películas (ver
// resolvePerson): sin esto ganaba el homónimo más popular de la búsqueda.
ensureColumn('people', 'tmdb_verified', 'tmdb_verified INTEGER');
// cuándo se intentó verificar por última vez, para no repetir a diario un
// emparejado que ya falló (ver resolvePerson)
ensureColumn('people', 'tmdb_checked_at', 'tmdb_checked_at INTEGER');
// 1 cuando lo has elegido TÚ a mano. Manda sobre cualquier automatismo: ni
// resolvePerson lo revisa ni una sincronización lo pisa. Es la última palabra
// para los casos que ninguna regla va a acertar (homónimos, gente con la
// filmografía repartida en dos fichas de TMDB).
ensureColumn('people', 'tmdb_locked', 'tmdb_locked INTEGER');
// lo mismo para una película de la biblioteca: el emparejado que fijaste tú.
// Aquí hace más falta todavía, porque cada sincronización de Plex reescribe
// movies.tmdb_id con el guid que traiga Plex.
ensureColumn('movies', 'tmdb_locked', 'tmdb_locked INTEGER');

function dropPeopleNameUnique() {
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'people'").get()?.sql || '';
  if (!/\bname\s+TEXT\s+UNIQUE\b/i.test(sql)) return;
  const cols = db.prepare('PRAGMA table_info(people)').all();
  const defs = cols.map((c) => {
    if (c.pk) return `${c.name} INTEGER PRIMARY KEY AUTOINCREMENT`;
    let d = `${c.name} ${c.type || 'TEXT'}`;
    if (c.notnull) d += ' NOT NULL';
    if (c.dflt_value != null) d += ` DEFAULT ${c.dflt_value}`;
    return d;
  });
  const names = cols.map((c) => c.name).join(', ');
  // ids must survive: movie_people/tracked_people reference them by value
  db.exec(`
    BEGIN;
    CREATE TABLE people_new (${defs.join(', ')});
    INSERT INTO people_new (${names}) SELECT ${names} FROM people;
    DROP TABLE people;
    ALTER TABLE people_new RENAME TO people;
    COMMIT;
  `);
}
dropPeopleNameUnique();

db.exec(`
CREATE INDEX IF NOT EXISTS idx_people_name ON people(name);
CREATE INDEX IF NOT EXISTS idx_people_tmdb ON people(tmdb_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_people_tag ON people(plex_tag_id) WHERE plex_tag_id IS NOT NULL;
`);

// letterboxd entries: keep the TMDB id + poster so non-library watches still
// show artwork on the dashboard
ensureColumn('lb_entries', 'tmdb_id', 'tmdb_id INTEGER');
ensureColumn('lb_entries', 'poster_path', 'poster_path TEXT');

// The table-level UNIQUE (list, title, year, watched_date, uri) never fired for
// rows with a NULL in any of those columns — SQLite considers two NULLs
// distinct in an index — so every re-import of watchlist/ratings CSVs (no date,
// no uri) inserted the whole file again. An expression index over COALESCE'd
// columns is the equivalent that does fire; the old constraint stays (it is
// harmless and cannot be dropped without rebuilding the table).
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_lb_unique'").get()) {
  const KEY = `list, title, COALESCE(year, -1), COALESCE(watched_date, ''), COALESCE(uri, '')`;
  // keep the richest row of each group (matched to a film, with rating) before
  // the index can be created
  db.exec(`
    DELETE FROM lb_entries WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY ${KEY} ORDER BY (movie_id IS NULL), (rating IS NULL), id
        ) rn FROM lb_entries
      ) WHERE rn = 1
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_lb_unique ON lb_entries (${KEY});
  `);
}

// challenge lists can be hidden by the user without deleting them
ensureColumn('lb_lists', 'hidden', 'hidden INTEGER DEFAULT 0');

// Votos de Letterboxd por película: en TMDB apenas vota nadie y el umbral de
// ruido de Descubrir descartaba cine de verdad; Letterboxd es la señal fiable.
// La cifra ya venía en el JSON de MDBList que guardamos: se saca a columna y
// se rellena lo histórico sin gastar ni una petición.
ensureColumn('mdb_ratings', 'lb_votes', 'lb_votes INTEGER');
db.exec(`
  UPDATE mdb_ratings SET lb_votes = (
    SELECT je.value ->> '$.votes' FROM json_each(mdb_ratings.json) je
    WHERE je.value ->> '$.source' = 'letterboxd' LIMIT 1
  ) WHERE lb_votes IS NULL AND json IS NOT NULL AND json <> '[]'
`);

// TMDB English title: Plex only knows the Spanish + original titles, so
// English-titled sources (Letterboxd lists/CSVs) miss third-language films
ensureColumn('movies', 'english_title', 'english_title TEXT');
// El título de Plex tal cual, antes de normalizarlo a alfabeto latino: `title`
// es el que se muestra y este el que dice Plex, para no perderlo nunca.
ensureColumn('movies', 'plex_title', 'plex_title TEXT');

// One-time repair: the RSS import used to store rating 0 for watched-without-
// rating entries (Letterboxd's minimum is 0.5, so 0 can only be that bug)
db.exec("UPDATE lb_entries SET rating = NULL WHERE rating = 0");

// Which role you follow someone FOR. Until now this was inferred from library
// counts, so a director who had also acted got their acting credits mixed into
// gaps, calendar and stats. Existing rows are backfilled once with the old
// inference; from here on it is explicit and editable.
ensureColumn('tracked_people', 'role', "role TEXT");
db.exec(`
  UPDATE tracked_people SET role = (
    SELECT CASE WHEN COALESCE(SUM(CASE WHEN mp.role = 'director' THEN 1 END), 0)
                   >= COALESCE(SUM(CASE WHEN mp.role = 'actor' THEN 1 END), 0)
                THEN 'director' ELSE 'actor' END
    FROM movie_people mp WHERE mp.person_id = tracked_people.person_id
  ) WHERE role IS NULL;
  UPDATE tracked_people SET role = 'director' WHERE role IS NULL;
`);

// Un favorito puede tener LAS DOS facetas (Eastwood: directores Y actores).
// La tabla nació con person_id como clave primaria —una faceta por persona—,
// así que se reconstruye con clave (person_id, role). De paso, la reparación
// única en ambos sentidos: al seguido como actor/actriz que dirige 4+ de tu
// biblioteca le faltaba la faceta de director/a, y al seguido como director/a
// con 8+ interpretadas, la de actor/actriz (umbral más alto a propósito: el
// conteo de actor arrastra cameos). Mismos umbrales que followFacets (tmdb.js).
{
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tracked_people'").get()?.sql || '';
  if (!/PRIMARY KEY\s*\(\s*person_id\s*,\s*role\s*\)/i.test(sql)) {
    db.exec(`
      BEGIN;
      CREATE TABLE tracked_people_new (
        person_id INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'director',
        added_at INTEGER,
        PRIMARY KEY (person_id, role)
      );
      INSERT OR IGNORE INTO tracked_people_new (person_id, role, added_at)
        SELECT person_id, COALESCE(role, 'director'), added_at FROM tracked_people;
      DROP TABLE tracked_people;
      ALTER TABLE tracked_people_new RENAME TO tracked_people;
      INSERT OR IGNORE INTO tracked_people (person_id, role, added_at)
        SELECT t.person_id, 'director', t.added_at FROM tracked_people t
        WHERE t.role = 'actor'
          AND (SELECT COUNT(*) FROM movie_people mp
               WHERE mp.person_id = t.person_id AND mp.role = 'director') >= 4;
      INSERT OR IGNORE INTO tracked_people (person_id, role, added_at)
        SELECT t.person_id, 'actor', t.added_at FROM tracked_people t
        WHERE t.role = 'director'
          AND (SELECT COUNT(*) FROM movie_people mp
               WHERE mp.person_id = t.person_id AND mp.role = 'actor') >= 8;
      COMMIT;
    `);
  }
}

// Al arrancar, fuera todo lo cacheado con reglas ya superadas. La lista de
// versiones buenas vive en cache-versions.js, junto a las claves que las
// escriben, para que no puedan descuadrarse.
// Relleno para las filas que ya existían: sin él, `plex_name` queda NULL y la
// siguiente sincronización no reconoce a quien se haya renombrado al alfabeto
// latino (busca por name O plex_name), y crea un duplicado partiéndole la
// filmografía. Solo corre una vez, cuando la columna acaba de nacer.
db.prepare('UPDATE people SET plex_name = name WHERE plex_name IS NULL AND name IS NOT NULL').run();
db.prepare('UPDATE movies SET plex_title = title WHERE plex_title IS NULL AND title IS NOT NULL').run();

db.prepare(`DELETE FROM tmdb_cache WHERE ${staleCacheSql()}`).run();

// Cánones propios de «Grandes ausentes»: listas de directores/as pegadas por el
// usuario (la de IMDb «501 Directors», la de un libro, la que sea). Los nombres
// se guardan como JSON; se resuelven contra TMDB al construir la página.
db.exec(`CREATE TABLE IF NOT EXISTS custom_canons (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  names TEXT NOT NULL,
  source TEXT,
  created_at INTEGER
)`);

// Films explicitly marked "no me interesa" in the gaps flow: excluded from
// missing counts and suggestions until un-dismissed.
db.exec(`CREATE TABLE IF NOT EXISTS dismissed_movies (
  tmdb_id INTEGER PRIMARY KEY,
  title TEXT,
  at INTEGER
);`);

// --- settings helpers -------------------------------------------------------

const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

// Optional encryption-at-rest for credentials. When POWAFLEX_SECRET is set,
// these keys are stored as AES-256-GCM blobs; without it they stay plaintext
// (backward compatible) and we warn once. Reads are transparent either way.
/** Las credenciales: se cifran en disco y se tapan al servirlas. Una sola
 *  lista, que index.js reutiliza (estaba escrita dos veces, y bastaba añadir
 *  un servicio nuevo en una para que la otra lo dejara al descubierto). */
export const SECRET_SETTING_KEYS = new Set(['plex_token', 'tmdb_key', 'radarr_key', 'mdblist_key']);
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

let warnedUndecryptable = false;

// Un valor cifrado que no se puede abrir NO se devuelve tal cual: acabaría en
// la query de Plex y en las cabeceras de TMDB/Radarr haciéndose pasar por la
// credencial, y el usuario solo vería un 401 incomprensible. Devolviendo null,
// la app dice exactamente lo que dice cuando falta una credencial y Ajustes
// invita a volver a escribirla.
function credencialIlegible() {
  if (!warnedUndecryptable) {
    warnedUndecryptable = true;
    console.warn(
      '[PowaFlex] Hay credenciales cifradas que no se pueden descifrar: falta POWAFLEX_SECRET o ha cambiado.\n' +
      '           Restaura el secreto anterior, o vuelve a escribirlas en Ajustes para guardarlas con el actual.'
    );
  }
  return null;
}

function decryptValue(v) {
  if (typeof v !== 'string' || !v.startsWith('enc:v1:')) return v;
  if (!secretKey) return credencialIlegible();
  try {
    const [, , ivB, tagB, ctB] = v.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey, Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return credencialIlegible();
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
