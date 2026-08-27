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
-- las parrillas de Personas, los huecos de biblioteca y los «top» filtran SOLO
-- por oficio, y con idx_mp_person (person_id primero) eso recorría la tabla
-- entera —cientos de miles de filas— montando dos B-trees temporales
CREATE INDEX IF NOT EXISTS idx_mp_role ON movie_people(role, person_id);
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
-- «Tu nota» sale SIEMPRE de aquí (SELECT MAX(rating) FROM lb_entries WHERE
-- movie_id = m.rating_key), y Visionado la pide hasta tres veces por fila sobre
-- la biblioteca entera: sin índice por movie_id cada una de esas consultas
-- recorría las miles de entradas de Letterboxd por película. Con 12.400 fichas
-- eran nueve segundos de espera en /api/mdblist/insights.
CREATE INDEX IF NOT EXISTS idx_lb_movie ON lb_entries(movie_id);

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

// Películas vetadas al pase automático de Radarr desde Cine venidero. NO es lo
// mismo que descartarlas: se siguen viendo en todas partes (es el próximo
// estreno de un favorito) y se pueden mandar a Radarr a mano; lo único que pasa
// es que el robot nocturno no las toca.
db.exec(`CREATE TABLE IF NOT EXISTS auto_radarr_vetoed (
  tmdb_id INTEGER PRIMARY KEY,
  title TEXT,
  at INTEGER
);`);

// Las REGLAS automáticas a Radarr (1.07). Cada fila es una regla independiente
// —«el palmarés de Cannes con Σ ≥ 70», «los estrenos en cines de España con
// Σ ≥ 65 en la quincena de su estreno», «lo que dirijan mis favoritos»— y se
// activa, se afina y se apaga por separado.
//
//  - `kind` + `source` + `scope` identifican QUÉ mira: festival:cannes:palmares,
//    estrenos:cine-es, favoritos:director. El índice único evita duplicarla.
//  - `min_score` es el umbral Σ de 0 a 100. CERO significa «sin filtro»: entra
//    todo, tenga nota o no. Con umbral, lo que aún no tiene nota ESPERA a la
//    siguiente pasada en vez de irse a ciegas — salvo que `allow_unrated` diga
//    lo contrario.
//  - `cap` es el tope por pasada (0 = sin tope). Un palmarés entero son cientos
//    de películas: sin tope, la primera noche te vacía el disco.
db.exec(`CREATE TABLE IF NOT EXISTS radarr_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  min_score INTEGER NOT NULL DEFAULT 0,
  allow_unrated INTEGER NOT NULL DEFAULT 0,
  cap INTEGER NOT NULL DEFAULT 20,
  window_days INTEGER,
  editions INTEGER,
  months INTEGER,
  lookback_days INTEGER,
  include_docs INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER,
  last_run_at INTEGER,
  last_considered INTEGER,
  last_added INTEGER,
  last_error TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_radarr_rules_uniq ON radarr_rules(kind, source, scope);`);
// La 1.07 ya está desplegada, así que esta columna sí necesita migración de
// verdad. Es el umbral de la regla de EMERGENTES (0-100 del detector), que no
// es el mismo número que `min_score`: aquel es la Σ de MDBList de la película y
// este es la puntuación de la persona que la dirige.
ensureColumn('radarr_rules', 'min_emerging', 'min_emerging INTEGER');

// Qué hizo cada regla y POR QUÉ. Sin esto, «0 añadidas» es indistinguible de
// una avería: aquí queda escrito si fue el umbral, el veto, el tope o que ya la
// tenías. Se poda a 30 días en cada pasada.
db.exec(`CREATE TABLE IF NOT EXISTS radarr_rule_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  tmdb_id INTEGER,
  title TEXT,
  score INTEGER,
  action TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_rrl_at ON radarr_rule_log(at);
CREATE INDEX IF NOT EXISTS idx_rrl_rule ON radarr_rule_log(rule_id, at);`);
// A CUENTA DE QUIÉN entró cada película. El pase de favoritos ya sabe de qué
// persona sale cada candidata (`candidatasDeFavoritos` la trae en `person`),
// pero el log solo guardaba el rótulo de la regla —«Mis directores/as
// favoritos»—, así que el Dashboard no podía decir «esta la trajo Fulana».
// Las filas viejas se quedan a null: se pintan con el rótulo de su regla.
ensureColumn('radarr_rule_log', 'person', 'person TEXT');

