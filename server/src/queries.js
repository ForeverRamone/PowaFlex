import { db } from './db.js';

// --- dashboard ---------------------------------------------------------------

export function overview() {
  const t = (sql, ...args) => db.prepare(sql).get(...args);
  const movies = t('SELECT COUNT(*) n FROM movies').n;
  return {
    movies,
    hours: Math.round((t('SELECT SUM(duration_ms) s FROM movies').s || 0) / 3600000),
    sizeBytes: t('SELECT SUM(size_bytes) s FROM movies').s || 0,
    watched: t('SELECT COUNT(*) n FROM movies WHERE view_count > 0').n,
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

export function topPeople({ role = 'director', limit = 30, offset = 0, search = '' }) {
  const where = search ? 'AND p.name LIKE ?' : '';
  const args = search ? [role, `%${search}%`, limit, offset] : [role, limit, offset];
  return db
    .prepare(
      `SELECT p.id, p.name, p.thumb, p.tmdb_id, COUNT(*) n,
              SUM(CASE WHEN m.view_count > 0 THEN 1 ELSE 0 END) watched,
              AVG(m.audience_rating) avg_rating
       FROM movie_people mp
       JOIN people p ON p.id = mp.person_id
       JOIN movies m ON m.rating_key = mp.movie_id
       WHERE mp.role = ? ${where}
       GROUP BY p.id ORDER BY n DESC, p.name LIMIT ? OFFSET ?`
    )
    .all(...args);
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
  if (q.watched === 'yes') where.push('m.view_count > 0');
  if (q.watched === 'no') where.push('(m.view_count IS NULL OR m.view_count = 0)');
  if (q.ratingMin) { where.push('m.audience_rating >= ?'); args.push(Number(q.ratingMin)); }
  if (q.userRated === 'yes') where.push('m.user_rating IS NOT NULL');
  // Letterboxd/Academy: a short is under 40 minutes
  if (q.length === 'short') where.push('m.duration_ms < 2400000');
  if (q.length === 'feature') where.push('m.duration_ms >= 2400000');
  if (q.resolution?.length) {
    where.push(`m.resolution IN (${q.resolution.map(() => '?').join(',')})`);
    args.push(...q.resolution);
  }
  if (q.hdr === 'yes') where.push('m.hdr IS NOT NULL');
  if (q.hdr === 'dv') where.push(`m.hdr = 'Dolby Vision'`);
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
    ? db.prepare('SELECT imdb, imdb_votes, rt_critic, rt_audience, metacritic, letterboxd, trakt, score FROM mdb_ratings WHERE tmdb_id = ?').get(movie.tmdb_id) || null
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
  return {
    watchedByDecade: all(
      `SELECT (year/10)*10 decade,
              SUM(CASE WHEN view_count > 0 THEN 1 ELSE 0 END) watched, COUNT(*) total
       FROM movies WHERE year IS NOT NULL GROUP BY decade ORDER BY decade`
    ),
    watchedByGenre: all(
      `SELECT t.name, SUM(CASE WHEN m.view_count > 0 THEN 1 ELSE 0 END) watched, COUNT(*) total
       FROM movie_tags mt JOIN tags t ON t.id = mt.tag_id JOIN movies m ON m.rating_key = mt.movie_id
       WHERE t.type = 'genre' GROUP BY t.id ORDER BY total DESC LIMIT 15`
    ),
    recentlyViewed: all(
      `SELECT rating_key, title, year, thumb, last_viewed_at FROM movies
       WHERE last_viewed_at IS NOT NULL ORDER BY last_viewed_at DESC LIMIT 24`
    ),
    unwatchedTopRated: all(
      `SELECT rating_key, title, year, thumb, audience_rating FROM movies
       WHERE (view_count IS NULL OR view_count = 0) AND audience_rating IS NOT NULL
       ORDER BY audience_rating DESC LIMIT 24`
    ),
    directorsPending: all(
      `SELECT p.id, p.name, COUNT(*) total,
              SUM(CASE WHEN m.view_count > 0 THEN 1 ELSE 0 END) watched
       FROM movie_people mp JOIN people p ON p.id = mp.person_id
       JOIN movies m ON m.rating_key = mp.movie_id
       WHERE mp.role = 'director'
       GROUP BY p.id HAVING total >= 3 AND watched < total
       ORDER BY (total - watched) DESC LIMIT 20`
    ),
  };
}
