import { db, getSetting } from './db.js';

// Which external rating sources to surface (#12). Empty/unset = all on.
export const ALL_RATING_SOURCES = ['imdb', 'rt_critic', 'rt_audience', 'metacritic', 'letterboxd', 'trakt', 'score'];
export function enabledRatingSources() {
  const raw = getSetting('ratings_sources');
  if (raw == null) return new Set(ALL_RATING_SOURCES); // unset = show all
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean)); // empty = show none
}
export function filterRatings(ratings) {
  if (!ratings) return ratings;
  const on = enabledRatingSources();
  const out = {};
  for (const [k, v] of Object.entries(ratings)) {
    // always keep vote-count helpers; gate the headline numbers
    if (k.endsWith('_votes') || on.has(k)) out[k] = v;
    else out[k] = null;
  }
  return out;
}

// A film counts as "watched" if Plex has a view OR it's marked watched on
// Letterboxd (import or RSS). Used everywhere the app talks about "vistas" (#1).
export const LB_WATCHED_KEYS =
  `(SELECT movie_id FROM lb_entries WHERE movie_id IS NOT NULL AND list IN ('diary','watched','ratings'))`;
export const WATCHED = `(m.view_count > 0 OR m.rating_key IN ${LB_WATCHED_KEYS})`;
export const UNWATCHED = `(m.view_count = 0 AND m.rating_key NOT IN ${LB_WATCHED_KEYS})`;

// --- dashboard ---------------------------------------------------------------

export function overview() {
  const t = (sql, ...args) => db.prepare(sql).get(...args);
  const movies = t('SELECT COUNT(*) n FROM movies').n;
  return {
    movies,
    hours: Math.round((t('SELECT SUM(duration_ms) s FROM movies').s || 0) / 3600000),
    sizeBytes: t('SELECT SUM(size_bytes) s FROM movies').s || 0,
    watched: t(`SELECT COUNT(*) n FROM movies m WHERE ${WATCHED}`).n,
    watchedPlex: t('SELECT COUNT(*) n FROM movies WHERE view_count > 0').n,
    rated: t('SELECT COUNT(*) n FROM movies WHERE user_rating IS NOT NULL').n,
    directors: t(`SELECT COUNT(DISTINCT person_id) n FROM movie_people WHERE role = 'director'`).n,
    actors: t(`SELECT COUNT(DISTINCT person_id) n FROM movie_people WHERE role = 'actor'`).n,
    genres: t(`SELECT COUNT(*) n FROM tags WHERE type = 'genre'`).n,
    countries: t(`SELECT COUNT(*) n FROM tags WHERE type = 'country'`).n,
    collections: t(`SELECT COUNT(*) n FROM tags WHERE type = 'collection'`).n,
    withTmdb: t('SELECT COUNT(*) n FROM movies WHERE tmdb_id IS NOT NULL').n,
    fourK: t(`SELECT COUNT(*) n FROM movies WHERE resolution = '4k'`).n,
    lastAdded: t('SELECT MAX(added_at) m FROM movies').m,
  };
}