// CUARENTENA PRE-RADARR: lo que una regla habría mandado a Radarr pero cumple
// alguno de los criterios sospechosos (idioma, país), y por tanto espera tu ✓.
// No es un veto: es un «esto decídelo tú». Aprobarla la manda a Radarr;
// rechazarla la veta para que ninguna regla vuelva a proponerla.
// El motivo va PARTIDO en `reason_kind` (idioma|pais) y `reason_value` (hi, IN)
// además del texto: una bandeja que se lee en inglés no puede enseñar «idioma
// hi» en castellano, y componer la frase en el servidor es justo lo que deja
// sin traducir a los avisos viejos. El texto de `reason` se queda para el
// historial de reglas, que sí es castellano por diseño.
db.exec(`CREATE TABLE IF NOT EXISTS radarr_pending (
  tmdb_id INTEGER PRIMARY KEY,
  title TEXT,
  year INTEGER,
  score INTEGER,
  poster_path TEXT,
  rule_id INTEGER,
  rule_label TEXT,
  reason TEXT,
  reason_kind TEXT,
  reason_value TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pending_at ON radarr_pending(at);`);
// la tabla nació en esta misma versión sin publicar, así que no hay bases en
// producción con la forma vieja — pero sí bases de desarrollo, y un CREATE IF
// NOT EXISTS no añade columnas a una tabla que ya existe
ensureColumn('radarr_pending', 'poster_path', 'poster_path TEXT');
ensureColumn('radarr_pending', 'reason_kind', 'reason_kind TEXT');
ensureColumn('radarr_pending', 'reason_value', 'reason_value TEXT');

// DIRECTORES EMERGENTES. Las dos primeras tablas son un CACHÉ: se borran y se
// reconstruyen enteras en cada pasada del detector, y nada que hayas decidido
// tú vive en ellas. Lo tuyo —a quién sigues— está en tracked_people, y la ✕
// tiene su propia tabla justo por eso: una reconstrucción no puede resucitar a
// quien ya dijiste que no.
db.exec(`CREATE TABLE IF NOT EXISTS emerging_directors (
  name_key TEXT PRIMARY KEY,        -- normName(nombre): la misma clave que usa el resto de la app
  name TEXT,
  tmdb_id INTEGER,
  profile_path TEXT,
  birthday TEXT,
  gender INTEGER,
  country TEXT,
  continent TEXT,
  features INTEGER,                 -- largometrajes dirigidos y estrenados
  first_year INTEGER,               -- año de su primer largo
  last_title TEXT,
  last_year INTEGER,
  last_tmdb_id INTEGER,
  last_poster TEXT,
  score INTEGER,                    -- 0-100
  breakdown TEXT,                   -- JSON: el desglose que la ficha ENSEÑA
  computed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_emerg_score ON emerging_directors(score DESC);

CREATE TABLE IF NOT EXISTS emerging_signals (
  name_key TEXT NOT NULL,
  festival TEXT NOT NULL,
  year INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  winner INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (name_key, festival, year, title)
);

CREATE TABLE IF NOT EXISTS emerging_dismissed (
  name_key TEXT PRIMARY KEY,
  at INTEGER
);`);

// La 1.04 guardó aquí las pistas de audio y subtítulo para auditar subtítulos.
// La 1.05 retira esa función —Bazarr ya se encarga— y con ella la tabla, que
// en una biblioteca grande eran más de cien mil filas de dato muerto.
db.exec('DROP TABLE IF EXISTS movie_streams;');
// y sus ajustes: dejar ahí la API key de Bazarr sería guardar una credencial
// que ya no tiene dueño ni forma de borrarse desde la interfaz
db.exec("DELETE FROM settings WHERE key IN ('subs_ok_langs', 'bazarr_url', 'bazarr_key');");

// Notas y votos de IMDb, del volcado diario no comercial. Es la fuente más
// completa de las tres (TMDB, Letterboxd vía MDBList, IMDb) y la única que no
// gasta peticiones de API.
db.exec(`CREATE TABLE IF NOT EXISTS imdb_ratings (
  tconst TEXT PRIMARY KEY,
  rating REAL,
  votes INTEGER
);`);

// EL CINE POR PAÍSES.
//
// `country_films` es el índice construido: las mejores de cada país según
// Letterboxd, con su puesto histórico y su puesto dentro de su año. Es una
// tabla y no una entrada de `tmdb_cache` porque se consulta POR AÑO, y filtrar
// eso dentro de un JSON cacheado obliga a traerse el país entero para pintar
// una década.
//
// `motivo` guarda por qué entró cada película —el país de origen de TMDB, la
// nacionalidad de quien dirige, o tu mano— porque la atribución falla en las
// dos direcciones y sin el motivo delante no se puede juzgar si falló.
db.exec(`CREATE TABLE IF NOT EXISTS country_films (
  iso TEXT NOT NULL,
  fuente TEXT NOT NULL DEFAULT 'lb',   -- lb (Letterboxd, la nuestra) | fa (el ranking de FilmAffinity)
  tmdb_id INTEGER NOT NULL,
  title TEXT,
  original_title TEXT,
  year INTEGER,
  poster TEXT,
  lb REAL,                 -- nota de Letterboxd (un decimal: es lo que da MDBList)
  lb_votes INTEGER,
  sigma INTEGER,           -- la Σ de MDBList, que se ENSEÑA pero no ordena
  imdb REAL,
  avales INTEGER DEFAULT 0,   -- en cuántos premios y cánones está: el desempate
  ganados INTEGER DEFAULT 0,
  director TEXT,
  director_iso TEXT,
  origen TEXT,             -- los iso de origin_country de TMDB, separados por coma
  motivo TEXT,             -- origen | director | manual
  rank_global INTEGER,
  rank_anio INTEGER,
  PRIMARY KEY (iso, fuente, tmdb_id)
);

-- Las correcciones a mano, que aquí NO son un lujo: TMDB tiene a «Viridiana»
-- por mexicana y da «La batalla de Chile» por española. Sobreviven a cada
-- reconstrucción, como las de Festivales.
CREATE TABLE IF NOT EXISTS country_overrides (
  iso TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  modo TEXT NOT NULL,      -- add | drop
  title TEXT,
  at INTEGER,
  PRIMARY KEY (iso, tmdb_id)
);

CREATE TABLE IF NOT EXISTS country_builds (
  iso TEXT NOT NULL,
  fuente TEXT NOT NULL DEFAULT 'lb',
  at INTEGER,
  candidatos INTEGER,
  con_nota INTEGER,
  guardadas INTEGER,
  del_palmares INTEGER DEFAULT 0,   -- cuántas candidatas puso el palmarés y no TMDB
  sin_cupo INTEGER DEFAULT 0,       -- notas que quedaron por pedir al agotarse el cupo de MDBList
  segundos INTEGER,
  error TEXT,
  PRIMARY KEY (iso, fuente)
);`);

// Las columnas que llegaron después del primer CREATE. `IF NOT EXISTS` da por
// buena una tabla vieja y sigue, así que sin esto el CREATE INDEX de arriba
// —o el primer INSERT— revienta contra una columna que no está. Y como todo
// esto corre al IMPORTAR el módulo, no es una página rota: es el servidor que
// no arranca, o sea el contenedor en bucle de reinicio con el fallo enterrado
// en los logs. Cuesta tres líneas y quita esa clase de avería entera.
ensureColumn('country_films', 'fuente', "fuente TEXT NOT NULL DEFAULT 'lb'");
ensureColumn('country_builds', 'fuente', "fuente TEXT NOT NULL DEFAULT 'lb'");
ensureColumn('country_builds', 'del_palmares', 'del_palmares INTEGER DEFAULT 0');
ensureColumn('country_builds', 'sin_cupo', 'sin_cupo INTEGER DEFAULT 0');

// Los índices van DETRÁS de las columnas, no dentro del CREATE TABLE: si la
// tabla ya existía sin `fuente`, un índice que la nombra revienta antes de que
// nadie haya podido añadirla.
db.exec(`CREATE INDEX IF NOT EXISTS idx_cf_global ON country_films(iso, fuente, rank_global);
CREATE INDEX IF NOT EXISTS idx_cf_anio ON country_films(iso, fuente, year, rank_anio);`);

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

/**
 * PODA DE LA BASE: fuera lo que ya no puede leer nadie.
 *
 * Hasta aquí, de `tmdb_cache` solo se borraban dos cosas: lo que quedaba
 * obsoleto al subir una versión de caché, y lo que se invalidaba a mano. Lo que
 * simplemente CADUCA no lo borraba nadie, así que la tabla crecía de forma
 * monótona —fichas de películas, filmografías, búsquedas de personas,
 * proveedores— y con ella la copia de seguridad de cada noche.
 *
 * Los plazos de abajo no son un número al azar. Todas las lecturas de caché de
 * la aplicación pasan un TTL (no hay ni una `cacheRead` sin plazo), y el más
 * largo de todos es el año del emparejado por película (`film_match:`); el
 * siguiente son los 180 días de la edición de un festival ya pasado. Con ese
 * margen, lo que se borra aquí es lo que NINGUNA lectura podría aceptar ya.
 *
 * Devuelve qué se ha tirado, para poder decirlo en el histórico del pase.
 */
const PODA = [
  // el emparejado por película vive un año: se le da margen de sobra
  { patron: 'film_match:%', dias: 400 },
  // todo lo demás caduca como mucho a los 180 días
  { patron: null, dias: 200 },
];