// Dashboard feeds (#8): latest added to Plex + latest watched (Plex + Letterboxd).
export function dashboardRecent() {
  const recentlyAdded = db
    .prepare(
      `SELECT rating_key, title, year, thumb, added_at FROM movies
       WHERE added_at IS NOT NULL ORDER BY added_at DESC LIMIT 12`
    )
    .all();

  const plexWatched = db
    .prepare(
      `SELECT rating_key, title, year, thumb, tmdb_id, last_viewed_at FROM movies
       WHERE last_viewed_at IS NOT NULL ORDER BY last_viewed_at DESC LIMIT 20`
    )
    .all()
    .map((m) => ({
      rating_key: m.rating_key,
      title: m.title,
      year: m.year,
      thumb: !!m.thumb,
      tmdb_id: m.tmdb_id,
      inLibrary: true,
      date: new Date(m.last_viewed_at * 1000).toISOString().slice(0, 10),
    }));

  const lbWatched = db
    .prepare(
      `SELECT e.title, e.year, e.rating, e.watched_date, e.movie_id, e.tmdb_id, m.thumb, m.tmdb_id AS lib_tmdb
       FROM lb_entries e LEFT JOIN movies m ON m.rating_key = e.movie_id
       WHERE e.list IN ('diary','watched') AND e.watched_date IS NOT NULL
       ORDER BY e.watched_date DESC LIMIT 30`
    )
    .all()
    .map((e) => ({
      rating_key: e.movie_id || null,
      title: e.title,
      year: e.year,
      thumb: !!e.thumb,
      tmdb_id: e.lib_tmdb || e.tmdb_id || null,
      rating: e.rating,
      inLibrary: !!e.movie_id,
      date: e.watched_date,
    }));

  // merge, dedupe by title+year keeping the most recent watch; a film in Plex
  // always wins so it shows the Plex badge/poster even if the watch came from LB
  const seen = new Map();
  for (const w of [...plexWatched, ...lbWatched]) {
    const key = w.rating_key ? `k${w.rating_key}` : `${w.title?.toLowerCase()}|${w.year || ''}`;
    const prev = seen.get(key);
    if (!prev) { seen.set(key, w); continue; }
    seen.set(key, {
      ...prev, ...w,
      inLibrary: prev.inLibrary || w.inLibrary,
      rating_key: prev.rating_key || w.rating_key,
      tmdb_id: prev.tmdb_id || w.tmdb_id,
      date: prev.date > w.date ? prev.date : w.date,
    });
  }
  const recentlyWatched = [...seen.values()]
    .map((w) => ({ ...w, source: w.inLibrary ? 'plex' : 'letterboxd' }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 12);

  return { recentlyAdded, recentlyWatched, hasLb: lbWatched.length > 0 };
}

export function charts() {
  const all = (sql) => db.prepare(sql).all();
  return {
    byDecade: all(
      `SELECT (year / 10) * 10 AS decade, COUNT(*) n FROM movies WHERE year IS NOT NULL GROUP BY decade ORDER BY decade`
    ),
    byGenre: all(
      `SELECT t.name, COUNT(*) n FROM movie_tags mt JOIN tags t ON t.id = mt.tag_id
       WHERE t.type = 'genre' GROUP BY t.id ORDER BY n DESC LIMIT 20`
    ),
    byCountry: all(
      `SELECT t.name, COUNT(*) n FROM movie_tags mt JOIN tags t ON t.id = mt.tag_id
       WHERE t.type = 'country' GROUP BY t.id ORDER BY n DESC LIMIT 20`
    ),
    byResolution: all(
      `SELECT COALESCE(resolution, 'desconocida') name, COUNT(*) n FROM movies GROUP BY resolution ORDER BY n DESC`
    ),
    addedByMonth: all(
      `SELECT strftime('%Y-%m', added_at, 'unixepoch') month, COUNT(*) n FROM movies
       WHERE added_at IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 36`
    ).reverse(),
    ratingHistogram: all(
      `SELECT CAST(audience_rating AS INTEGER) bucket, COUNT(*) n FROM movies
       WHERE audience_rating IS NOT NULL GROUP BY bucket ORDER BY bucket`
    ),
    runtimeBuckets: all(
      `SELECT CASE
         WHEN duration_ms < 40*60000 THEN 'Corto (<40m)'
         WHEN duration_ms < 90*60000 THEN '40–90 m'
         WHEN duration_ms < 120*60000 THEN '90–120 m'
         WHEN duration_ms < 150*60000 THEN '120–150 m'
         ELSE '150+ m' END bucket, COUNT(*) n
       FROM movies WHERE duration_ms IS NOT NULL GROUP BY bucket`
    ),
  };
}

export function topPeople({ role = 'director', limit = 30, offset = 0, search = '', gender = '', life = '', continent = '', country = '' } = {}) {
  const conds = ['mp.role = ?'];
  const args = [role];
  if (search) { conds.push('p.name LIKE ?'); args.push(`%${search}%`); }
  if (gender === 'female') conds.push('p.gender = 1');
  if (gender === 'male') conds.push('p.gender = 2');
  if (gender === 'other') conds.push('p.gender = 3');
  if (life === 'alive') conds.push('p.deathday IS NULL AND p.details_fetched_at IS NOT NULL');
  if (life === 'dead') conds.push('p.deathday IS NOT NULL');
  if (continent) { conds.push('p.continent = ?'); args.push(continent); }
  if (country) { conds.push('p.country = ?'); args.push(country); }
  args.push(limit, offset);
  return db
    .prepare(
      `SELECT p.id, p.name, p.thumb, p.tmdb_id, p.deathday, p.gender, p.country, p.continent, COUNT(*) n,
              SUM(CASE WHEN ${WATCHED} THEN 1 ELSE 0 END) watched,
              AVG(m.audience_rating) avg_rating
       FROM movie_people mp
       JOIN people p ON p.id = mp.person_id
       JOIN movies m ON m.rating_key = mp.movie_id
       WHERE ${conds.join(' AND ')}
       GROUP BY p.id ORDER BY n DESC, p.name LIMIT ? OFFSET ?`
    )
    .all(...args);
}

// Distinct continents/countries present among enriched people, for the filters.
export function peopleFilterOptions() {
  return {
    continents: db.prepare(`SELECT DISTINCT continent name FROM people WHERE continent IS NOT NULL ORDER BY continent`).all().map((r) => r.name),
    countries: db.prepare(`SELECT country name, COUNT(*) n FROM people WHERE country IS NOT NULL GROUP BY country ORDER BY n DESC LIMIT 60`).all().map((r) => r.name),
    enriched: db.prepare(`SELECT COUNT(*) n FROM people WHERE details_fetched_at IS NOT NULL`).get().n,
  };
}

// --- library listing with letterboxd-style filters ----------------------------

const SORTS = {
  added: 'm.added_at DESC',
  release: 'm.release_date DESC',
  release_asc: 'm.release_date ASC',
  title: 'm.sort_title COLLATE NOCASE ASC',
  rating: 'm.audience_rating DESC',
  user_rating: 'm.user_rating DESC',
  runtime: 'm.duration_ms DESC',
  runtime_asc: 'm.duration_ms ASC',
  size: 'm.size_bytes DESC',
  year: 'm.year DESC',
  year_asc: 'm.year ASC',
  last_viewed: 'm.last_viewed_at DESC',
  random: 'RANDOM()',
  imdb: 'r.imdb DESC NULLS LAST',
  rt_critic: 'r.rt_critic DESC NULLS LAST',
  letterboxd: 'r.letterboxd DESC NULLS LAST',
  mdb_score: 'r.score DESC NULLS LAST',
};

export function listMovies(q) {
  const where = [];
  const args = [];
  const joins = [];

  if (q.search) {
    where.push('(m.title LIKE ? OR m.original_title LIKE ?)');
    args.push(`%${q.search}%`, `%${q.search}%`);
  }
  const tagFilter = (type, values, i) => {
    const alias = `mt${i}`;
    joins.push(
      `JOIN movie_tags ${alias} ON ${alias}.movie_id = m.rating_key AND ${alias}.tag_id IN (
         SELECT id FROM tags WHERE type = '${type}' AND name IN (${values.map(() => '?').join(',')}))`
    );
    args.push(...values);
  };
  if (q.genres?.length) tagFilter('genre', q.genres, 1);
  if (q.countries?.length) tagFilter('country', q.countries, 2);
  if (q.collection) tagFilter('collection', [q.collection], 3);

  if (q.personId) {
    joins.push('JOIN movie_people mpf ON mpf.movie_id = m.rating_key AND mpf.person_id = ?');
    args.push(Number(q.personId));
    if (q.personRole) {
      joins[joins.length - 1] += ' AND mpf.role = ?';
      args.push(q.personRole);
    }
  }
  if (q.decade) {
    where.push('m.year >= ? AND m.year < ?');
    args.push(Number(q.decade), Number(q.decade) + 10);
  }
  if (q.yearMin) { where.push('m.year >= ?'); args.push(Number(q.yearMin)); }
  if (q.yearMax) { where.push('m.year <= ?'); args.push(Number(q.yearMax)); }
  if (q.watched === 'yes') where.push(WATCHED);
  if (q.watched === 'no') where.push(UNWATCHED);
  if (q.ratingMin) { where.push('m.audience_rating >= ?'); args.push(Number(q.ratingMin)); }
  if (q.userRated === 'yes') where.push('m.user_rating IS NOT NULL');
  // Letterboxd/Academy: a short is under 40 minutes
  if (q.length === 'short') where.push('m.duration_ms < 2400000');
  if (q.length === 'feature') where.push('m.duration_ms >= 2400000');
  if (q.resolution?.length) {
    where.push(`m.resolution IN (${q.resolution.map(() => '?').join(',')})`);
    args.push(...q.resolution);
  }
  if (q.hdr === 'hdr' || q.hdr === 'yes') where.push('m.hdr IS NOT NULL');
  if (q.hdr === 'dv') where.push(`m.hdr = 'Dolby Vision'`);
  if (q.hdr === 'sdr') where.push('m.hdr IS NULL');
  if (q.imdbMin) { where.push('r.imdb >= ?'); args.push(Number(q.imdbMin)); }
  if (q.rtMin) { where.push('r.rt_critic >= ?'); args.push(Number(q.rtMin)); }
  if (q.lbMin) { where.push('r.letterboxd >= ?'); args.push(Number(q.lbMin)); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const joinSql = `LEFT JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id\n${joins.join('\n')}`;
  const order = SORTS[q.sort] || SORTS.added;
  const limit = Math.min(Number(q.limit) || 60, 200);
  const offset = Number(q.offset) || 0;

  const total = db
    .prepare(`SELECT COUNT(DISTINCT m.rating_key) n FROM movies m ${joinSql} ${whereSql}`)
    .get(...args).n;

  const rows = db
    .prepare(
      `SELECT DISTINCT m.rating_key, m.title, m.year, m.thumb, m.audience_rating, m.user_rating,
              m.duration_ms, m.resolution, m.hdr, m.view_count, m.size_bytes, m.release_date, m.added_at,
              r.imdb, r.rt_critic, r.letterboxd, r.score AS mdb_score
       FROM movies m ${joinSql} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`
    )
    .all(...args, limit, offset);

  return { total, offset, limit, movies: rows };
}

// Combined movie + person search for the command palette (#8).
export function globalSearch(term) {
  const like = `%${term}%`;
  const movies = db
    .prepare(
      `SELECT rating_key, title, year, thumb FROM movies WHERE title LIKE ? OR original_title LIKE ?
       ORDER BY view_count DESC, added_at DESC LIMIT 8`
    )
    .all(like, like);
  const rows = db
    .prepare(
      `SELECT p.id, p.name, mp.role, COUNT(*) n FROM movie_people mp JOIN people p ON p.id = mp.person_id
       WHERE p.name LIKE ? GROUP BY p.id, mp.role`
    )
    .all(like);
  const byPerson = new Map();
  for (const r of rows) {
    const cur = byPerson.get(r.id) || { id: r.id, name: r.name, role: r.role, best: 0, total: 0 };
    cur.total += r.n;
    if (r.n > cur.best) { cur.best = r.n; cur.role = r.role; }
    byPerson.set(r.id, cur);
  }
  const people = [...byPerson.values()].sort((a, b) => b.total - a.total).slice(0, 8);
  return { movies, people };
}

export function filterOptions() {
  const tagNames = (type) =>
    db
      .prepare(
        `SELECT t.name, COUNT(*) n FROM tags t JOIN movie_tags mt ON mt.tag_id = t.id
         WHERE t.type = ? GROUP BY t.id ORDER BY n DESC`
      )
      .all(type);
  return {
    genres: tagNames('genre'),
    countries: tagNames('country'),
    collections: tagNames('collection'),
    resolutions: db
      .prepare(`SELECT resolution name, COUNT(*) n FROM movies WHERE resolution IS NOT NULL GROUP BY resolution ORDER BY n DESC`)
      .all(),
    decades: db
      .prepare(`SELECT (year/10)*10 decade, COUNT(*) n FROM movies WHERE year IS NOT NULL GROUP BY decade ORDER BY decade DESC`)
      .all(),
  };
}

export function movieDetail(ratingKey) {
  const movie = db.prepare('SELECT * FROM movies WHERE rating_key = ?').get(ratingKey);
  if (!movie) return null;
  const people = db
    .prepare(
      `SELECT p.id, p.name, p.thumb, mp.role, mp.character, mp.ord FROM movie_people mp
       JOIN people p ON p.id = mp.person_id WHERE mp.movie_id = ? ORDER BY mp.role, mp.ord`
    )
    .all(ratingKey);
  const tags = db
    .prepare(
      `SELECT t.type, t.name FROM movie_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.movie_id = ?`
    )
    .all(ratingKey);
  const lb = db.prepare('SELECT list, rating, watched_date FROM lb_entries WHERE movie_id = ?').all(ratingKey);
  const ratings = movie.tmdb_id
    ? filterRatings(db.prepare('SELECT imdb, imdb_votes, rt_critic, rt_audience, metacritic, letterboxd, trakt, score FROM mdb_ratings WHERE tmdb_id = ?').get(movie.tmdb_id) || null)
    : null;
  return { ...movie, people, tags, letterboxd: lb, ratings };
}

// --- quality / disk -----------------------------------------------------------

export function qualityOverview() {
  const all = (sql) => db.prepare(sql).all();
  return {
    byResolution: all(
      `SELECT COALESCE(resolution,'?') name, COUNT(*) n, SUM(size_bytes) size FROM movies GROUP BY resolution ORDER BY n DESC`
    ),
    byCodec: all(
      `SELECT COALESCE(video_codec,'?') name, COUNT(*) n FROM movies GROUP BY video_codec ORDER BY n DESC`
    ),
    hdr: all(`SELECT COALESCE(hdr,'SDR') name, COUNT(*) n FROM movies GROUP BY hdr ORDER BY n DESC`),
    sizeByDecade: all(
      `SELECT (year/10)*10 decade, SUM(size_bytes) size, COUNT(*) n FROM movies WHERE year IS NOT NULL GROUP BY decade ORDER BY decade`
    ),
    largest: all(
      `SELECT rating_key, title, year, thumb, size_bytes, resolution, video_codec FROM movies
       WHERE size_bytes IS NOT NULL ORDER BY size_bytes DESC LIMIT 30`
    ),
  };
}

export function upgradeCandidates({ limit = 100 } = {}) {
  // well-rated films still below 1080p; multi-platform score first when available
  return db
    .prepare(
      `SELECT m.rating_key, m.title, m.year, m.thumb, m.resolution, m.video_codec,
              m.audience_rating, m.user_rating, m.tmdb_id, m.size_bytes, r.score AS mdb_score, r.imdb
       FROM movies m LEFT JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id
       WHERE m.resolution IN ('sd','480','576','720') OR m.resolution IS NULL
       ORDER BY COALESCE(m.user_rating, 0) DESC, COALESCE(r.score, 0) DESC, COALESCE(m.audience_rating, 0) DESC
       LIMIT ?`
    )
    .all(limit);
}

export function duplicates() {
  const multiVersion = db
    .prepare(
      `SELECT rating_key, title, year, thumb, media_count, size_bytes, resolution FROM movies
       WHERE media_count > 1 ORDER BY size_bytes DESC`
    )
    .all();
  const sameTmdb = db
    .prepare(
      `SELECT tmdb_id, COUNT(*) n, GROUP_CONCAT(rating_key) keys, GROUP_CONCAT(title, ' | ') titles
       FROM movies WHERE tmdb_id IS NOT NULL GROUP BY tmdb_id HAVING n > 1`
    )
    .all();
  return { multiVersion, sameTmdb };
}

// --- watch stats ---------------------------------------------------------------

export function watchStats() {
  const all = (sql) => db.prepare(sql).all();
  const W = `CASE WHEN ${WATCHED} THEN 1 ELSE 0 END`;
  return {
    watchedByDecade: all(
      `SELECT (year/10)*10 decade, SUM(${W}) watched, COUNT(*) total
       FROM movies m WHERE year IS NOT NULL GROUP BY decade ORDER BY decade`
    ),
    watchedByGenre: all(
      `SELECT t.name, SUM(${W}) watched, COUNT(*) total
       FROM movie_tags mt JOIN tags t ON t.id = mt.tag_id JOIN movies m ON m.rating_key = mt.movie_id
       WHERE t.type = 'genre' GROUP BY t.id ORDER BY total DESC LIMIT 15`
    ),
    recentlyViewed: all(
      `SELECT rating_key, title, year, thumb, last_viewed_at FROM movies
       WHERE last_viewed_at IS NOT NULL ORDER BY last_viewed_at DESC LIMIT 24`
    ),
    unwatchedTopRated: all(
      `SELECT rating_key, title, year, thumb, audience_rating FROM movies m
       WHERE ${UNWATCHED} AND audience_rating IS NOT NULL
       ORDER BY audience_rating DESC LIMIT 24`
    ),
    directorsPending: all(
      `SELECT p.id, p.name, COUNT(*) total, SUM(${W}) watched
       FROM movie_people mp JOIN people p ON p.id = mp.person_id
       JOIN movies m ON m.rating_key = mp.movie_id
       WHERE mp.role = 'director'
       GROUP BY p.id HAVING total >= 3 AND watched < total
       ORDER BY (total - watched) DESC LIMIT 20`
    ),
  };
}