export function podarCaches() {
  const borradas = {};
  let total = 0;
  for (const { patron, dias } of PODA) {
    const corte = Date.now() - dias * 24 * 3600 * 1000;
    const n = patron
      ? db.prepare('DELETE FROM tmdb_cache WHERE key LIKE ? AND fetched_at < ?').run(patron, corte).changes
      : db
          .prepare("DELETE FROM tmdb_cache WHERE key NOT LIKE 'film_match:%' AND fetched_at < ?")
          .run(corte).changes;
    if (n) borradas[patron || 'el resto'] = n;
    total += n;
  }
  // Los avisos del Dashboard de hace medio año no los va a leer nadie, y son la
  // otra tabla que solo crecía. Seis meses: el Dashboard mira catorce días.
  const eventos = db
    .prepare('DELETE FROM app_events WHERE created_at < ?')
    .run(Date.now() - 180 * 24 * 3600 * 1000).changes;
  // El log de reglas se poda dentro de la pasada de Radarr, pero SOLO si hay
  // reglas activas: al apagarlas todas, lo último se quedaba ahí para siempre.
  const reglas = db
    .prepare('DELETE FROM radarr_rule_log WHERE at < ?')
    .run(Date.now() - 30 * 24 * 3600 * 1000).changes;
  return { cache: total, detalle: borradas, eventos, reglas };
}

/**
 * Compactar el fichero. Borrar filas en SQLite deja las páginas libres DENTRO
 * del fichero: la base no encoge, y la copia nocturna sigue pesando lo mismo.
 * Solo se hace cuando de verdad ha caído bastante (compactar bloquea la base y
 * necesita espacio temporal, y no vale la pena por cuatro filas).
 */
export function compactar() {
  const antes = db.prepare('PRAGMA page_count').get()['page_count'];
  db.exec('VACUUM');
  const despues = db.prepare('PRAGMA page_count').get()['page_count'];
  const tam = db.prepare('PRAGMA page_size').get()['page_size'];
  return { liberado: Math.max(0, (antes - despues) * tam) };
}

export function cacheWrite(key, value) {
  cacheSet.run(key, JSON.stringify(value), Date.now());
}

// --- migración: el auto-Radarr de siempre pasa a ser una REGLA ---------------
//
// Hasta la 1.06 el pase automático era un único interruptor con sus ajustes
// sueltos (`auto_radarr_*`) y solo sabía hacer una cosa: los estrenos de tus
// directores/as favoritos. La 1.07 lo convierte en una regla más de la tabla,
// para que conviva con las de festivales y estrenos y para que también ella
// pueda llevar umbral de nota.
//
// La migración corre UNA vez y conserva el comportamiento exacto: mismo horizonte,
// mismo lookback, mismos documentales, SIN umbral (Σ 0 = todo) y SIN tope
// (cap 0), porque el pase viejo no tenía ninguno de los dos. Si estaba apagado,
// la regla nace apagada. Los ajustes viejos se dejan en su sitio: son el
// respaldo si alguien restaura una copia anterior.
{
  const yaMigrado = getStmt.get('radarr_rules_migrated');
  const hayReglas = db.prepare('SELECT COUNT(*) n FROM radarr_rules').get().n;
  // La bandera sola no basta: en una instalación NUEVA se quemaba en el primer
  // arranque creando una regla fantasma, y si después restaurabas una copia de
  // ajustes con el auto-Radarr encendido, esa configuración ya no se migraba
  // nunca. La condición de verdad es que HAYA algo que migrar.
  const hayAjustesViejos = db
    .prepare("SELECT COUNT(*) n FROM settings WHERE key LIKE 'auto\\_radarr\\_%' ESCAPE '\\'")
    .get().n;
  if (!yaMigrado && !hayReglas && hayAjustesViejos) {
    const num = (k, d) => {
      const v = Number(getStmt.get(k)?.value);
      return Number.isFinite(v) ? v : d;
    };
    db.prepare(
      `INSERT INTO radarr_rules
         (kind, source, scope, enabled, min_score, allow_unrated, cap, months, lookback_days, include_docs, created_at)
       VALUES ('favoritos', 'director', '', ?, 0, 0, 0, ?, ?, ?, ?)`
    ).run(
      getStmt.get('auto_radarr_enabled')?.value === '1' ? 1 : 0,
      num('auto_radarr_months', 6),
      num('auto_radarr_lookback_days', 0),
      getStmt.get('auto_radarr_include_docs')?.value === '1' ? 1 : 0,
      Date.now()
    );
    setStmt.run('radarr_rules_migrated', '1');
  }
}
